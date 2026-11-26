-- 10-comptes-dossiers.sql — chaque compte a un dossier employé ; demandes d'accès RH → admin IT
-- Prérequis : scripts 08 et 09. Idempotent.
--  1. Un compte créé (invitation, tableau de bord, premier administrateur) reçoit AUTOMATIQUEMENT un dossier
--     employé : le dossier existant portant la même adresse e-mail s'il est unique, sinon un nouveau dossier
--     avec un matricule provisoire PROV-0001… Le rôle « employe » suit (script 09).
--  2. Un matricule provisoire (PROV-…) peut être remplacé UNE fois par le vrai matricule (ensuite permanent).
--  3. La DRH / le gestionnaire RH demandent l'accès d'un employé ; l'admin IT accepte (invitation) ou refuse.
--  4. Rattrapage : les comptes existants sans dossier en reçoivent un.
BEGIN;

-- ---------- 1. Matricule provisoire ----------
CREATE SEQUENCE IF NOT EXISTS public.employee_provisional_seq;

CREATE OR REPLACE FUNCTION public.next_provisional_matricule()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'PROV-' || lpad(nextval('public.employee_provisional_seq')::text, 4, '0');
$$;
REVOKE EXECUTE ON FUNCTION public.next_provisional_matricule() FROM PUBLIC, anon, authenticated;

-- Le matricule reste permanent, sauf s'il est encore provisoire.
CREATE OR REPLACE FUNCTION public.normalize_employee()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.matricule := upper(trim(NEW.matricule));
  NEW.last_name := trim(NEW.last_name);
  NEW.first_names := trim(NEW.first_names);
  IF TG_OP = 'UPDATE' AND NEW.matricule <> OLD.matricule AND OLD.matricule !~ '^PROV-[0-9]+$' THEN
    RAISE EXCEPTION 'Le matricule est permanent et ne peut pas être modifié.';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------- 2. Dossier d'un nouveau compte ----------
-- Renvoie le dossier à lier : celui qui porte la même adresse e-mail (s'il est unique, actif et libre),
-- sinon un nouveau dossier provisoire créé à partir du nom et de l'e-mail du compte.
CREATE OR REPLACE FUNCTION public.employee_for_new_account(_email text, _full_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _n int; _name text; _first text; _last text; _local text;
BEGIN
  IF COALESCE(trim(_email), '') <> '' THEN
    SELECT count(*), (array_agg(e.id))[1] INTO _n, _id
    FROM public.employees e
    WHERE e.archived_at IS NULL
      AND (lower(e.email) = lower(trim(_email)) OR lower(e.professional_email) = lower(trim(_email)))
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.employee_id = e.id);
    IF _n = 1 THEN RETURN _id; END IF;
  END IF;

  _name := NULLIF(trim(regexp_replace(COALESCE(_full_name, ''), '\s+', ' ', 'g')), '');
  _local := COALESCE(NULLIF(split_part(COALESCE(_email, ''), '@', 1), ''), 'Utilisateur');
  IF _name IS NULL THEN
    _first := 'À compléter'; _last := _local;
  ELSIF position(' ' IN _name) = 0 THEN
    _first := 'À compléter'; _last := _name;
  ELSE
    _last := substring(_name FROM '[^ ]+$');
    _first := trim(substring(_name FROM 1 FOR length(_name) - length(_last)));
  END IF;

  INSERT INTO public.employees (matricule, first_names, last_name, email)
  VALUES (public.next_provisional_matricule(), _first, _last, NULLIF(trim(_email), ''))
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.employee_for_new_account(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _emp uuid;
BEGIN
  _emp := public.employee_for_new_account(NEW.email, NEW.raw_user_meta_data ->> 'full_name');
  INSERT INTO public.profiles (id, email, full_name, employee_id)
  VALUES (NEW.id, COALESCE(NEW.email, ''), COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''), _emp);
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin_it' AND archived_at IS NULL) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin_it'), (NEW.id, 'drh');
  END IF;
  RETURN NEW;
END;
$$;

-- ---------- 3. Savoir si un employé a un compte (sans lire les profils) ----------
CREATE OR REPLACE FUNCTION public.employee_has_account(_employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_permission_on('employees', 'view', _employee_id)
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.employee_id = _employee_id AND p.archived_at IS NULL);
$$;
REVOKE EXECUTE ON FUNCTION public.employee_has_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employee_has_account(uuid) TO authenticated, service_role;

-- ---------- 4. Demandes d'accès ----------
CREATE TABLE IF NOT EXISTS public.access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  note text CHECK (note IS NULL OR length(note) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text CHECK (review_note IS NULL OR length(review_note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, archived_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS access_requests_one_pending
  ON public.access_requests (employee_id) WHERE status = 'pending' AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS access_requests_status_idx ON public.access_requests (status, created_at DESC);

DROP TRIGGER IF EXISTS access_requests_set_audit ON public.access_requests;
CREATE TRIGGER access_requests_set_audit BEFORE INSERT OR UPDATE ON public.access_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_columns();
DROP TRIGGER IF EXISTS access_requests_log_audit ON public.access_requests;
CREATE TRIGGER access_requests_log_audit AFTER INSERT OR UPDATE ON public.access_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.access_requests FROM anon, authenticated;
GRANT SELECT, INSERT ON public.access_requests TO authenticated;
GRANT ALL ON public.access_requests TO service_role;

DROP POLICY IF EXISTS "Voir demandes d'accès" ON public.access_requests;
CREATE POLICY "Voir demandes d'accès" ON public.access_requests FOR SELECT TO authenticated
  USING (public.has_permission('users', 'view') OR public.has_permission_on('employees', 'edit', employee_id));
DROP POLICY IF EXISTS "Créer demande d'accès" ON public.access_requests;
CREATE POLICY "Créer demande d'accès" ON public.access_requests FOR INSERT TO authenticated
  WITH CHECK (status = 'pending'
              AND public.has_permission_on('employees', 'edit', employee_id)
              AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.employee_id = access_requests.employee_id));

-- Décision de l'admin IT (l'invitation elle-même est envoyée par le serveur avant l'acceptation).
CREATE OR REPLACE FUNCTION public.review_access_request(_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.access_requests;
BEGIN
  IF NOT public.has_permission('users', 'create') THEN
    RAISE EXCEPTION 'Seul l''administrateur IT peut traiter une demande d''accès.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.access_requests WHERE id = _id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Demande introuvable.'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Cette demande a déjà été traitée.'; END IF;
  UPDATE public.access_requests
  SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
      reviewed_by = auth.uid(), reviewed_at = now(), review_note = NULLIF(trim(_note), '')
  WHERE id = _id;
END;
$$;

-- La demande peut être annulée par celui qui peut modifier le dossier.
CREATE OR REPLACE FUNCTION public.cancel_access_request(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.access_requests;
BEGIN
  SELECT * INTO r FROM public.access_requests WHERE id = _id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND OR r.status <> 'pending' THEN RAISE EXCEPTION 'Demande introuvable ou déjà traitée.'; END IF;
  IF NOT public.has_permission_on('employees', 'edit', r.employee_id) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''annuler cette demande.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.access_requests SET status = 'cancelled' WHERE id = _id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_access_request(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_access_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_access_request(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_access_request(uuid) TO authenticated, service_role;

-- ---------- 5. Rattrapage : les comptes actifs sans dossier en reçoivent un ----------
DO $$
DECLARE p record; _emp uuid;
BEGIN
  FOR p IN SELECT id, email, full_name FROM public.profiles WHERE employee_id IS NULL AND archived_at IS NULL LOOP
    _emp := public.employee_for_new_account(p.email, p.full_name);
    UPDATE public.profiles SET employee_id = _emp WHERE id = p.id;
  END LOOP;
END $$;

COMMIT;
