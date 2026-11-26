import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Empty, Section } from "@/components/employees/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABELS,
  DOCUMENT_STATUS_LABELS,
  documentErrorMessage,
  documentRequestRow,
  documentRequestSchema,
  type DocumentKind,
} from "@/lib/document-requests";
import { formatDate } from "@/lib/format";

const key = (employeeId: string) => ["document-requests", employeeId];

/** « Mes attestations » : l'employé demande une attestation de travail ou de congé à la RH. */
export function MyDocumentRequestsTab({ employeeId }: { employeeId: string }) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<DocumentKind>("attestation_travail");
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: requests } = useQuery({
    queryKey: key(employeeId),
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from("document_requests")
        .select("id, kind, leave_start, leave_end, note, status, review_note, created_at")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (err) throw err;
      return data;
    },
  });
  const pendingKinds = new Set(
    (requests ?? []).filter((r) => r.status === "pending").map((r) => r.kind),
  );

  const send = useMutation({
    mutationFn: async () => {
      const parsed = documentRequestSchema.safeParse({ kind, leaveStart, leaveEnd, note });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Demande invalide.");
      const { error: err } = await supabase
        .from("document_requests")
        .insert(documentRequestRow(employeeId, parsed.data));
      if (err) throw err;
    },
    onSuccess: () => {
      toast.success("Demande envoyée aux RH.");
      setNote("");
      setLeaveStart("");
      setLeaveEnd("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: key(employeeId) });
    },
    onError: (e) => setError(documentErrorMessage(e)),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error: err } = await supabase.rpc("cancel_document_request", { _id: id });
      if (err) throw err;
    },
    onSuccess: () => {
      toast.success("Demande annulée.");
      queryClient.invalidateQueries({ queryKey: key(employeeId) });
    },
    onError: (e) => toast.error(documentErrorMessage(e)),
  });

  const alreadyPending = pendingKinds.has(kind);

  return (
    <div className="space-y-6">
      <Section title="Demander une attestation">
        <form
          className="grid gap-4 sm:max-w-xl"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            send.mutate();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="doc-kind">Document</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as DocumentKind)}>
              <SelectTrigger id="doc-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {kind === "attestation_conge" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="doc-start">Congé du (facultatif)</Label>
                <Input
                  id="doc-start"
                  type="date"
                  value={leaveStart}
                  onChange={(e) => setLeaveStart(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="doc-end">au (facultatif)</Label>
                <Input
                  id="doc-end"
                  type="date"
                  value={leaveEnd}
                  min={leaveStart || undefined}
                  onChange={(e) => setLeaveEnd(e.target.value)}
                />
              </div>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="doc-note">Précisions (facultatif)</Label>
            <Textarea
              id="doc-note"
              rows={3}
              maxLength={500}
              placeholder="Ex. : pour un dossier bancaire, une demande de visa…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {alreadyPending && (
            <p className="text-sm text-muted-foreground">
              Une demande de ce type est déjà en attente.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div>
            <Button type="submit" disabled={send.isPending || alreadyPending}>
              {send.isPending ? <Loader2 className="animate-spin" /> : <Send />} Envoyer la demande
            </Button>
          </div>
        </form>
      </Section>

      <Section title="Mes demandes">
        {(requests ?? []).length === 0 ? (
          <Empty>Aucune demande pour le moment.</Empty>
        ) : (
          <ul className="divide-y">
            {(requests ?? []).map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">{DOCUMENT_KIND_LABELS[r.kind] ?? r.kind}</p>
                  <p className="text-muted-foreground">
                    Demandée le {formatDate(r.created_at)}
                    {r.leave_start && ` · congé du ${formatDate(r.leave_start)}`}
                    {r.leave_end && ` au ${formatDate(r.leave_end)}`}
                  </p>
                  {r.review_note && <p className="mt-1">Réponse des RH : « {r.review_note} »</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={r.status === "fulfilled" ? "secondary" : "outline"}>
                    {DOCUMENT_STATUS_LABELS[r.status] ?? r.status}
                  </Badge>
                  {r.status === "pending" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate(r.id)}
                    >
                      Annuler
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
