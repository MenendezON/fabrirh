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
  CONTACT_FIELD_LABELS,
  REQUEST_STATUS_LABELS,
  formatContactValue,
} from "@/lib/contact-requests";
import { formatDate } from "@/lib/format";
import { usePermission } from "@/lib/permissions";
import { dbErrorMessage } from "@/lib/referentials";

export const Route = createFileRoute("/_authenticated/demandes-coordonnees")({
  head: () => ({
    meta: [
      { title: "Demandes de coordonnées — Fabri RH" },
      {
        name: "description",
        content: "Valider les changements de coordonnées demandés par les employés.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RequestsPage,
});

const KEY = ["contact-requests", "all"];

function RequestsPage() {
  const canReview = usePermission("employees", "edit");
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: KEY,
    enabled: canReview,
    queryFn: async () => {
      const { data: rows, error: err } = await supabase
        .from("contact_change_requests")
        .select(
          "id, employee_id, changes, previous, status, review_note, created_at, reviewed_at, employees(first_names, last_name, matricule)",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (err) throw err;
      return rows;
    },
  });

  const decide = useMutation({
    mutationFn: async (v: { id: string; approve: boolean }) => {
      const note = notes[v.id]?.trim();
      const { error: err } = await supabase.rpc("review_contact_change", {
        _id: v.id,
        _approve: v.approve,
        ...(note ? { _note: note } : {}),
      });
      if (err) throw err;
      return v.approve;
    },
    onSuccess: (approved) => {
      toast.success(approved ? "Demande acceptée, fiche mise à jour." : "Demande refusée.");
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ["employee"] });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
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
        title="Demandes de coordonnées"
        description="Changements demandés par les employés, à valider avant application sur la fiche."
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
            <ul className="mt-2 space-y-0.5 text-sm">
              {Object.entries(r.changes as Record<string, unknown>).map(([k, v]) => (
                <li key={k}>
                  <span className="text-muted-foreground">{CONTACT_FIELD_LABELS[k] ?? k} : </span>
                  {formatContactValue(k, (r.previous as Record<string, unknown>)[k])} →{" "}
                  <strong>{formatContactValue(k, v)}</strong>
                </li>
              ))}
            </ul>
            <Textarea
              className="mt-3"
              rows={2}
              maxLength={500}
              placeholder="Note pour l'employé (facultatif)"
              aria-label="Note pour l'employé"
              value={notes[r.id] ?? ""}
              onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
            />
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ id: r.id, approve: true })}
              >
                <Check /> Accepter
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
                  · <span className="text-muted-foreground">{formatDate(r.created_at)}</span>
                </span>
                <Badge variant="outline">{REQUEST_STATUS_LABELS[r.status] ?? r.status}</Badge>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
