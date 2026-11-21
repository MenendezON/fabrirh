import { useEffect, useState } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { WifiOff } from "lucide-react";

/** Bandeau hors-ligne : jamais d'écran vide sans explication. */
export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (online) return null;
  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground"
    >
      <WifiOff className="size-4" aria-hidden />
      Vous êtes hors connexion. Ce que vous voyez peut être périmé ; la saisie reprendra dès le
      retour du réseau.
    </div>
  );
}

const SLOW_AFTER_MS = 3000;

/** Barre de progression fine + message quand une requête dépasse 3 s (au lieu d'un cercle figé). */
export function SlowNetworkBar() {
  const busy = useIsFetching() + useIsMutating() > 0;
  const [slow, setSlow] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!busy) {
      setSlow(false);
      setShown(false);
      return;
    }
    const a = window.setTimeout(() => setShown(true), 400);
    const b = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [busy]);

  if (!busy || !shown) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50" role="status">
      <div className="h-1 w-full overflow-hidden bg-primary/15">
        <div className="h-full w-1/3 animate-[fabri-slide_1.2s_ease-in-out_infinite] bg-primary" />
      </div>
      {slow && (
        <p className="mx-auto mt-2 w-fit rounded-md bg-card px-3 py-1 text-xs text-muted-foreground shadow ring-1 ring-border">
          Connexion lente… le chargement continue, ne quittez pas la page.
        </p>
      )}
    </div>
  );
}
