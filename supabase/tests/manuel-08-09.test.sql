-- Tests de docs/sql-manuel/08-role-employe.sql et 09-libre-service.sql (après application, avec supabase/seed.sql).
-- Transaction annulée : se termine toujours par « RÉSULTATS ».
CREATE OR REPLACE FUNCTION pg_temp.act_as(_uid uuid, _aal text DEFAULT 'aal2') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated', 'aal', _aal)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
CREATE OR REPLACE FUNCTION pg_temp.as_admin() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

DO $$
DECLARE
  u_emp uuid := gen_random_uuid(); u_other uuid := gen_random_uuid(); u_drh uuid := gen_random_uuid();
  e_a uuid; e_b uuid; e_c uuid; t_std uuid; t_conf uuid; r1 uuid; r2 uuid;
  n int; txt text; ok boolean; total int := 0; failed int := 0; out text := '';
BEGIN
  SELECT id INTO e_a FROM public.employees WHERE matricule = 'DEMO011';
  SELECT id INTO e_b FROM public.employees WHERE matricule = 'DEMO012';
  SELECT id INTO e_c FROM public.employees WHERE matricule = 'DEMO013';
  SELECT id INTO t_std FROM public.document_types WHERE confidentiality = 'standard' AND archived_at IS NULL LIMIT 1;
  SELECT id INTO t_conf FROM public.document_types WHERE confidentiality = 'confidential' AND archived_at IS NULL LIMIT 1;

  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES (u_emp, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','emp@test.local','{"full_name":"emp"}',now(),now()),
         (u_other, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','other@test.local','{"full_name":"other"}',now(),now()),
         (u_drh, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','drh@test.local','{"full_name":"drh"}',now(),now());
  DELETE FROM public.user_roles WHERE user_id IN (u_emp, u_other, u_drh);
  INSERT INTO public.user_roles (user_id, role) VALUES (u_drh, 'drh');
  UPDATE public.profiles SET employee_id = e_a WHERE id = u_emp;
  UPDATE public.profiles SET employee_id = e_b WHERE id = u_other;
  UPDATE public.profiles SET employee_id = e_c WHERE id = u_drh;

  INSERT INTO public.documents (employee_id, document_type_id, storage_path, file_name, mime_type, size_bytes)
  VALUES (e_a, t_std, e_a || '/' || gen_random_uuid(), 'std.pdf', 'application/pdf', 100),
         (e_a, t_conf, e_a || '/' || gen_random_uuid(), 'conf.pdf', 'application/pdf', 100),
         (e_b, t_std, e_b || '/' || gen_random_uuid(), 'autre.pdf', 'application/pdf', 100);

  -- ---------- rôle, droits, attribution automatique ----------
  SELECT count(*) INTO n FROM public.role_permissions rp JOIN public.roles r ON r.id = rp.role_id
  WHERE r.code = 'employe' AND rp.archived_at IS NULL;
  total := total + 1; ok := n = 7; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] le rôle employé a 7 droits (6 en lecture « self » + référentiels) (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.role_permissions rp JOIN public.roles r ON r.id = rp.role_id JOIN public.permissions p ON p.id = rp.permission_id
  WHERE r.code = 'employe' AND rp.archived_at IS NULL AND (p.action <> 'view' OR (rp.scope <> 'self' AND p.resource <> 'referentials'));
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] aucun droit d''écriture ni d''étendue large pour l''employé (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.user_roles WHERE user_id = u_emp AND role = 'employe' AND archived_at IS NULL;
  total := total + 1; ok := n = 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] lier le compte à la fiche attribue le rôle employé', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  -- ---------- libre-service : ses propres données seulement ----------
  PERFORM pg_temp.act_as(u_emp);
  SELECT public.get_my_role()::text INTO txt;
  total := total + 1; ok := txt = 'employe'; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] rôle principal = employe (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, txt);
  SELECT count(*) INTO n FROM public.employees;
  total := total + 1; ok := n = 1 AND (SELECT id FROM public.employees) = e_a; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] ne voit que sa fiche (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.v_employee_current;
  total := total + 1; ok := n = 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] la vue « fiche courante » ne montre que lui (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.compensation WHERE employee_id <> e_a;
  total := total + 1; ok := n = 0 AND EXISTS (SELECT 1 FROM public.compensation WHERE employee_id = e_a); IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] voit sa rémunération et aucune autre (%s autres)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.contracts WHERE employee_id <> e_a;
  total := total + 1; ok := n = 0 AND EXISTS (SELECT 1 FROM public.contracts WHERE employee_id = e_a); IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] voit ses contrats et aucun autre (%s autres)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.documents;
  total := total + 1; ok := n = 1 AND (SELECT file_name FROM public.documents) = 'std.pdf'; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] voit son document standard, ni le confidentiel ni celui d''un collègue (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.audit_log;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] ne lit pas le journal d''audit (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.sites;
  total := total + 1; ok := n > 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] lit les référentiels nécessaires à l''affichage (sites : %s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  total := total + 1; ok := NOT public.has_permission_on('reviews', 'view', e_a); IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] pas d''accès à ses propres appréciations', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  BEGIN
    UPDATE public.employees SET phone = '000' WHERE id = e_a; GET DIAGNOSTICS n = ROW_COUNT; ok := n = 0;
  EXCEPTION WHEN others THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] ne modifie pas directement sa fiche', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  BEGIN
    UPDATE public.profiles SET employee_id = e_b WHERE id = u_emp; ok := false;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] ne peut pas se lier à la fiche d''un autre', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  -- ---------- demandes de modification de coordonnées ----------
  INSERT INTO public.contact_change_requests (employee_id, changes) VALUES (e_a, '{"phone":"+221 77 000 00 00","children_count":2}') RETURNING id INTO r1;
  total := total + 1; ok := (SELECT status FROM public.contact_change_requests WHERE id = r1) = 'pending'; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] crée une demande en attente', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  total := total + 1; ok := (SELECT previous ? 'phone' FROM public.contact_change_requests WHERE id = r1); IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] l''ancienne valeur est conservée dans la demande', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  BEGIN
    INSERT INTO public.contact_change_requests (employee_id, changes) VALUES (e_a, '{"phone":"1"}'); ok := false;
  EXCEPTION WHEN unique_violation THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] une seule demande en attente à la fois', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  BEGIN
    INSERT INTO public.contact_change_requests (employee_id, changes) VALUES (e_b, '{"phone":"1"}'); ok := false;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] ne peut pas demander une modification pour un collègue', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  BEGIN
    PERFORM public.cancel_contact_change(r1);
    ok := (SELECT status FROM public.contact_change_requests WHERE id = r1) = 'cancelled';
  EXCEPTION WHEN others THEN ok := false; RAISE NOTICE 'cancel: %', SQLERRM; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] annule sa demande', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  BEGIN
    INSERT INTO public.contact_change_requests (employee_id, changes) VALUES (e_a, '{"manager_id":"x"}'); ok := false;
  EXCEPTION WHEN check_violation THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] champ non autorisé refusé (manager_id)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  BEGIN
    INSERT INTO public.contact_change_requests (employee_id, changes) VALUES (e_a, '{"children_count":-1}'); ok := false;
  EXCEPTION WHEN check_violation THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] valeur invalide refusée', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  INSERT INTO public.contact_change_requests (employee_id, changes) VALUES (e_a, '{"phone":"+221 77 111 11 11","address":"Pikine, Dakar"}') RETURNING id INTO r2;
  BEGIN
    PERFORM public.review_contact_change(r2, true); ok := false;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] l''employé ne peut pas valider sa propre demande', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  PERFORM pg_temp.act_as(u_other);
  SELECT count(*) INTO n FROM public.contact_change_requests;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] un collègue ne voit pas les demandes d''autrui (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);

  -- ---------- RH : décision ----------
  PERFORM pg_temp.act_as(u_drh);
  SELECT public.get_my_role()::text INTO txt;
  total := total + 1; ok := txt = 'drh'; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] un DRH aussi employé garde « drh » comme rôle principal (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, txt);
  SELECT count(*) INTO n FROM public.employees;
  total := total + 1; ok := n >= 40; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] le rôle employé ne réduit pas les droits du DRH (%s fiches)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  SELECT count(*) INTO n FROM public.contact_change_requests WHERE status = 'pending';
  total := total + 1; ok := n = 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] le DRH voit la demande en attente (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  PERFORM public.review_contact_change(r2, true, 'Justificatif reçu');
  SELECT phone INTO txt FROM public.employees WHERE id = e_a;
  total := total + 1; ok := txt = '+221 77 111 11 11' AND (SELECT address FROM public.employees WHERE id = e_a) = 'Pikine, Dakar'; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] l''approbation applique les changements (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, txt);
  total := total + 1; ok := (SELECT status FROM public.contact_change_requests WHERE id = r2) = 'approved' AND (SELECT reviewed_by FROM public.contact_change_requests WHERE id = r2) = u_drh;
  IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] la décision est tracée (statut, auteur)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  BEGIN
    PERFORM public.review_contact_change(r2, true); ok := false;
  EXCEPTION WHEN others THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] une demande ne se traite qu''une fois', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  PERFORM pg_temp.act_as(u_emp);
  INSERT INTO public.contact_change_requests (employee_id, changes) VALUES (e_a, '{"phone":"+221 77 222 22 22"}') RETURNING id INTO r1;
  PERFORM pg_temp.act_as(u_drh);
  PERFORM public.review_contact_change(r1, false, 'Numéro illisible');
  SELECT phone INTO txt FROM public.employees WHERE id = e_a;
  total := total + 1; ok := txt = '+221 77 111 11 11' AND (SELECT status FROM public.contact_change_requests WHERE id = r1) = 'rejected'; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] le refus ne modifie pas la fiche', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  -- ---------- alertes, délien, unicité ----------
  PERFORM pg_temp.as_admin();
  PERFORM public.generate_contract_notifications();
  PERFORM public.generate_document_notifications();
  SELECT count(*) INTO n FROM public.notifications WHERE user_id IN (u_emp, u_other);
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] les employés ne reçoivent pas les alertes RH (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  BEGIN
    UPDATE public.profiles SET employee_id = e_a WHERE id = u_other; ok := false;
  EXCEPTION WHEN unique_violation THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] une fiche ne se lie qu''à un seul compte', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  UPDATE public.profiles SET employee_id = NULL WHERE id = u_other;
  SELECT count(*) INTO n FROM public.user_roles WHERE user_id = u_other AND role = 'employe' AND archived_at IS NULL;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] délier le compte retire le rôle employé', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  PERFORM pg_temp.act_as(u_other);
  SELECT count(*) INTO n FROM public.employees;
  total := total + 1; ok := n = 0; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] un compte délié ne voit plus aucune fiche (%s)', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END, n);
  PERFORM pg_temp.as_admin();
  UPDATE public.profiles SET employee_id = e_b WHERE id = u_other;
  SELECT count(*) INTO n FROM public.user_roles WHERE user_id = u_other AND role = 'employe' AND archived_at IS NULL;
  total := total + 1; ok := n = 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] relier le compte réactive le rôle employé', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);

  RAISE EXCEPTION E'RÉSULTATS : % vérifications, % échec(s)%', total, failed, out;
END $$;
