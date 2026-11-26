import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";

import { AssignmentTab } from "@/components/employees/assignment-tab";
import { CompensationTab } from "@/components/employees/compensation-tab";
import { Empty, Section } from "@/components/employees/common";
import { ContractsTab } from "@/components/employees/contracts-tab";
import { DocumentsTab } from "@/components/employees/documents-tab";
import type { FicheContext } from "@/components/employees/fiche-context";
import { IdentityTab } from "@/components/employees/identity-tab";
import { MyDocumentRequestsTab } from "@/components/employees/my-documents-requests-tab";
import { MyContactTab } from "@/components/employees/my-contact-tab";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { employeeQuery, fullName, initials } from "@/lib/employees";
import { usePermissions } from "@/lib/permissions";
import { useCurrentUser } from "@/lib/roles";

const TABS = ["infos", "poste", "contrats", "remuneration", "documents", "attestations", "coordonnees"] as const;
type Tab = (typeof TABS)[number];
const isTab = (v: unknown): v is Tab =>
  typeof v === "string" && (TABS as readonly string[]).includes(v);

export const Route = createFileRoute("/_authenticated/mon-profil")({
  validateSearch: (raw: Record<string, unknown>): { onglet?: Tab } =>
    isTab(raw["onglet"]) && raw["onglet"] !== "infos" ? { onglet: raw["onglet"] } : {},
  head: () => ({
    meta: [
      { title: "Mon profil — Fabri RH" },
      { name: "description", content: "Vos informations, contrats, documents et rémunération." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyProfilePage,
});

function MyProfilePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { can, ready } = usePermissions();
  const employeeId = user?.employeeId ?? null;
  const { data, isLoading, error } = useQuery({
    ...employeeQuery(employeeId ?? ""),
    enabled: !!employeeId && ready,
  });

  if (userLoading || (employeeId && (isLoading || !ready))) {
    return <p className="py-12 text-center text-muted-foreground">Chargement…</p>;
  }
  if (!employeeId) {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border bg-card px-5 py-12 text-center">
        <p className="font-medium">Votre compte n'est pas rattaché à une fiche employé.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Demandez à l'administrateur IT de faire le lien.{" "}
          <Link to="/accueil" className="text-primary hover:underline">
            Retour à l'accueil
          </Link>
        </p>
      </div>
    );
  }
  if (error || !data?.record) {
    return (
      <p className="rounded-lg border bg-card px-5 py-12 text-center text-destructive">
        Impossible de charger votre fiche.
      </p>
    );
  }

  const { record, current, metrics } = data;
  const ctx: FicheContext = {
    id: employeeId,
    record,
    current,
    metrics,
    can,
    userId: user?.id ?? null,
  };
  const tab: Tab = search.onglet ?? "infos";

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex items-center gap-4">
        <span
          className="grid size-14 shrink-0 place-items-center rounded-full bg-secondary text-lg font-bold text-secondary-foreground"
          aria-hidden
        >
          {initials(record)}
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold leading-tight">{fullName(record)}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            <span className="font-mono">{record.matricule}</span>
            {current?.job_title_name && ` · ${current.job_title_name}`}
            {current?.org_unit_name && ` · ${current.org_unit_name}`}
          </p>
          <p className="mt-2">
            <Badge variant="secondary">Mon espace personnel</Badge>
          </p>
        </div>
      </header>

      <Tabs
        value={tab}
        onValueChange={(v) =>
          isTab(v) && navigate({ search: v === "infos" ? {} : { onglet: v }, replace: true })
        }
      >
        <TabsList className="mb-6 h-auto max-w-full flex-wrap justify-start">
          <TabsTrigger value="infos">Mes informations</TabsTrigger>
          <TabsTrigger value="poste">Mon poste</TabsTrigger>
          <TabsTrigger value="contrats">Mes contrats</TabsTrigger>
          <TabsTrigger value="remuneration">Ma rémunération</TabsTrigger>
          <TabsTrigger value="documents">Mes documents</TabsTrigger>
          <TabsTrigger value="attestations">Mes attestations</TabsTrigger>
          <TabsTrigger value="coordonnees">Mes coordonnées</TabsTrigger>
        </TabsList>
        <TabsContent value="infos">
          <IdentityTab ctx={ctx} />
        </TabsContent>
        <TabsContent value="poste">
          <AssignmentTab ctx={ctx} />
        </TabsContent>
        <TabsContent value="contrats">
          <ContractsTab ctx={ctx} />
        </TabsContent>
        <TabsContent value="remuneration">
          {can("compensation", "view") ? (
            <CompensationTab ctx={ctx} />
          ) : (
            <NoAccess title="Rémunération" />
          )}
        </TabsContent>
        <TabsContent value="documents">
          {can("documents", "view") || can("confidential_documents", "view") ? (
            <DocumentsTab ctx={ctx} />
          ) : (
            <NoAccess title="Documents" />
          )}
        </TabsContent>
        <TabsContent value="attestations">
          <MyDocumentRequestsTab employeeId={employeeId} />
        </TabsContent>
        <TabsContent value="coordonnees">
          <MyContactTab
            employeeId={employeeId}
            current={{
              phone: record.phone,
              address: record.address,
              marital_status: record.marital_status,
              children_count: record.children_count,
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NoAccess({ title }: { title: string }) {
  return (
    <Section title={title}>
      <Empty>
        <span className="inline-flex items-center gap-2">
          <Lock className="size-4" /> Cette section n'est pas disponible pour votre rôle.
        </span>
      </Empty>
    </Section>
  );
}
