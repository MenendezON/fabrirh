-- Tests de docs/sql-manuel/10-comptes-dossiers.sql (après application, avec supabase/seed.sql).
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
CREATE OR REPLACE FUNCTION pg_temp.chk(_ok boolean, _label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('t.total', (COALESCE(NULLIF(current_setting('t.total', true), ''), '0')::int + 1)::text, true);
  IF NOT COALESCE(_ok, false) THEN
    PERFORM set_config('t.failed', (COALESCE(NULLIF(current_setting('t.failed', true), ''), '0')::int + 1)::text, true);
  END IF;
  PERFORM set_config('t.out', COALESCE(current_setting('t.out', true), '') || E'\n[' || CASE WHEN COALESCE(_ok, false) THEN 'OK' ELSE 'ÉCHEC' END || '] ' || _label, true);
END $$;

DO $$
DECLARE
  u_new uuid := gen_random_uuid(); u_match uuid := gen_random_uuid(); u_dup uuid := gen_random_uuid();
  u_one uuid := gen_random_uuid(); u_drh uuid := gen_random_uuid(); u_adm uuid := gen_random_uuid();
  u_mgr uuid := gen_random_uuid();
  e_match uuid; e_dup1 uuid; e_dup2 uuid; e_free uuid; e_free2 uuid; e_linked uuid; req uuid; req2 uuid;
  n int; n0 int; txt text; emp uuid; ok boolean;
BEGIN
  -- Dossiers préparés : un seul porteur de l'e-mail, deux porteurs d'un autre e-mail, deux dossiers libres.
  INSERT INTO public.employees (matricule, first_names, last_name, email) VALUES ('T10-MATCH', 'Awa', 'Ndiaye', 'awa.ndiaye@test.local') RETURNING id INTO e_match;
  INSERT INTO public.employees (matricule, first_names, last_name, email) VALUES ('T10-DUP1', 'A', 'Dup', 'dup@test.local') RETURNING id INTO e_dup1;
  INSERT INTO public.employees (matricule, first_names, last_name, professional_email) VALUES ('T10-DUP2', 'B', 'Dup', 'DUP@test.local') RETURNING id INTO e_dup2;
  INSERT INTO public.employees (matricule, first_names, last_name, email) VALUES ('T10-FREE', 'Libre', 'Un', 'libre1@test.local') RETURNING id INTO e_free;
  INSERT INTO public.employees (matricule, first_names, last_name, email) VALUES ('T10-FREE2', 'Libre', 'Deux', 'libre2@test.local') RETURNING id INTO e_free2;
  SELECT count(*) INTO n0 FROM public.employees;

  -- ---------- 1. Création automatique du dossier ----------
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES (u_new, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','marthe@test.local','{"full_name":"Marthe Onésima  DIATTA"}',now(),now());
  SELECT employee_id INTO emp FROM public.profiles WHERE id = u_new;
  PERFORM pg_temp.chk(emp IS NOT NULL, 'un nouveau compte reçoit un dossier employé');
  SELECT count(*) INTO n FROM public.employees;
  PERFORM pg_temp.chk(n = n0 + 1, format('exactement un dossier créé (%s → %s)', n0, n));
  PERFORM pg_temp.chk((SELECT matricule FROM public.employees WHERE id = emp) ~ '^PROV-[0-9]{4,}$', 'matricule provisoire PROV-nnnn');
  PERFORM pg_temp.chk((SELECT last_name FROM public.employees WHERE id = emp) = 'DIATTA'
                      AND (SELECT first_names FROM public.employees WHERE id = emp) = 'Marthe Onésima', 'nom : dernier mot = nom de famille, le reste = prénoms');
  PERFORM pg_temp.chk((SELECT email FROM public.employees WHERE id = emp) = 'marthe@test.local', 'l''e-mail du compte est repris sur le dossier');
  PERFORM pg_temp.chk(EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = u_new AND role = 'employe' AND archived_at IS NULL), 'le rôle employé est attribué automatiquement');

  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES (u_one, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','sans.nom@test.local','{}',now(),now());
  PERFORM pg_temp.chk((SELECT last_name FROM public.employees e JOIN public.profiles p ON p.employee_id = e.id WHERE p.id = u_one) = 'sans.nom', 'sans nom : l''e-mail sert de nom, jamais de dossier vide');

  -- ---------- 2. Lien avec un dossier existant (même e-mail) ----------
  SELECT count(*) INTO n0 FROM public.employees;
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES (u_match, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','Awa.Ndiaye@test.local','{"full_name":"Awa Ndiaye"}',now(),now());
  PERFORM pg_temp.chk((SELECT employee_id FROM public.profiles WHERE id = u_match) = e_match, 'même e-mail (casse ignorée) : lié au dossier existant');
  SELECT count(*) INTO n FROM public.employees;
  PERFORM pg_temp.chk(n = n0, 'aucun doublon de dossier créé');

  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES (u_dup, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','dup@test.local','{"full_name":"Dup Test"}',now(),now());
  emp := (SELECT employee_id FROM public.profiles WHERE id = u_dup);
  PERFORM pg_temp.chk(emp NOT IN (e_dup1, e_dup2) AND emp IS NOT NULL, 'e-mail porté par deux dossiers : pas de choix au hasard, nouveau dossier');

  -- ---------- 3. Matricule provisoire remplaçable une fois ----------
  emp := (SELECT employee_id FROM public.profiles WHERE id = u_new);
  UPDATE public.employees SET matricule = 'fm-2041' WHERE id = emp;
  PERFORM pg_temp.chk((SELECT matricule FROM public.employees WHERE id = emp) = 'FM-2041', 'le matricule provisoire est remplacé par le vrai (mis en majuscules)');
  BEGIN
    UPDATE public.employees SET matricule = 'FM-9999' WHERE id = emp;
    ok := false;
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  PERFORM pg_temp.chk(ok, 'ensuite le matricule redevient permanent');

  -- ---------- 4. Demandes d'accès ----------
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES (u_drh, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','drh10@test.local','{"full_name":"Drh Test"}',now(),now()),
         (u_adm, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','adm10@test.local','{"full_name":"Adm Test"}',now(),now()),
         (u_mgr, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','mgr10@test.local','{"full_name":"Mgr Test"}',now(),now());
  DELETE FROM public.user_roles WHERE user_id IN (u_drh, u_adm, u_mgr);
  INSERT INTO public.user_roles (user_id, role) VALUES (u_drh, 'drh'), (u_adm, 'admin_it'), (u_mgr, 'employe');
  e_linked := (SELECT employee_id FROM public.profiles WHERE id = u_new);

  PERFORM pg_temp.act_as(u_drh);
  PERFORM pg_temp.chk(NOT public.employee_has_account(e_free) AND public.employee_has_account(e_linked), 'la RH sait si un dossier a déjà un compte');
  INSERT INTO public.access_requests (employee_id, note) VALUES (e_free, 'Nouvel arrivant') RETURNING id INTO req;
  PERFORM pg_temp.chk(req IS NOT NULL AND (SELECT created_by FROM public.access_requests WHERE id = req) = u_drh, 'la DRH peut demander l''accès pour un employé sans compte (demandeur tracé)');
  BEGIN INSERT INTO public.access_requests (employee_id) VALUES (e_free); ok := false;
  EXCEPTION WHEN unique_violation THEN ok := true; END;
  PERFORM pg_temp.chk(ok, 'une seule demande en attente par employé');
  BEGIN INSERT INTO public.access_requests (employee_id) VALUES (e_linked); ok := false;
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  PERFORM pg_temp.chk(ok, 'pas de demande pour un employé qui a déjà un compte');
  BEGIN INSERT INTO public.access_requests (employee_id, status) VALUES (e_free2, 'approved'); ok := false;
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  PERFORM pg_temp.chk(ok, 'une demande ne peut pas naître déjà « acceptée »');
  BEGIN PERFORM public.review_access_request(req, true); ok := false;
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  PERFORM pg_temp.chk(ok, 'la DRH ne peut pas traiter sa propre demande (réservé à l''admin IT)');
  BEGIN UPDATE public.access_requests SET status = 'approved' WHERE id = req; ok := (SELECT status FROM public.access_requests WHERE id = req) = 'pending';
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  PERFORM pg_temp.chk(ok, 'aucune modification directe du statut par le client');

  PERFORM pg_temp.act_as(u_mgr);
  PERFORM pg_temp.chk((SELECT count(*) FROM public.access_requests) = 0, 'un simple employé ne voit aucune demande');
  BEGIN INSERT INTO public.access_requests (employee_id) VALUES (e_free2); ok := false;
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  PERFORM pg_temp.chk(ok, 'un simple employé ne peut pas demander d''accès');

  PERFORM pg_temp.act_as(u_adm);
  PERFORM pg_temp.chk((SELECT count(*) FROM public.access_requests WHERE status = 'pending') = 1, 'l''admin IT voit la demande en attente');
  PERFORM public.review_access_request(req, true, 'ok');
  PERFORM pg_temp.chk((SELECT status FROM public.access_requests WHERE id = req) = 'approved'
                      AND (SELECT reviewed_by FROM public.access_requests WHERE id = req) = u_adm, 'l''admin IT accepte (décideur tracé)');
  BEGIN PERFORM public.review_access_request(req, false); ok := false;
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  PERFORM pg_temp.chk(ok, 'une demande déjà traitée ne se retraite pas');

  PERFORM pg_temp.act_as(u_drh);
  INSERT INTO public.access_requests (employee_id) VALUES (e_free2) RETURNING id INTO req2;
  PERFORM public.cancel_access_request(req2);
  PERFORM pg_temp.chk((SELECT status FROM public.access_requests WHERE id = req2) = 'cancelled', 'la RH peut annuler sa demande en attente');

  PERFORM pg_temp.as_admin();
  PERFORM pg_temp.chk(has_table_privilege('anon', 'public.access_requests', 'SELECT') = false, 'aucun accès anonyme aux demandes');

  -- ---------- 5. Rattrapage d'un compte sans dossier (corps du script) ----------
  UPDATE public.profiles SET employee_id = NULL WHERE id = u_one;
  DECLARE p record; _emp uuid;
  BEGIN
    FOR p IN SELECT id, email, full_name FROM public.profiles WHERE employee_id IS NULL AND archived_at IS NULL LOOP
      _emp := public.employee_for_new_account(p.email, p.full_name);
      UPDATE public.profiles SET employee_id = _emp WHERE id = p.id;
    END LOOP;
  END;
  PERFORM pg_temp.chk((SELECT employee_id FROM public.profiles WHERE id = u_one) IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE employee_id IS NULL AND archived_at IS NULL), 'le rattrapage donne un dossier à tout compte actif qui n''en a pas');
  PERFORM pg_temp.chk((SELECT count(*) FROM (SELECT employee_id FROM public.profiles WHERE employee_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1) d) = 0, 'jamais deux comptes sur le même dossier');

  RAISE EXCEPTION E'RÉSULTATS : % vérifications, % échec(s)%', current_setting('t.total'), COALESCE(NULLIF(current_setting('t.failed', true), ''), '0'), current_setting('t.out');
END $$;
