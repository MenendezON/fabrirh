-- Tests de docs/sql-manuel/14-demandes-attestations.sql (transaction annulée).
CREATE OR REPLACE FUNCTION pg_temp.act_as(_uid uuid, _aal text DEFAULT 'aal2') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated', 'aal', _aal)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
DO $$
DECLARE
  u_drh uuid := gen_random_uuid(); u_a uuid := gen_random_uuid(); u_b uuid := gen_random_uuid();
  ea uuid; eb uuid; r1 uuid; r2 uuid; n int; ok boolean; s text;
  total int := 0; failed int := 0; out text := '';
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES (u_drh, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','drh14@test.local','{"full_name":"Drh Quatorze"}',now(),now()),
         (u_a, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','a14@test.local','{"full_name":"Aa Attest"}',now(),now()),
         (u_b, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','b14@test.local','{"full_name":"Bb Autre"}',now(),now());
  DELETE FROM public.user_roles WHERE user_id IN (u_drh, u_a, u_b);
  INSERT INTO public.user_roles (user_id, role) VALUES (u_drh, 'drh');
  INSERT INTO public.employees (matricule, first_names, last_name) VALUES ('T14-A', 'Aa', 'Attest') RETURNING id INTO ea;
  INSERT INTO public.employees (matricule, first_names, last_name) VALUES ('T14-B', 'Bb', 'Autre') RETURNING id INTO eb;
  UPDATE public.profiles SET employee_id = ea WHERE id = u_a;
  UPDATE public.profiles SET employee_id = eb WHERE id = u_b;

  -- Création par l'employé
  PERFORM pg_temp.act_as(u_a);
  INSERT INTO public.document_requests (employee_id, kind, note) VALUES (ea, 'attestation_travail', 'Dossier bancaire') RETURNING id INTO r1;
  total := total + 1; ok := true; out := out || E'\n[OK] un employé demande une attestation de travail';
  INSERT INTO public.document_requests (employee_id, kind, leave_start, leave_end) VALUES (ea, 'attestation_conge', current_date - 10, current_date - 3) RETURNING id INTO r2;
  total := total + 1; out := out || E'\n[OK] un employé demande une attestation de congé avec période';

  BEGIN INSERT INTO public.document_requests (employee_id, kind) VALUES (ea, 'attestation_travail'); ok := false;
  EXCEPTION WHEN unique_violation THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] pas deux demandes en attente du même type', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  BEGIN INSERT INTO public.document_requests (employee_id, kind) VALUES (eb, 'attestation_travail'); ok := false;
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] impossible de demander pour un autre employé', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  BEGIN INSERT INTO public.document_requests (employee_id, kind, leave_start, leave_end) VALUES (eb, 'attestation_conge', current_date, current_date - 1); ok := false;
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] période de congé inversée refusée', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  BEGIN INSERT INTO public.document_requests (employee_id, kind, leave_start) VALUES (ea, 'attestation_travail', current_date); ok := false;
  EXCEPTION WHEN check_violation THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] une période n''a de sens que pour un congé', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  -- Visibilité
  SELECT count(*) INTO n FROM public.document_requests;
  total := total + 1; ok := n = 2; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] l''employé voit ses 2 demandes (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  PERFORM pg_temp.act_as(u_b);
  SELECT count(*) INTO n FROM public.document_requests;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] un autre employé ne voit rien (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  BEGIN PERFORM public.review_document_request(r1, true); ok := false; EXCEPTION WHEN OTHERS THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] un employé ne peut pas traiter une demande', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  BEGIN PERFORM public.cancel_document_request(r1); ok := false; EXCEPTION WHEN OTHERS THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] on ne peut pas annuler la demande d''un autre', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  -- Alerte RH
  PERFORM pg_temp.act_as(u_drh);
  SELECT count(*) INTO n FROM public.notifications WHERE kind = 'document_request' AND user_id = u_drh;
  total := total + 1; ok := n = 2; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] la DRH est alertée de chaque demande (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.document_requests;
  total := total + 1; ok := n = 2; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] la DRH voit les demandes (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);

  -- Décision
  PERFORM public.review_document_request(r1, true, 'À retirer au bureau RH');
  SELECT status INTO s FROM public.document_requests WHERE id = r1;
  total := total + 1; ok := s = 'fulfilled'; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] la DRH délivre l''attestation (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, s);
  BEGIN PERFORM public.review_document_request(r1, false); ok := false; EXCEPTION WHEN OTHERS THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] une demande traitée ne se retraite pas', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  PERFORM public.review_document_request(r2, false, 'Période incorrecte');
  RESET ROLE;
  SELECT count(*) INTO n FROM public.notifications WHERE kind = 'document_request_decision' AND user_id = u_a;
  total := total + 1; ok := n = 2; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] l''employé est notifié des 2 décisions (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.notifications WHERE kind = 'document_request_decision' AND user_id = u_b;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] personne d''autre n''est notifié (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);

  -- Annulation
  PERFORM pg_temp.act_as(u_a);
  INSERT INTO public.document_requests (employee_id, kind) VALUES (ea, 'attestation_travail') RETURNING id INTO r1;
  PERFORM public.cancel_document_request(r1);
  SELECT status INTO s FROM public.document_requests WHERE id = r1;
  total := total + 1; ok := s = 'cancelled'; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] l''employé annule sa demande en attente (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, s);

  RAISE EXCEPTION E'RÉSULTATS : % vérifications, % échec(s)%', total, failed, out;
END $$;
