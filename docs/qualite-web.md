# Qualité web, conformité et états de l'interface

## Pages et conformité
- `/confidentialite` et `/conditions` : textes à **faire relire par un conseil juridique** (durées de conservation à fixer, loi sénégalaise n° 2008-12, déclaration à la CDP si requise).
- Bandeau de consentement : seul le stockage nécessaire est utilisé d'office ; la mesure d'audience (Plausible, sans témoin) ne se charge qu'après « Accepter ». Lien « Gérer mes choix » permanent. Active si `VITE_PLAUSIBLE_DOMAIN` est renseigné (compte Plausible ou instance auto-hébergée à créer).
- HTTPS forcé (redirection 308 hors local), HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` : `src/lib/security-headers.ts`, appliqués par `src/server.ts`. Pas de CSP stricte (le rendu serveur injecte des scripts en ligne) ; à étudier avec des nonces si l'exigence se présente.
- Secrets : `.env` ne contient que des valeurs publiques ; la clé de service n'est lue que par du code serveur (test `web-quality.test.ts`).

## Référencement
Titres/descriptions par page (`src/lib/seo.ts`), image d'aperçu 1200×630, favicon (SVG, 32, 180, 192, 512, ico), manifeste, `robots.txt` et `sitemap.xml` générés (adresse déduite de la requête, ou `VITE_SITE_URL`). L'espace connecté est en `noindex`.

## États de l'interface
| État | Comportement |
| --- | --- |
| Vide | `EmptyState` : dit ce que l'écran contiendra et pourquoi il est vide |
| Chargement | squelettes (`ListSkeleton`) plutôt qu'un cercle |
| Erreur | `ErrorState` : message en français + « Réessayer » |
| Hors connexion | bandeau rouge permanent (`OfflineBanner`) |
| Réseau lent | barre de progression après 0,4 s, message « Connexion lente » après 3 s |
| Aucun résultat | `NoResults` : suggestions + « Effacer la recherche et les filtres » |
| Accès refusé | `PermissionDenied` : pourquoi, qui contacter, bouton de retour |
| Session expirée | boîte de dialogue, reconnexion puis retour à la page ; saisies conservées dans l'onglet (nouvel employé, appréciation) ; une déconnexion volontaire efface les brouillons |
| Validation | message sous chaque champ (zod + react-hook-form) |
| Succès | confirmation + suite logique (ex. « Ajoutez maintenant le poste… ») |

## Antispam
Champ piège, délai minimum d'1,5 s, pause croissante après 5 échecs (connexion, mot de passe oublié). C'est une première barrière côté navigateur ; la limite réelle reste celle de l'authentification. Pour un CAPTCHA (Cloudflare Turnstile), il faut créer des clés.

## Documentation Swagger
Menu **Documentation API** (`/api-docs`), réservé à l'admin-IT : la page est protégée dans l'interface **et** la spécification n'est servie par le serveur qu'à une session admin_it. Pour essayer : **Authorize**, coller une clé, **Try it out** (journalisé comme un vrai appel). La spécification est générée depuis `src/lib/api/keys.ts` (test de synchronisation).

## Mesures (21/11/2026)
Audit axe-core WCAG A/AA (contraste inclus) sur `/`, `/auth`, `/confidentialite`, `/conditions`, 404, en clair/sombre, mobile 375 px et bureau : 0 violation, aucun débordement horizontal. Poids : image d'aperçu 14 Ko, icônes < 20 Ko ; script principal ≈ 99 Ko gzip ; Swagger (≈ 416 Ko gzip) chargé seulement sur `/api-docs`. Mesurer en production avec Lighthouse après déploiement.
