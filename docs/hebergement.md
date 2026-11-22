# Hébergement autonome : Supabase + Vercel ou Netlify

Le projet ne dépend plus de Lovable : le build est configuré dans `vite.config.ts` (Vite + Nitro) et la base est un projet Supabase que vous possédez.

## 1. Créer votre projet Supabase
1. supabase.com → *New project* (région proche de Dakar : Europe/Paris ou Frankfurt). Notez le mot de passe de la base.
2. *Project Settings → API* : copiez l'URL, la clé **publishable/anon** et la clé **service_role** (secrète).
3. *Authentication → URL Configuration* : *Site URL* = l'adresse du site déployé ; ajoutez aussi `http://localhost:8080` dans *Redirect URLs* (et l'adresse de prévisualisation Vercel/Netlify).
4. *Authentication → Providers → Email* : gardez l'e-mail activé ; l'inscription publique peut être désactivée (les comptes sont invités par l'admin IT).

## 2. Créer la base
```sh
DATABASE_URL='postgresql://postgres:MOT_DE_PASSE@db.REF.supabase.co:5432/postgres' sh supabase/apply-all.sh
```
(chaîne *Connect → Direct connection*, ou *Session pooler* si votre réseau est en IPv4 seulement). Ajoutez `WITH_DEMO=1` pour 40 employés fictifs de test.
Le **premier compte créé** devient automatiquement administrateur : créez-le vous-même juste après (*Authentication → Users → Add user*, ou depuis la page de connexion), puis activez l'authentification à deux facteurs.

## 3. Variables d'environnement
| Variable | Où la mettre |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | `.env.local` **et** hébergeur (nécessaires au build) |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | `.env.local` et hébergeur |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` et hébergeur (**secret**, jamais dans Git) |
| `VITE_SITE_URL`, `VITE_PLAUSIBLE_DOMAIN` | facultatives (voir `docs/qualite-web.md`) |

En local, `bun run dev` lit `.env.local`. Les pages « API et clés », utilisateurs et documents fonctionnent alors aussi en local, puisque vous avez la clé service_role.

## 4. Types TypeScript
```sh
npx supabase login
npx supabase gen types typescript --project-id REF > src/integrations/supabase/types.ts
```
(vous êtes propriétaire du projet : la commande fonctionne). Puis `bun run build` et `bun run test`.

## 5. Déployer
- **Vercel** : *Add New → Project* → importer le dépôt GitHub. Framework : *Other*. Build : `bun run build` (Nitro détecte Vercel tout seul). Ajoutez les variables du §3.
- **Netlify** : *Add new site → Import from Git*. Build : `bun run build` ; `netlify.toml` est fourni. Ajoutez les variables du §3.
Un domaine personnalisé se branche ensuite dans l'hébergeur ; mettez à jour *Site URL* côté Supabase et `VITE_SITE_URL`.

## 6. Reprendre les données de Lovable Cloud (si elles existent déjà)
Les employés saisis dans l'ancienne base ne suivent pas tout seuls. Si vous n'avez que des données de test, repartez de zéro. Sinon, exportez les tables en CSV depuis l'ancienne base et importez-les (le bouton **Importer** de la page Employés couvre les fiches) ; les documents (fichiers) devront être ré-téléversés.

## 7. Ce qui a été retiré
Plugin de build Lovable, passerelle d'authentification de l'aperçu Lovable, rapport d'erreurs Lovable, secret de cron Lovable (inutilisé : les alertes tournent via `pg_cron`), règles de collaboration Lovable dans `AGENTS.md`. Les noms `LOVABLE_*` n'existent plus.
