-- 14-demandes-attestations.sql — un employé demande à la RH une attestation de travail ou de congé.
-- Prérequis : scripts 09 et 11. Idempotent.
--   * table document_requests (RLS : l'employé voit et crée les siennes, la RH voit celles de son périmètre) ;
--   * notification des RH (DRH + gestionnaires RH dans le périmètre) à chaque demande ;
--   * décision RH (délivrée / refusée) → notification de l'employé ;
--   * annulation par l'employé tant que la demande est en attente.
BEGIN;

CREATE TABLE IF NOT EXISTS public.document_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  kind text NOT NULL CHECK (kind IN ('attestation_travail', 'attestation_conge')),
  leave_start date,
  leave_end date,
  note text CHECK (note IS NULL OR length(note) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled', 'rejected', 'cancelled')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text CHECK (review_note IS NULL OR length(review_note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, archived_at timestamptz,
  CONSTRAINT document_requests_leave_dates CHECK (
    (kind = 'attestation_conge' OR (leave_start IS NULL AND leave_end IS NULL))
    AND (leave_end IS NULL OR leave_start IS NULL OR leave_end >= leave_start))
);
CREATE UNIQUE INDEX IF NOT EXISTS document_requests_one_pending
  ON public.document_requests (employee_id, kind) WHERE status = 'pending' AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS document_requests_status_idx ON public.document_requests (status, created_at DESC);

DROP TRIGGER IF EXISTS document_requests_set_audit ON public.document_requests;
CREATE TRIGGER document_requests_set_audit BEFORE INSERT OR UPDATE ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_columns();
DROP TRIGGER IF EXISTS document_requests_log_audit ON public.document_requests;
CREATE TRIGGER document_requests_log_audit AFTER INSERT OR UPDATE ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

ALTER TABLE public.document_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_requests FROM anon, authenticated;
GRANT SELECT, INSERT ON public.document_requests TO authenticated;
GRANT ALL ON public.document_requests TO service_role;

DROP POLICY IF EXISTS "Voir demandes d'attestation" ON public.document_requests;
CREATE POLICY "Voir demandes d'attestation" ON public.document_requests FOR SELECT TO authenticated
  USING (employee_id = public.my_employee_id() OR public.has_permission_on('employees', 'edit', employee_id));
DROP POLICY IF EXISTS "Créer sa demande d'attestation" ON public.document_requests;
CREATE POLICY "Créer sa demande d'attestation" ON public.document_requests FOR INSERT TO authenticated
  WITH CHECK (employee_id = public.my_employee_id() AND status = 'pending');

-- ---------- Destinataires des alertes ----------
ALTER TABLE public.notification_recipients DROP CONSTRAINT IF EXISTS notification_recipients_kind_check;
ALTER TABLE public.notification_recipients ADD CONSTRAINT notification_recipients_kind_check
  CHECK (kind IN ('contract_ending','retirement_upcoming','contract_to_regularize','document_expiring','probation_ending','document_request','*'));

INSERT INTO public.notification_recipients (kind, role)
SELECT 'document_request', r FROM unnest(ARRAY['drh','gestionnaire_rh']::public.app_role[]) r
WHERE NOT EXISTS (SELECT 1 FROM public.notification_recipients x
                  WHERE x.kind = 'document_request' AND x.role = r AND x.archived_at IS NULL);

-- ---------- Nouvelle demande → RH ----------
CREATE OR REPLACE FUNCTION public.notify_document_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _name text; _label text;
BEGIN
  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;
  SELECT trim(first_names || ' ' || last_name) INTO _name FROM public.employees WHERE id = NEW.employee_id;
  _label := CASE NEW.kind WHEN 'attestation_conge' THEN 'attestation de congé' ELSE 'attestation de travail' END;
  WITH ins AS (
    INSERT INTO public.notifications (user_id, kind, payload, dedupe_key)
    SELECT DISTINCT ur.user_id, 'document_request',
           jsonb_build_object('title', 'Demande d''attestation à traiter',
                              'message', COALESCE(_name, 'Un employé') || ' — ' || _label,
                              'employee_id', NEW.employee_id, 'employee_name', _name, 'request_id', NEW.id),
           NEW.id::text
    FROM public.notification_recipients nr
    JOIN public.user_roles ur ON ur.role = nr.role AND ur.archived_at IS NULL
    JOIN public.profiles p ON p.id = ur.user_id AND p.archived_at IS NULL
    WHERE nr.archived_at IS NULL AND nr.kind IN ('document_request', '*')
      AND public.in_scope_for(ur.user_id, NEW.employee_id)
      AND public.user_has_permission_on(ur.user_id, 'employees', 'edit', NEW.employee_id)
    ON CONFLICT (user_id, kind, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING id, user_id
  )
  INSERT INTO public.notification_outbox (notification_id, channel, recipient_email)
  SELECT ins.id, 'email', p.email FROM ins JOIN public.profiles p ON p.id = ins.user_id
  WHERE p.email IS NOT NULL AND p.email <> '';
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_document_request() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS document_requests_notify ON public.document_requests;
CREATE TRIGGER document_requests_notify AFTER INSERT ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_document_request();

-- ---------- Décision RH → employé ----------
CREATE OR REPLACE FUNCTION public.review_document_request(_id uuid, _fulfill boolean, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.document_requests; _label text; _uid uuid; _nid uuid; _mail text;
BEGIN
  SELECT * INTO r FROM public.document_requests WHERE id = _id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Demande introuvable.'; END IF;
  IF NOT public.has_permission_on('employees', 'edit', r.employee_id) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de traiter cette demande.' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'Cette demande a déjà été traitée.'; END IF;
  UPDATE public.document_requests
  SET status = CASE WHEN _fulfill THEN 'fulfilled' ELSE 'rejected' END,
      reviewed_by = auth.uid(), reviewed_at = now(), review_note = NULLIF(trim(_note), '')
  WHERE id = _id;

  _label := CASE r.kind WHEN 'attestation_conge' THEN 'attestation de congé' ELSE 'attestation de travail' END;
  SELECT id, email INTO _uid, _mail FROM public.profiles WHERE employee_id = r.employee_id AND archived_at IS NULL;
  IF _uid IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, payload, dedupe_key)
    VALUES (_uid, 'document_request_decision',
            jsonb_build_object('title', CASE WHEN _fulfill THEN 'Votre attestation est prête' ELSE 'Demande d''attestation refusée' END,
                               'message', initcap(_label) || COALESCE(' — ' || NULLIF(trim(_note), ''), ''),
                               'employee_id', r.employee_id, 'request_id', r.id),
            r.id::text)
    ON CONFLICT (user_id, kind, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING id INTO _nid;
    IF _nid IS NOT NULL AND _mail IS NOT NULL AND _mail <> '' THEN
      INSERT INTO public.notification_outbox (notification_id, channel, recipient_email) VALUES (_nid, 'email', _mail);
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_document_request(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.document_requests SET status = 'cancelled'
  WHERE id = _id AND status = 'pending' AND archived_at IS NULL AND employee_id = public.my_employee_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Demande introuvable ou déjà traitée.'; END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_document_request(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_document_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_document_request(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_document_request(uuid) TO authenticated, service_role;

COMMIT;
