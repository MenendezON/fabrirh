import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import {
  FollowupShell,
  FollowupTable,
  matchesFollowup,
  parseFollowupSearch,
  PersonCell,
} from "@/components/contracts/followup";
import { Badge } from "@/components/ui/badge";
import { probationQuery, remainingLabel } from "@/lib/contracts";
import { CONTRACT_LABELS, type ContractType } from "@/lib/employee-schemas";
import { formatDate } from "@/lib/format";
import { orgUnitsQuery, sitesQuery } from "@/lib/referentials";
import { settingsQuery } from "@/lib/settings";

const TITLE = "Périodes d'essai";
const DESCRIPTION =
  "Essais en cours (1 ou 2 mois, renouvelables une fois), triés par date de fin. La RH est alertée avant l'échéance.";

export const Route = createFileRoute("/_authenticated/contrats/essai")({
  validateSearch: parseFollowupSearch,
  head: () => ({
    meta: [
      { title: `${TITLE} — Fabri RH` },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProbationPage,
});

function ProbationPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: settings } = useQuery(settingsQuery);
  const noticeRaw = settings?.find((s) => s.key === "notice_days_probation")?.value;
  const noticeDays = typeof noticeRaw === "number" ? noticeRaw : 15;
  const { data: all, error } = useQuery(probationQuery);
  const { data: units = [] } = useQuery(orgUnitsQuery);
  const { data: sites = [] } = useQuery(sitesQuery);

  const rows = all?.filter((r) => matchesFollowup(r, search, units)) ?? null;
  const siteName = (id: string | null) => sites.find((s) => s.id === id)?.name ?? "—";
  const unitName = (id: string | null) => units.find((u) => u.id === id)?.name ?? "—";

  return (
    <FollowupShell
      title={TITLE}
      description={DESCRIPTION}
      search={search}
      onSearch={(next) => navigate({ search: next, replace: true })}
      count={rows?.length ?? null}
    >
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          Impossible de charger les périodes d'essai.
        </p>
      ) : (
        <FollowupTable
          headers={["Employé", "Contrat", "Essai", "Fin d'essai", "Temps restant", "Site", "Unité"]}
          empty="Aucune période d'essai en cours."
          rows={
            rows?.map((r) => [
              <PersonCell key="p" row={r} />,
              CONTRACT_LABELS[r.contract_type as ContractType] ?? r.contract_type,
              `${r.probation_months} mois${r.probation_renewed ? " + renouvelé" : ""}`,
              formatDate(r.probation_end),
              <span key="d" className="flex flex-wrap items-center gap-2">
                {r.days_remaining < 0 ? "Terminée" : remainingLabel(r.days_remaining)}
                {r.days_remaining >= 0 && r.days_remaining <= noticeDays && (
                  <Badge variant="destructive">
                    {r.can_renew ? "Décision à prendre" : "Dernier mois"}
                  </Badge>
                )}
              </span>,
              siteName(r.primary_site_id),
              unitName(r.org_unit_id),
            ]) ?? null
          }
        />
      )}
    </FollowupShell>
  );
}
