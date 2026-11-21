import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { disableAnalytics, enableAnalytics } from "@/lib/analytics";
import { onConsentChange, readConsent, writeConsent, type Consent } from "@/lib/consent";

/**
 * Bandeau de consentement. Seul le stockage nécessaire est utilisé d'office (session, préférences) ;
 * la mesure d'audience n'est chargée qu'après « Accepter ». « Refuser » est aussi simple qu'« Accepter ».
 */
export function ConsentBanner() {
  const [choice, setChoice] = useState<Consent | null | undefined>(undefined);

  useEffect(() => {
    setChoice(readConsent());
    return onConsentChange(setChoice);
  }, []);

  useEffect(() => {
    if (choice === "accepted") enableAnalytics();
    else if (choice === "refused") disableAnalytics();
  }, [choice]);

  if (choice === undefined) return null;
  if (choice !== null) {
    return (
      <button
        type="button"
        onClick={() => writeConsent(null)}
        className="fixed bottom-2 left-2 z-40 rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground underline-offset-4 shadow-sm ring-1 ring-border hover:underline print:hidden"
      >
        Gérer mes choix
      </button>
    );
  }
  return (
    <div
      role="dialog"
      aria-label="Choix sur les témoins"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-card p-4 shadow-lg print:hidden sm:left-4 sm:right-auto sm:bottom-4 sm:max-w-md sm:rounded-lg sm:border"
    >
      <p className="text-sm">
        Fabri RH n'utilise que le stockage nécessaire à son fonctionnement (session, préférences).
        Avec votre accord, une mesure d'audience anonyme, sans publicité, nous aide à améliorer
        l'outil.{" "}
        <Link to="/confidentialite" className="underline underline-offset-4">
          En savoir plus
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => writeConsent("accepted")}>
          Accepter
        </Button>
        <Button size="sm" variant="outline" onClick={() => writeConsent("refused")}>
          Refuser
        </Button>
      </div>
    </div>
  );
}
