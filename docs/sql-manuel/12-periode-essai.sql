-- 12-periode-essai.sql — suivi de la période d'essai (1 ou 2 mois, renouvelable une fois) et alerte à la RH
-- Prérequis : scripts 05 et 10. Idempotent.
--  1. Le contrat porte une durée d'essai (1 ou 2 mois) et un indicateur de renouvellement (une seule fois,
--     pour la même durée). La date de fin d'essai est CALCULÉE (vue), jamais stockée.
--  2. Vue v_probation : essais en cours (ou terminés depuis moins de 30 jours) des employés en poste.
--  3. Paramètre « Délai de notification — fin de période d'essai » (15 jours) ; destinataires DRH et gestionnaire RH.
--  4. Fonction quotidienne generate_probation_notifications() et tâche planifiée à 06 h 30 (si pg_cron existe).
BEGIN;

-- ---------- 1. Colonnes ----------
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS probation_months smallint;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS probation_renewed boolean NOT NULL DEFAULT false;
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_probation_rule;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_probation_rule CHECK (
  (probation_months IS NULL OR probation_months IN (1, 2))
  AND (NOT probation_renewed OR probation_months IS NOT NULL)
);

-- ---------- 2. Vue de suivi ----------
-- Dernier jour de l'essai : début + durée (doublée si renouvelé) − 1 jour.
CREATE OR REPLACE FUNCTION public.probation_end(_start date, _months int, _renewed boolean)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT (_start + make_interval(months => _months * CASE WHEN _renewed THEN 2 ELSE 1 END))::date - 1;
$$;

CREATE OR REPLACE VIEW public.v_probation WITH (security_invoker = true) AS
SELECT
  e.employee_id, e.matricule, e.first_names, e.last_name, e.primary_site_id, e.org_unit_id,
  c.id AS contract_id, c.type AS contract_type, c.start_date AS contract_start,
  c.probation_months, c.probation_renewed,
  public.probation_end(c.start_date, c.probation_months, c.probation_renewed) AS probation_end,
  (public.probation_end(c.start_date, c.probation_months, c.probation_renewed) - current_date) AS days_remaining,
  (NOT c.probation_renewed) AS can_renew
FROM public.contracts c
JOIN public.v_employee_current e ON e.employee_id = c.employee_id
WHERE c.archived_at IS NULL AND c.terminated_on IS NULL AND c.probation_months IS NOT NULL
  AND e.archived_at IS NULL AND e.is_active
  AND public.probation_end(c.start_date, c.probation_months, c.probation_renewed) >= current_date - 30;
REVOKE ALL ON public.v_probation FROM anon;
GRANT SELECT ON public.v_probation TO authenticated;

-- Renouvellement : une seule fois, par qui peut modifier les contrats de cet employé.
CREATE OR REPLACE FUNCTION public.renew_probation(_contract_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.contracts;
BEGIN
  SELECT * INTO c FROM public.contracts WHERE id = _contract_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrat introuvable.'; END IF;
  IF NOT public.has_permission_on('contracts', 'edit', c.employee_id) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de modifier ce contrat.' USING ERRCODE = '42501';
  END IF;
  IF c.probation_months IS NULL THEN RAISE EXCEPTION 'Ce contrat n''a pas de période d''essai.'; END IF;
  IF c.probation_renewed THEN RAISE EXCEPTION 'La période d''essai a déjà été renouvelée une fois.'; END IF;
  IF public.probation_end(c.start_date, c.probation_months, c.probation_renewed) < current_date THEN
    RAISE EXCEPTION 'La période d''essai est terminée : elle ne peut plus être renouvelée.';
  END IF;
  UPDATE public.contracts SET probation_renewed = true WHERE id = _contract_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.renew_probation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renew_probation(uuid) TO authenticated, service_role;

-- ---------- 3. Paramètre et destinataires ----------
INSERT INTO public.settings (key, label, description, value, unit, sort_order)
SELECT 'notice_days_probation', 'Délai de notification — fin de période d''essai',
       'Nombre de jours avant la fin de la période d''essai pour alerter la RH.', 15, 'jours', 85
WHERE NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'notice_days_probation');

ALTER TABLE public.notification_recipients DROP CONSTRAINT IF EXISTS notification_recipients_kind_check;
ALTER TABLE public.notification_recipients ADD CONSTRAINT notification_recipients_kind_check
  CHECK (kind IN ('contract_ending','retirement_upcoming','contract_to_regularize','document_expiring','probation_ending','*'));

INSERT INTO public.notification_recipients (kind, role)
SELECT 'probation_ending', r FROM unnest(ARRAY['drh','gestionnaire_rh']::public.app_role[]) r
WHERE NOT EXISTS (SELECT 1 FROM public.notification_recipients x
                  WHERE x.kind = 'probation_ending' AND x.role = r AND x.archived_at IS NULL);

-- ---------- 4. Alerte quotidienne ----------
CREATE OR REPLACE FUNCTION public.generate_probation_notifications() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _days int; _email boolean; _count int;
BEGIN
  SELECT value INTO _days FROM public.settings WHERE key = 'notice_days_probation' AND archived_at IS NULL;
  _days := COALESCE(_days, 15);
  SELECT COALESCE(bool_or(s.value = 1), false) INTO _email
  FROM public.settings s WHERE s.key = 'notifications_email_enabled' AND s.archived_at IS NULL;

  WITH due AS (
    SELECT c.id AS contract_id, c.employee_id, e.first_names, e.last_name,
           public.probation_end(c.start_date, c.probation_months, c.probation_renewed) AS probation_end,
           c.probation_renewed
    FROM public.contracts c
    JOIN public.employees e ON e.id = c.employee_id AND e.archived_at IS NULL
    WHERE c.archived_at IS NULL AND c.terminated_on IS NULL AND c.probation_months IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.exits x WHERE x.employee_id = c.employee_id AND x.archived_at IS NULL)
      AND public.probation_end(c.start_date, c.probation_months, c.probation_renewed)
          BETWEEN current_date AND current_date + _days
  ),
  targets AS (
    SELECT DISTINCT ur.user_id, d.*
    FROM due d
    JOIN public.notification_recipients nr ON nr.archived_at IS NULL AND nr.kind IN ('probation_ending','*')
    JOIN public.user_roles ur ON ur.role = nr.role AND ur.archived_at IS NULL
    JOIN public.profiles p ON p.id = ur.user_id AND p.archived_at IS NULL
    WHERE public.in_scope_for(ur.user_id, d.employee_id)
      AND public.user_has_permission_on(ur.user_id, 'contracts', 'view', d.employee_id)
  ),
  ins AS (
    INSERT INTO public.notifications (user_id, kind, payload, dedupe_key)
    SELECT t.user_id, 'probation_ending',
           jsonb_build_object('title', 'Fin de période d''essai à venir',
                              'message', trim(t.first_names || ' ' || t.last_name) || ' — fin le '
                                         || to_char(t.probation_end, 'DD/MM/YYYY')
                                         || CASE WHEN t.probation_renewed THEN ' (déjà renouvelée)' ELSE ' (renouvelable une fois)' END,
                              'employee_id', t.employee_id, 'employee_name', trim(t.first_names || ' ' || t.last_name),
                              'contract_id', t.contract_id, 'probation_end', t.probation_end,
                              'days_remaining', (t.probation_end - current_date)),
           t.contract_id::text || ':' || t.probation_end::text
    FROM targets t
    ON CONFLICT (user_id, kind, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING id, user_id
  ),
  outbox AS (
    INSERT INTO public.notification_outbox (notification_id, channel, recipient_email)
    SELECT ins.id, 'email', p.email FROM ins JOIN public.profiles p ON p.id = ins.user_id
    WHERE _email AND p.email IS NOT NULL AND p.email <> ''
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM ins;
  RETURN _count;
END $$;
REVOKE EXECUTE ON FUNCTION public.generate_probation_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_probation_notifications() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('probation-notifications', '30 6 * * *', 'select public.generate_probation_notifications()');
  END IF;
END $$;

COMMIT;
