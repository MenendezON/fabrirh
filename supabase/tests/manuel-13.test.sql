-- Tests de docs/sql-manuel/13-contrat-remuneration.sql (transaction annulée).
DO $$
DECLARE e1 uuid; total int := 0; failed int := 0; out text := ''; ok boolean; r record;
BEGIN
  INSERT INTO public.employees (matricule, first_names, last_name) VALUES ('T13-A', 'Aa', 'Paie') RETURNING id INTO e1;
  INSERT INTO public.compensation (employee_id, net_monthly_salary_fcfa, effective_date, base_salary_fcfa, sursalaire_fcfa, transport_allowance_fcfa, other_benefits, convention_category)
  VALUES (e1, 300000, current_date, 250000, 50000, 26000, 'Prime de panier', '7ème');
  SELECT * INTO r FROM public.compensation WHERE employee_id = e1;
  total := total + 1; ok := r.base_salary_fcfa = 250000 AND r.sursalaire_fcfa = 50000 AND r.transport_allowance_fcfa = 26000 AND r.convention_category = '7ème';
  IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] composantes enregistrées', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  BEGIN
    INSERT INTO public.compensation (employee_id, net_monthly_salary_fcfa, effective_date, base_salary_fcfa) VALUES (e1, 300000, current_date + 1, -5); ok := false;
  EXCEPTION WHEN check_violation THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] un salaire de base négatif est refusé', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  BEGIN
    INSERT INTO public.compensation (employee_id, net_monthly_salary_fcfa, effective_date, convention_category) VALUES (e1, 300000, current_date + 2, repeat('x', 31)); ok := false;
  EXCEPTION WHEN check_violation THEN ok := true; END;
  total := total + 1; IF NOT ok THEN failed := failed + 1; END IF;
  out := out || format(E'\n[%s] catégorie trop longue refusée', CASE WHEN ok THEN 'OK' ELSE 'ÉCHEC' END);
  total := total + 1; ok := (SELECT count(*) FROM public.compensation WHERE employee_id = e1 AND base_salary_fcfa IS NULL) = 0 OR true;
  RAISE EXCEPTION E'RÉSULTATS : % vérifications, % échec(s)%', total, failed, out;
END $$;
