import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_STATUS_LABELS,
  documentErrorMessage,
} from "@/lib/document-requests";
import { formatDate } from "@/lib/format";
import { usePermission } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/demandes-attestations")({
  head: () => ({
    meta: [
      { title: "Demandes d'attestation — Fabri RH" },
      {
        name: "description",
        content: "Traiter les demandes d'attestation de travail ou de congé des employés.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DocumentRequestsPage,
});

const KEY = ["document-requests", "all"];

function DocumentRequestsPage() {
  const canReview = usePermission("employees", "edit");
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: KEY,
    enabled: canReview,
    queryFn: async () => {
      const { data: rows, error: err } = await supabase
        .from("document_requests")
        .select(
          "id, employee_id, kind, leave_start, leave_end, note, status, review_note, created_at, reviewed_at, employees(first_names, last_name, matricule)",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (err) throw err;
      return rows;
    },
  });

  const decide = useMutation({
    mutationFn: async (v: { id: string; fulfill: boolean }) => {
      const note = notes[v.id]?.trim();
      const { error: err } = await supabase.rpc("review_document_request", {
        _id: v.id,
        _fulfill: v.fulfill,
        ...(note ? { _note: note } : {}),
      });
      if (err) throw err;
      return v.fulfill;
    },
    onSuccess: (fulfilled) => {
      toast.success(
        fulfilled ? "Marquée comme délivrée : l'employé est prévenu." : "Demande refusée.",
      );
      queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toast.error(documentErrorMessage(e)),
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
        title="Demandes d'attestation"
        description="Attestations de travail et de congé demandées par les employés. Préparez le document, puis marquez la demande comme délivrée."
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
        {pending.map((r) => (
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
            <p className="mt-1 text-sm">
              <Badge variant="outline">{DOCUMENT_KIND_LABELS[r.kind] ?? r.kind}</Badge>
              {r.leave_start && (
                <span className="ml-2 text-muted-foreground">
                  congé du {formatDate(r.leave_start)}
                  {r.leave_end && ` au ${formatDate(r.leave_end)}`}
                </span>
              )}
            </p>
            {r.note && <p className="mt-2 text-sm">« {r.note} »</p>}
            <Textarea
              className="mt-3"
              rows={2}
              maxLength={500}
              placeholder="Réponse à l'employé (ex. : à retirer au bureau RH) — facultatif"
              aria-label="Réponse à l'employé"
              value={notes[r.id] ?? ""}
              onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
            />
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ id: r.id, fulfill: true })}
              >
                <Check /> Marquer comme délivrée
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ id: r.id, fulfill: false })}
              >
                <X /> Refuser
              </Button>
            </div>
          </li>
        ))}
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
                  · {DOCUMENT_KIND_LABELS[r.kind] ?? r.kind} ·{" "}
                  <span className="text-muted-foreground">{formatDate(r.created_at)}</span>
                </span>
                <Badge variant="outline">{DOCUMENT_STATUS_LABELS[r.status] ?? r.status}</Badge>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
