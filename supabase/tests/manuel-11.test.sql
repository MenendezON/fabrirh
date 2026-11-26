-- Tests de docs/sql-manuel/11-email-pro-notification-acces.sql (transaction annulée).
CREATE OR REPLACE FUNCTION pg_temp.act_as(_uid uuid, _aal text DEFAULT 'aal2') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated', 'aal', _aal)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
DO $$
DECLARE
  u_a uuid := gen_random_uuid(); u_b uuid := gen_random_uuid(); u_adm uuid := gen_random_uuid(); u_drh uuid := gen_random_uuid();
  e_pro uuid; e_perso uuid; e_free uuid; emp uuid; n int;
  total int := 0; failed int := 0; out text := ''; ok boolean;
BEGIN
  INSERT INTO public.employees (matricule, first_names, last_name, email, professional_email) VALUES ('T11-A', 'Aa', 'Pro', 'perso.a@test.local', 'a@fabri.local') RETURNING id INTO e_pro;
  INSERT INTO public.employees (matricule, first_names, last_name, email) VALUES ('T11-B', 'Bb', 'Perso', 'b@test.local') RETURNING id INTO e_perso;
  INSERT INTO public.employees (matricule, first_names, last_name, email) VALUES ('T11-C', 'Cc', 'Libre', 'c@test.local') RETURNING id INTO e_free;

  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) VALUES
   (u_a, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','A@fabri.local','{"full_name":"Aa Pro"}',now(),now());
  total := total + 1; ok := (SELECT employee_id FROM public.profiles WHERE id = u_a) = e_pro; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] compte lié par e-mail professionnel', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) VALUES
   (u_b, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','nouveau.pro@fabri.local','{"full_name":"Nouveau Venu"}',now(),now());
  emp := (SELECT employee_id FROM public.profiles WHERE id = u_b);
  total := total + 1; ok := (SELECT professional_email FROM public.employees WHERE id = emp) = 'nouveau.pro@fabri.local'
                          AND (SELECT email FROM public.employees WHERE id = emp) IS NULL; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] dossier créé : l''adresse du compte est l''e-mail professionnel', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  -- Notification des admin IT
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) VALUES
   (u_adm, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','adm11@fabri.local','{"full_name":"Adm"}',now(),now()),
   (u_drh, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','drh11@fabri.local','{"full_name":"Drh"}',now(),now());
  DELETE FROM public.user_roles WHERE user_id IN (u_adm, u_drh);
  INSERT INTO public.user_roles (user_id, role) VALUES (u_adm, 'admin_it'), (u_drh, 'drh');
  DELETE FROM public.notifications WHERE kind = 'access_request';

  PERFORM pg_temp.act_as(u_drh);
  INSERT INTO public.access_requests (employee_id) VALUES (e_free);
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', '', true);
  SELECT count(*) INTO n FROM public.notifications WHERE kind = 'access_request' AND user_id = u_adm;
  total := total + 1; ok := n = 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] l''admin IT est notifié (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.notifications WHERE kind = 'access_request' AND user_id = u_drh;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] le demandeur n''est pas notifié (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  total := total + 1; ok := (SELECT payload ->> 'message' FROM public.notifications WHERE kind = 'access_request' AND user_id = u_adm) LIKE 'Cc Libre%';
  IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] le message nomme l''employé', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  total := total + 1; ok := EXISTS (SELECT 1 FROM public.notification_outbox o JOIN public.notifications nn ON nn.id = o.notification_id WHERE nn.kind = 'access_request' AND o.recipient_email = 'adm11@fabri.local');
  IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] un e-mail est mis en file pour l''admin IT', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  RAISE EXCEPTION E'RÉSULTATS : % vérifications, % échec(s)%', total, failed, out;
END $$;
