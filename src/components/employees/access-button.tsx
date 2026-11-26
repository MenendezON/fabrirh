import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { accessErrorMessage } from "@/lib/access-requests";
import { usePermission } from "@/lib/permissions";
import { inviteEmployees } from "@/lib/users.functions";

/**
 * Sur la fiche : indique si l'employé a un compte. Sans compte : l'admin IT le crée directement ;
 * la DRH / les gestionnaires RH envoient une demande à l'admin IT.
 */
export function AccessButton({ employeeId }: { employeeId: string }) {
  const canCreate = usePermission("users", "create");
  const canRequest = usePermission("employees", "edit");
  const queryClient = useQueryClient();
  const invite = useServerFn(inviteEmployees);
  const accountKey = ["employee-account", employeeId];
  const requestKey = ["employee-access-request", employeeId];

  const { data: hasAccount, error: accountError } = useQuery({
    queryKey: accountKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("employee_has_account", {
        _employee_id: employeeId,
      });
      if (error) throw error;
      return data === true;
    },
  });
  const { data: pending } = useQuery({
    queryKey: requestKey,
    enabled: hasAccount === false && (canRequest || canCreate),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("access_requests")
        .select("id")
        .eq("employee_id", employeeId)
        .eq("status", "pending")
        .is("archived_at", null)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
  });

  const give = useMutation({
    mutationFn: () =>
      invite({
        data: {
          employeeIds: [employeeId],
          dryRun: false,
          redirectTo: `${window.location.origin}/reset-password`,
        },
      }),
    onSuccess: (r) => {
      if (r.invited + r.linked > 0) {
        toast.success("Accès donné.", {
          description: "L'employé reçoit un e-mail pour choisir son mot de passe.",
        });
        queryClient.invalidateQueries({ queryKey: accountKey });
        queryClient.invalidateQueries({ queryKey: requestKey });
      } else if (r.noEmail > 0) {
        toast.error("Cette fiche n'a pas d'adresse e-mail valide.", {
          description: "Complétez l'e-mail dans l'onglet Identité, puis réessayez.",
        });
      } else {
        toast.error(r.failed[0]?.reason ?? "Aucun accès créé.");
      }
    },
    onError: (e) => toast.error(accessErrorMessage(e)),
  });

  const ask = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("access_requests").insert({ employee_id: employeeId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Demande envoyée à l'administrateur IT.");
      queryClient.invalidateQueries({ queryKey: requestKey });
    },
    onError: (e) => toast.error(accessErrorMessage(e)),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("cancel_access_request", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Demande annulée.");
      queryClient.invalidateQueries({ queryKey: requestKey });
    },
    onError: (e) => toast.error(accessErrorMessage(e)),
  });

  if (accountError) return null; // fiche hors périmètre ou session incomplète : rien à proposer
  if (hasAccount === undefined) return null;
  if (hasAccount) return <Badge variant="secondary">Accès à l'application</Badge>;
  if (canCreate) {
    return (
      <Button variant="outline" size="sm" disabled={give.isPending} onClick={() => give.mutate()}>
        {give.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />} Donner l'accès
      </Button>
    );
  }
  if (!canRequest) return <Badge variant="outline">Sans accès</Badge>;
  if (pending) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline">Demande d'accès en attente</Badge>
        <Button
          variant="ghost"
          size="sm"
          disabled={cancel.isPending}
          onClick={() => cancel.mutate(pending)}
        >
          Annuler
        </Button>
      </div>
    );
  }
  return (
    <Button variant="outline" size="sm" disabled={ask.isPending} onClick={() => ask.mutate()}>
      {ask.isPending ? <Loader2 className="animate-spin" /> : <Send />} Demander l'accès
    </Button>
  );
}
