import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import {
  CONTACT_FIELD_LABELS,
  MARITAL_OPTIONS,
  REQUEST_STATUS_LABELS,
  contactFormSchema,
  diffContact,
  formatContactValue,
  type ContactCurrent,
} from "@/lib/contact-requests";
import { formatDate } from "@/lib/format";
import { dbErrorMessage } from "@/lib/referentials";

const key = (employeeId: string) => ["contact-requests", employeeId];

export function MyContactTab({
  employeeId,
  current,
}: {
  employeeId: string;
  current: ContactCurrent;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    phone: current.phone ?? "",
    address: current.address ?? "",
    marital_status: current.marital_status ?? "",
    children_count: current.children_count?.toString() ?? "",
  });
  const [error, setError] = useState<string | null>(null);

  const { data: requests } = useQuery({
    queryKey: key(employeeId),
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from("contact_change_requests")
        .select("id, changes, previous, status, review_note, created_at, reviewed_at")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (err) throw err;
      return data;
    },
  });
  const pending = requests?.find((r) => r.status === "pending");

  const send = useMutation({
    mutationFn: async () => {
      const parsed = contactFormSchema.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Valeurs invalides.");
      const changes = diffContact(parsed.data, current);
      if (Object.keys(changes).length === 0)
        throw new Error("Aucune modification par rapport à votre fiche.");
      const { error: err } = await supabase
        .from("contact_change_requests")
        .insert({ employee_id: employeeId, changes });
      if (err) throw err;
    },
    onSuccess: () => {
      setError(null);
      toast.success("Demande envoyée.", {
        description: "Le service RH la validera avant tout changement.",
      });
      queryClient.invalidateQueries({ queryKey: key(employeeId) });
    },
    onError: (e) => setError(e instanceof Error && !("code" in e) ? e.message : dbErrorMessage(e)),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error: err } = await supabase.rpc("cancel_contact_change", { _id: id });
      if (err) throw err;
    },
    onSuccess: () => {
      toast.success("Demande annulée.");
      queryClient.invalidateQueries({ queryKey: key(employeeId) });
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  return (
    <div className="space-y-6">
      <Section title="Modifier mes coordonnées">
        {pending ? (
          <p className="text-sm text-muted-foreground">
            Une demande est déjà en attente de validation par le service RH. Vous pourrez en envoyer
            une nouvelle une fois qu'elle sera traitée ou annulée.
          </p>
        ) : (
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              send.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="mc-phone">Téléphone</Label>
              <Input
                id="mc-phone"
                inputMode="tel"
                maxLength={200}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mc-address">Adresse</Label>
              <Input
                id="mc-address"
                maxLength={200}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mc-marital">Situation familiale</Label>
              <Select
                value={form.marital_status}
                onValueChange={(v) => setForm({ ...form, marital_status: v })}
              >
                <SelectTrigger id="mc-marital">
                  <SelectValue placeholder="Non renseignée" />
                </SelectTrigger>
                <SelectContent>
                  {MARITAL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mc-children">Nombre d'enfants</Label>
              <Input
                id="mc-children"
                inputMode="numeric"
                value={form.children_count}
                onChange={(e) => setForm({ ...form, children_count: e.target.value })}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive sm:col-span-2">
                {error}
              </p>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={send.isPending}>
                {send.isPending && <Loader2 className="animate-spin" />} Envoyer pour validation
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Les changements ne sont appliqués qu'après validation par le service RH.
              </p>
            </div>
          </form>
        )}
      </Section>

      <Section title="Mes demandes">
        {!requests || requests.length === 0 ? (
          <Empty>Aucune demande pour le moment.</Empty>
        ) : (
          <ul className="divide-y">
            {requests.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 text-sm">
                  <p className="text-xs text-muted-foreground">{formatDate(r.created_at)}</p>
                  <ul className="mt-1 space-y-0.5">
                    {Object.entries(r.changes as Record<string, unknown>).map(([k, v]) => (
                      <li key={k}>
                        <span className="text-muted-foreground">
                          {CONTACT_FIELD_LABELS[k] ?? k} :{" "}
                        </span>
                        {formatContactValue(k, (r.previous as Record<string, unknown>)[k])} →{" "}
                        <strong>{formatContactValue(k, v)}</strong>
                      </li>
                    ))}
                  </ul>
                  {r.review_note && (
                    <p className="mt-1 text-muted-foreground">Note RH : {r.review_note}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={r.status === "pending" ? "secondary" : "outline"}>
                    {REQUEST_STATUS_LABELS[r.status] ?? r.status}
                  </Badge>
                  {r.status === "pending" && (
                    <Button
                      size="sm"
                      variant="outline"
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
