-- Tests de docs/sql-manuel/12-periode-essai.sql (transaction annulée).
CREATE OR REPLACE FUNCTION pg_temp.act_as(_uid uuid, _aal text DEFAULT 'aal2') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated', 'aal', _aal)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
DO $$
DECLARE
  u_drh uuid := gen_random_uuid(); u_mgr uuid := gen_random_uuid();
  e1 uuid; e2 uuid; e3 uuid; c1 uuid; c2 uuid; c3 uuid; n int; ok boolean; d date;
  total int := 0; failed int := 0; out text := '';
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES (u_drh, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','drh12@test.local','{"full_name":"Drh Douze"}',now(),now()),
         (u_mgr, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','mgr12@test.local','{"full_name":"Mgr Douze"}',now(),now());
  DELETE FROM public.user_roles WHERE user_id IN (u_drh, u_mgr);
  INSERT INTO public.user_roles (user_id, role) VALUES (u_drh, 'drh'), (u_mgr, 'employe');
  INSERT INTO public.employees (matricule, first_names, last_name) VALUES ('T12-A', 'Aa', 'Essai') RETURNING id INTO e1;
  INSERT INTO public.employees (matricule, first_names, last_name) VALUES ('T12-B', 'Bb', 'Lointain') RETURNING id INTO e2;
  INSERT INTO public.employees (matricule, first_names, last_name) VALUES ('T12-C', 'Cc', 'Sans') RETURNING id INTO e3;
  -- e1 : essai de 1 mois qui se termine dans 9 jours ; e2 : essai de 2 mois à peine commencé ; e3 : pas d'essai
  INSERT INTO public.contracts (employee_id, type, start_date, duration_months, probation_months)
  VALUES (e1, 'cdd', current_date - 21, 6, 1) RETURNING id INTO c1;
  INSERT INTO public.contracts (employee_id, type, start_date, duration_months, probation_months)
  VALUES (e2, 'cdd', current_date - 2, 6, 2) RETURNING id INTO c2;
  INSERT INTO public.contracts (employee_id, type, start_date, duration_months)
  VALUES (e3, 'cdd', current_date - 21, 6) RETURNING id INTO c3;

  BEGIN INSERT INTO public.contracts (employee_id, type, start_date, probation_months) VALUES (e3, 'cdi', current_date + 400, 3); ok := false;
  EXCEPTION WHEN check_violation THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] une durée d''essai de 3 mois est refusée (1 ou 2 seulement)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  SELECT probation_end INTO d FROM public.v_probation WHERE contract_id = c1;
  total := total + 1; ok := d = (current_date - 21 + interval '1 month' - interval '1 day')::date; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] fin d''essai calculée par la vue (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, d);
  total := total + 1; ok := NOT EXISTS (SELECT 1 FROM public.v_probation WHERE contract_id = c3); IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] un contrat sans essai n''apparaît pas dans le suivi', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  -- Alerte
  DELETE FROM public.notifications WHERE kind = 'probation_ending';
  PERFORM public.generate_probation_notifications();
  SELECT count(*) INTO n FROM public.notifications WHERE kind = 'probation_ending' AND user_id = u_drh AND payload ->> 'employee_name' = 'Aa Essai';
  total := total + 1; ok := n = 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] la DRH est alertée pour l''essai qui se termine bientôt (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.notifications WHERE kind = 'probation_ending' AND payload ->> 'employee_name' = 'Bb Lointain';
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] pas d''alerte pour un essai lointain (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.notifications WHERE kind = 'probation_ending' AND user_id = u_mgr;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] un simple employé n''est pas alerté (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  PERFORM public.generate_probation_notifications();
  SELECT count(*) INTO n FROM public.notifications WHERE kind = 'probation_ending' AND user_id = u_drh AND payload ->> 'employee_name' = 'Aa Essai';
  total := total + 1; ok := n = 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] une seule alerte même si la tâche tourne deux fois (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);

  -- Renouvellement
  PERFORM pg_temp.act_as(u_mgr);
  BEGIN PERFORM public.renew_probation(c1); ok := false; EXCEPTION WHEN OTHERS THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] un simple employé ne peut pas renouveler', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  PERFORM pg_temp.act_as(u_drh);
  PERFORM public.renew_probation(c1);
  SELECT probation_end INTO d FROM public.v_probation WHERE contract_id = c1;
  total := total + 1; ok := d = (current_date - 21 + interval '2 months' - interval '1 day')::date; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] renouvelé : la fin d''essai recule d''un mois (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, d);
  BEGIN PERFORM public.renew_probation(c1); ok := false; EXCEPTION WHEN OTHERS THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] pas de second renouvellement', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  BEGIN PERFORM public.renew_probation(c3); ok := false; EXCEPTION WHEN OTHERS THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] pas de renouvellement sans période d''essai', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  total := total + 1; ok := EXISTS (SELECT 1 FROM public.v_probation WHERE contract_id = c1); IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] la DRH voit le suivi', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  PERFORM pg_temp.act_as(u_mgr);
  SELECT count(*) INTO n FROM public.v_probation;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] un simple employé ne voit aucun essai (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);

  RAISE EXCEPTION E'RÉSULTATS : % vérifications, % échec(s)%', total, failed, out;
END $$;
