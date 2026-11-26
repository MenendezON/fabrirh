-- 11-email-pro-notification-acces.sql — e-mail professionnel prioritaire ; l'admin IT est notifié des demandes d'accès
-- Prérequis : script 10. Idempotent.
--  1. L'e-mail professionnel est l'e-mail principal : un nouveau compte cherche d'abord un dossier par e-mail
--     professionnel (puis par e-mail personnel), et le dossier créé automatiquement reçoit l'adresse du compte
--     comme e-mail PROFESSIONNEL.
--  2. Chaque nouvelle demande d'accès notifie tous les admin IT actifs (cloche + e-mail via la file d'envoi).
BEGIN;

CREATE OR REPLACE FUNCTION public.employee_for_new_account(_email text, _full_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _n int; _name text; _first text; _last text; _local text; _mail text;
BEGIN
  _mail := NULLIF(lower(trim(COALESCE(_email, ''))), '');
  IF _mail IS NOT NULL THEN
    -- 1) e-mail professionnel (prioritaire), 2) e-mail personnel ; seulement si le dossier est unique, actif et libre
    SELECT count(*), (array_agg(e.id))[1] INTO _n, _id
    FROM public.employees e
    WHERE e.archived_at IS NULL AND lower(e.professional_email) = _mail
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.employee_id = e.id);
    IF _n = 1 THEN RETURN _id; END IF;
    IF _n = 0 THEN
      SELECT count(*), (array_agg(e.id))[1] INTO _n, _id
      FROM public.employees e
      WHERE e.archived_at IS NULL AND lower(e.email) = _mail
        AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.employee_id = e.id);
      IF _n = 1 THEN RETURN _id; END IF;
    END IF;
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

  INSERT INTO public.employees (matricule, first_names, last_name, professional_email)
  VALUES (public.next_provisional_matricule(), _first, _last, _mail)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.employee_for_new_account(text, text) FROM PUBLIC, anon, authenticated;

-- Rattrapage : les dossiers provisoires créés par le script 10 avaient l'adresse du compte en e-mail personnel.
UPDATE public.employees e
SET professional_email = lower(e.email), email = NULL
WHERE e.matricule ~ '^PROV-[0-9]+$' AND e.professional_email IS NULL AND e.email IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.employee_id = e.id AND lower(p.email) = lower(e.email));

-- Notification des admin IT à chaque nouvelle demande d'accès.
CREATE OR REPLACE FUNCTION public.notify_access_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _name text; _by text;
BEGIN
  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;
  SELECT trim(first_names || ' ' || last_name) INTO _name FROM public.employees WHERE id = NEW.employee_id;
  SELECT COALESCE(NULLIF(full_name, ''), email) INTO _by FROM public.profiles WHERE id = NEW.created_by;
  WITH ins AS (
    INSERT INTO public.notifications (user_id, kind, payload, dedupe_key)
    SELECT DISTINCT ur.user_id, 'access_request',
           jsonb_build_object('title', 'Demande d''accès à traiter',
                              'message', trim(COALESCE(_name, 'Un employé') || COALESCE(' — demandé par ' || _by, '')),
                              'employee_id', NEW.employee_id, 'employee_name', _name, 'request_id', NEW.id),
           NEW.id::text
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id AND p.archived_at IS NULL
    WHERE ur.role = 'admin_it' AND ur.archived_at IS NULL
    ON CONFLICT (user_id, kind, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING id, user_id
  )
  INSERT INTO public.notification_outbox (notification_id, channel, recipient_email)
  SELECT ins.id, 'email', p.email FROM ins JOIN public.profiles p ON p.id = ins.user_id
  WHERE p.email IS NOT NULL AND p.email <> '';
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_access_request() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS access_requests_notify ON public.access_requests;
CREATE TRIGGER access_requests_notify AFTER INSERT ON public.access_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_access_request();

COMMIT;
