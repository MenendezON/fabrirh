import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { notifySessionExpired, onSessionExpired } from "@/lib/session-expiry";

/**
 * Session expirée : on le dit, on rassure (les saisies en cours sont gardées dans l'onglet)
 * et on ramène à la connexion puis à la page d'origine.
 */
export function SessionExpiredDialog() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => onSessionExpired(() => setOpen(true)), []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setTimeout(notifySessionExpired, 0);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const back = async () => {
    const redirect = location.href;
    queryClient.clear();
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // la session est déjà invalide
    }
    setOpen(false);
    navigate({ to: "/auth", search: { redirect }, replace: true });
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Votre session a expiré</AlertDialogTitle>
          <AlertDialogDescription>
            Pour protéger les données du personnel, vous devez vous reconnecter. Ce que vous étiez
            en train de saisir a été conservé dans cet onglet : vous le retrouverez après la
            connexion.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => void back()}>Me reconnecter</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
