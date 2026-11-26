import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { ACCESS_STATUS_LABELS, accessErrorMessage } from "@/lib/access-requests";
import { formatDate } from "@/lib/format";
import { usePermission } from "@/lib/permissions";
import { reviewAccessRequest } from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/demandes-acces")({
  head: () => ({
    meta: [
      { title: "Demandes d'accès — Fabri RH" },
      {
        name: "description",
        content: "Accepter ou refuser les demandes d'accès à l'application pour des employés.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccessRequestsPage,
});

const KEY = ["access-requests", "all"];

function AccessRequestsPage() {
  const canReview = usePermission("users", "create");
  const queryClient = useQueryClient();
  const review = useServerFn(reviewAccessRequest);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: KEY,
    enabled: canReview,
    queryFn: async () => {
      const { data: rows, error: err } = await supabase
        .from("access_requests")
        .select(
          "id, employee_id, note, status, review_note, created_at, reviewed_at, employees(first_names, last_name, matricule, email, professional_email)",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (err) throw err;
      return rows;
    },
  });

  const decide = useMutation({
    mutationFn: async (v: { id: string; approve: boolean }) => {
      await review({
        data: {
          requestId: v.id,
          approve: v.approve,
          note: notes[v.id]?.trim() || undefined,
          redirectTo: `${window.location.origin}/reset-password`,
        },
      });
      return v.approve;
    },
    onSuccess: (approved) => {
      toast.success(
        approved
          ? "Accès donné : l'employé reçoit un e-mail pour choisir son mot de passe."
          : "Demande refusée.",
      );
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ["employee-account"] });
    },
    onError: (e) => toast.error(accessErrorMessage(e)),
  });

  if (!canReview) {
    return (
      <p className="py-12 text-center text-muted-foreground">Accès non autorisé pour votre rôle.</p>
    );
  }

  const pending = (data ?? []).filter((r) => r.status === "pending");
  const done = (data ?? []).filter((r) => r.status !== "pending");

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Demandes d'accès"
        description="Demandes de la DRH ou des gestionnaires RH pour donner un compte à un employé."
      />
      {isLoading && <p className="text-muted-foreground">Chargement…</p>}
      {error && <p className="text-destructive">Impossible de charger les demandes.</p>}

      <h2 className="mb-3 text-base font-semibold">À traiter ({pending.length})</h2>
      {pending.length === 0 && !isLoading && (
        <p className="mb-8 rounded-lg border bg-card px-5 py-8 text-center text-muted-foreground">
          Aucune demande en attente.
        </p>
      )}
      <ul className="mb-8 space-y-3">
        {pending.map((r) => {
          const mail = r.employees?.professional_email || r.employees?.email;
          return (
            <li key={r.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  to="/employes/$employeeId"
                  params={{ employeeId: r.employee_id }}
                  className="font-semibold hover:underline"
                >
                  {r.employees ? `${r.employees.first_names} ${r.employees.last_name}` : "Employé"}
                </Link>
                <span className="text-xs text-muted-foreground">{formatDate(r.created_at)}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {mail ? `Invitation envoyée à ${mail}` : "Aucune adresse e-mail sur la fiche"}
              </p>
              {r.note && <p className="mt-2 text-sm">« {r.note} »</p>}
              <Textarea
                className="mt-3"
                rows={2}
                maxLength={500}
                placeholder="Note pour le demandeur (facultatif)"
                aria-label="Note pour le demandeur"
                value={notes[r.id] ?? ""}
                onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
              />
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: r.id, approve: true })}
                >
                  <Check /> Accepter et inviter
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: r.id, approve: false })}
                >
                  <X /> Refuser
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {done.length > 0 && (
        <>
          <h2 className="mb-3 text-base font-semibold">Historique</h2>
          <ul className="divide-y rounded-lg border bg-card">
            {done.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <span>
                  {r.employees ? `${r.employees.first_names} ${r.employees.last_name}` : "Employé"}{" "}
                  · <span className="text-muted-foreground">{formatDate(r.created_at)}</span>
                </span>
                <Badge variant="outline">{ACCESS_STATUS_LABELS[r.status] ?? r.status}</Badge>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
