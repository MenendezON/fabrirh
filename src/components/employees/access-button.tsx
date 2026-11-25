import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { usePermission } from "@/lib/permissions";
import { dbErrorMessage } from "@/lib/referentials";
import { inviteEmployees } from "@/lib/users.functions";

/** Sur la fiche : indique si l'employé a un compte et, sinon, permet de lui en donner un. */
export function AccessButton({ employeeId }: { employeeId: string }) {
  const canCreate = usePermission("users", "create");
  const canView = usePermission("users", "view");
  const queryClient = useQueryClient();
  const invite = useServerFn(inviteEmployees);
  const key = ["employee-account", employeeId];
  const { data: linked } = useQuery({
    queryKey: key,
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("employee_id", employeeId)
        .maybeSingle();
      if (error) throw error;
      return !!data;
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
        queryClient.invalidateQueries({ queryKey: key });
      } else if (r.noEmail > 0) {
        toast.error("Cette fiche n'a pas d'adresse e-mail valide.", {
          description: "Complétez l'e-mail dans l'onglet Identité, puis réessayez.",
        });
      } else {
        toast.error(r.failed[0]?.reason ?? "Aucun accès créé.");
      }
    },
    onError: (e) => toast.error(dbErrorMessage(e)),
  });

  if (!canView || linked === undefined) return null;
  if (linked) return <Badge variant="secondary">Accès à l'application</Badge>;
  if (!canCreate) return <Badge variant="outline">Sans accès</Badge>;
  return (
    <Button variant="outline" size="sm" disabled={give.isPending} onClick={() => give.mutate()}>
      {give.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />} Donner l'accès
    </Button>
  );
}
