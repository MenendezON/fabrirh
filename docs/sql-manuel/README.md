# Scripts SQL à appliquer à la main dans Supabase

Ces scripts réalisent, les évolutions de schéma qui complètent les migrations `drizzle/migrations`. Ils ont été **exécutés et testés** sur un PostgreSQL 16 local (simulation de Supabase : voir `supabase/tests/local/README.md`) : 101 vérifications SQL au total, scripts appliqués deux fois de suite (idempotents).

| Script | Contenu | Demande |
|---|---|---|
| `01-colonnes.sql` | `employees.professional_email`, `employees.nationality_code`, `compensation.contract_id` (+ contrôle « même employé » + rattrapage), `documents.description`, colonnes `professional_email`, `nationality_code`, `last_change` ajoutées à `v_employee_current` | 1, 2, 4, 5, 10d |
| `02-appreciations.sql` | table `employee_reviews`, permission `reviews`, droits par rôle validés, RLS (personne ne voit ses propres appréciations), historique expurgé (ni commentaire ni titre) | 3 |
| `03-api.sql` | `api_clients`, `api_call_log`, durée de vie obligatoire (`api_key_max_days`), clé non modifiable, `purge_api_call_log()` | 10 |
| `04-matrice-permissions.sql` | écriture de `role_permissions` par `admin_it` seul + garde-fou anti-verrouillage | 8 |
| `05-documents.sql` | bucket privé, politiques de stockage, contraintes, versions, journal d'accès, expiration (`generate_document_notifications()`) | 7a–7f |
| `06-droit-import.sql` | action `import_export:import` pour `drh` et `gestionnaire_rh` | 9 (droit seulement) |
| `07-genre.sql` | colonne `employees.gender` (`F` ou `M`, facultative) et sa présence dans `v_employee_current` | genre |
| `08-role-employe.sql` | ajoute la valeur `employe` à l'énumération `app_role` — **à exécuter seul, avant le 09** (PostgreSQL interdit d'utiliser une valeur d'énumération dans la transaction qui la crée) | libre-service |
| `09-libre-service.sql` | rôle `employe` (droits en lecture sur ses seules données), rôle attribué automatiquement dès qu'un compte est lié à une fiche (`profiles.employee_id`, unique), `my_employee_id()`, demandes de changement de coordonnées validées par la RH (`contact_change_requests`, `review_contact_change`, `cancel_contact_change`) | libre-service |
| `10-comptes-dossiers.sql` | tout compte reçoit automatiquement un dossier employé (lié par e-mail s'il existe, sinon matricule provisoire `PROV-0001`…, remplaçable une fois), `employee_has_account()`, demandes d'accès RH → admin IT (`access_requests`, `review_access_request`, `cancel_access_request`), rattrapage des comptes existants | comptes ↔ dossiers |
| `11-email-pro-notification-acces.sql` | e-mail professionnel prioritaire pour lier un compte à un dossier, notification des admin IT à chaque demande d'accès | comptes ↔ dossiers |
| `12-periode-essai.sql` | période d'essai (1 ou 2 mois, renouvelable une fois) sur le contrat, vue `v_probation`, `renew_probation()`, paramètre `notice_days_probation` (15 j), alerte quotidienne à la DRH et aux gestionnaires RH (`generate_probation_notifications`, tâche 06 h 30) | contrats |

## Procédure (Supabase)

1. **Sauvegarde** : Supabase → *Database → Backups* (ou `pg_dump`). Faites d'abord l'essai sur un projet de test si vous en avez un.
2. Ouvrez *SQL Editor → New query*, collez le contenu du script **01**, cliquez *Run*. Attendez « Success ». Puis 02, 03, 04, 05, 06, 07 **dans l'ordre**, puis **08 seul**, puis 09, 10, 11 et 12 (chacun dans une requête distincte). Chaque script est dans une transaction : en cas d'erreur, rien n'est appliqué à moitié.
3. Vérifiez : *Table Editor* montre `employee_reviews`, `api_clients`, `api_call_log` ; *Storage* montre le bucket `employee-documents` en privé.
4. **Tâche quotidienne** (une seule fois, après le script 05) : ajoutez les alertes de documents à la tâche planifiée existante, ou créez-en une :
   ```sql
   select cron.schedule('document-notifications', '15 6 * * *', $$ select public.generate_document_notifications() $$);
   select cron.schedule('api-log-purge',          '30 3 * * *', $$ select public.purge_api_call_log(90) $$);
   ```
   (`pg_cron` est déjà activé par la migration `0006`.)
5. **Types TypeScript** : les nouvelles colonnes et tables n'existent pas dans `src/integrations/supabase/types.ts`. Régénérez-les avant d'écrire du code qui les utilise : `supabase gen types typescript --project-id <id> > src/integrations/supabase/types.ts`. Sans cela, l'application continue de fonctionner mais ne voit pas les nouveautés.

## Précautions

- **Journal** : Le journal de migrations est `drizzle/migrations`. Ces scripts ne s'y inscrivent pas. Ils sont idempotents : si Lovable les rejoue plus tard (collés tels quels dans une demande de migration), rien ne casse. Pour garder un historique unique, vous pouvez aussi coller chaque script à Lovable en lui demandant de l'exécuter **sans le modifier**.
- Le script 02 **remplace** la fonction `can_read_audit_table` (une ligne ajoutée pour `employee_reviews`) ; le script 05 **remplace** la contrainte de types de `notification_recipients` pour y ajouter `document_expiring`. Si Lovable modifie ces objets entre-temps, relisez la définition actuelle avant de rejouer.
- Les contrôles de dépôt de fichiers (script 05) s'appuient sur `storage.objects.metadata` (`size`, `mimetype`), tels que Supabase les remplit : un essai réel avec un PDF est à faire (voir `docs/recette.md`).
