#!/bin/sh
# Prépare une base Supabase NEUVE : migrations, scripts complémentaires, tâches planifiées.
# Usage : DATABASE_URL='postgresql://postgres:MOT_DE_PASSE@db.xxxx.supabase.co:5432/postgres' sh supabase/apply-all.sh
# (chaîne « Direct connection » ou « Session pooler » de Supabase → Connect). Rejouable sans dommage.
# Option : WITH_DEMO=1 ajoute 40 employés FICTIFS (à éviter en production).
set -eu
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?Définissez DATABASE_URL (voir l'en-tête du script)}"
P="psql $DATABASE_URL -v ON_ERROR_STOP=1 -q"
for f in drizzle/migrations/*.sql; do echo "→ $f"; $P -f "$f"; done
for f in docs/sql-manuel/0*.sql; do echo "→ $f"; $P -f "$f"; done
$P -c "select cron.schedule('contract-notifications', '0 6 * * *', \$\$ select public.generate_contract_notifications() \$\$);"
$P -c "select cron.schedule('document-notifications', '15 6 * * *', \$\$ select public.generate_document_notifications() \$\$);"
$P -c "select cron.schedule('api-log-purge', '30 3 * * *', \$\$ select public.purge_api_call_log(90) \$\$);"
[ "${WITH_DEMO:-0}" = "1" ] && { echo "→ seed.sql (démo)"; $P -f supabase/seed.sql; }
echo "Terminé. Créez maintenant le premier compte : il devient automatiquement administrateur."
