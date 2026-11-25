-- 09-libre-service.sql — libre-service employé : rôle « employe », droits limités à SES données,
-- attribution automatique du rôle au lien compte ↔ fiche, demandes de modification de coordonnées.
-- Prérequis : script 08. Idempotent.
BEGIN;

-- ---------- 1. Rôle et droits (périmètre « self » : uniquement sa propre fiche) ----------
INSERT INTO public.roles (code, label, requires_mfa, sort_order)
SELECT 'employe', 'Employé', false, 80
WHERE NOT EXISTS (SELECT 1 FROM public.roles WHERE code = 'employe');

INSERT INTO public.role_permissions (role_id, permission_id, scope)
SELECT r.id, p.id, v.scope
FROM (VALUES
  ('employees', 'self'), ('sensitive_data', 'self'), ('contracts', 'self'), ('assignments', 'self'),
  ('compensation', 'self'), ('documents', 'self'),
  ('referentials', 'all')   -- noms des sites, unités, postes (nécessaires à l'affichage de sa fiche)
) AS v(resource, scope)
JOIN public.roles r ON r.code = 'employe' AND r.archived_at IS NULL
JOIN public.permissions p ON p.resource = v.resource AND p.action = 'view'
WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions x WHERE x.role_id = r.id AND x.permission_id = p.id AND x.archived_at IS NULL);

-- ---------- 2. Rôle « principal » déterministe (le plus privilégié d'abord, employé en dernier) ----------
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ur.role FROM public.user_roles ur
  LEFT JOIN public.roles r ON r.code = ur.role
  WHERE ur.user_id = auth.uid() AND ur.archived_at IS NULL
  ORDER BY COALESCE(r.sort_order, 999), ur.role
  LIMIT 1;
$$;

-- ---------- 3. Lien compte ↔ fiche : unique, et rôle « employe » attribué automatiquement ----------
CREATE UNIQUE INDEX IF NOT EXISTS profiles_employee_id_key ON public.profiles (employee_id) WHERE employee_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.my_employee_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT employee_id FROM public.profiles WHERE id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.my_employee_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_employee_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sync_employee_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.employee_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id AND role = 'employe' AND archived_at IS NULL) THEN
      UPDATE public.user_roles SET archived_at = NULL WHERE user_id = NEW.id AND role = 'employe' AND archived_at IS NOT NULL;
      IF NOT FOUND THEN
        INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employe');
      END IF;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.employee_id IS NOT NULL THEN
    UPDATE public.user_roles SET archived_at = now() WHERE user_id = NEW.id AND role = 'employe' AND archived_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_employee_role() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS profiles_sync_employee_role ON public.profiles;
CREATE TRIGGER profiles_sync_employee_role AFTER INSERT OR UPDATE OF employee_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_employee_role();

-- Rattrapage : les comptes déjà liés à une fiche reçoivent le rôle.
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'employe' FROM public.profiles p
WHERE p.employee_id IS NOT NULL AND p.archived_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'employe' AND ur.archived_at IS NULL);

-- ---------- 3 bis. Un salarié ne lit pas le journal d'audit de sa propre fiche ----------
-- (la seconde branche accordait l'historique d'une fiche à qui peut la voir ; on en exclut sa propre fiche)
DROP POLICY IF EXISTS "Lire le journal" ON public.audit_log;
CREATE POLICY "Lire le journal" ON public.audit_log FOR SELECT TO authenticated
  USING (
    (public.has_permission('audit', 'view')
      AND (employee_id IS NULL OR public.can_read_audit_table(table_name, employee_id)))
    OR (employee_id IS NOT NULL
      AND employee_id IS DISTINCT FROM public.my_employee_id()
      AND public.has_permission_on('employees', 'view', employee_id)
      AND public.can_read_audit_table(table_name, employee_id))
  );

-- ---------- 4. Demandes de modification de coordonnées (validées par les RH) ----------
CREATE TABLE IF NOT EXISTS public.contact_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  changes jsonb NOT NULL,
  previous jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text CHECK (review_note IS NULL OR length(review_note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, archived_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS contact_change_one_pending
  ON public.contact_change_requests (employee_id) WHERE status = 'pending' AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS contact_change_status_idx ON public.contact_change_requests (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.validate_contact_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text; v jsonb; e public.employees;
BEGIN
  IF jsonb_typeof(NEW.changes) <> 'object' OR NEW.changes = '{}'::jsonb THEN
    RAISE EXCEPTION 'Aucune modification demandée.' USING ERRCODE = '23514';
  END IF;
  FOR k, v IN SELECT * FROM jsonb_each(NEW.changes) LOOP
    IF k NOT IN ('phone', 'address', 'marital_status', 'children_count') THEN
      RAISE EXCEPTION 'Champ non modifiable : %.', k USING ERRCODE = '23514';
    END IF;
    IF k IN ('phone', 'address') AND (jsonb_typeof(v) <> 'string' OR length(v #>> '{}') > 200) THEN
      RAISE EXCEPTION 'Valeur invalide pour %.', k USING ERRCODE = '23514';
    END IF;
    IF k = 'marital_status' AND (v #>> '{}') NOT IN ('celibataire', 'marie', 'divorce', 'veuf') THEN
      RAISE EXCEPTION 'Situation familiale invalide.' USING ERRCODE = '23514';
    END IF;
    IF k = 'children_count' AND (jsonb_typeof(v) <> 'number' OR (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric)
                                OR (v #>> '{}')::numeric NOT BETWEEN 0 AND 30) THEN
      RAISE EXCEPTION 'Nombre d''enfants invalide.' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  SELECT * INTO e FROM public.employees WHERE id = NEW.employee_id;
  NEW.previous := jsonb_build_object('phone', e.phone, 'address', e.address,
                                     'marital_status', e.marital_status, 'children_count', e.children_count);
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.validate_contact_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS contact_change_validate ON public.contact_change_requests;
CREATE TRIGGER contact_change_validate BEFORE INSERT ON public.contact_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_contact_change();
DROP TRIGGER IF EXISTS contact_change_set_audit ON public.contact_change_requests;
CREATE TRIGGER contact_change_set_audit BEFORE INSERT OR UPDATE ON public.contact_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_columns();

ALTER TABLE public.contact_change_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.contact_change_requests TO authenticated;
GRANT ALL ON public.contact_change_requests TO service_role;
DROP POLICY IF EXISTS "Voir demandes de coordonnées" ON public.contact_change_requests;
CREATE POLICY "Voir demandes de coordonnées" ON public.contact_change_requests FOR SELECT TO authenticated
  USING (employee_id = public.my_employee_id() OR public.has_permission_on('employees', 'edit', employee_id));
DROP POLICY IF EXISTS "Créer sa demande de coordonnées" ON public.contact_change_requests;
CREATE POLICY "Créer sa demande de coordonnées" ON public.contact_change_requests FOR INSERT TO authenticated
  WITH CHECK (employee_id = public.my_employee_id() AND status = 'pending');

-- Décision RH : applique les changements ou les refuse.
CREATE OR REPLACE FUNCTION public.review_contact_change(_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.contact_change_requests;
BEGIN
  SELECT * INTO r FROM public.contact_change_requests WHERE id = _id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Demande introuvable.'; END IF;
  IF NOT public.has_permission_on('employees', 'edit', r.employee_id) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de traiter cette demande.' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Cette demande a déjà été traitée.'; END IF;
  IF _approve THEN
    UPDATE public.employees SET
      phone = CASE WHEN r.changes ? 'phone' THEN r.changes ->> 'phone' ELSE phone END,
      address = CASE WHEN r.changes ? 'address' THEN r.changes ->> 'address' ELSE address END,
      marital_status = CASE WHEN r.changes ? 'marital_status' THEN r.changes ->> 'marital_status' ELSE marital_status END,
      children_count = CASE WHEN r.changes ? 'children_count' THEN (r.changes ->> 'children_count')::int ELSE children_count END
    WHERE id = r.employee_id;
  END IF;
  UPDATE public.contact_change_requests
  SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
      reviewed_by = auth.uid(), reviewed_at = now(), review_note = NULLIF(trim(_note), '')
  WHERE id = _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_contact_change(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.contact_change_requests SET status = 'cancelled'
  WHERE id = _id AND status = 'pending' AND archived_at IS NULL AND employee_id = public.my_employee_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Demande introuvable ou déjà traitée.'; END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_contact_change(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_contact_change(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_contact_change(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_contact_change(uuid) TO authenticated, service_role;

COMMIT;
