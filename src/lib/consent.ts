/** Choix de l'utilisateur sur la mesure d'audience (le reste du stockage est strictement nécessaire). */
export type Consent = "accepted" | "refused";
const KEY = "fabri-rh-consent";
const EVENT = "fabri-rh-consent-change";

export function readConsent(): Consent | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "accepted" || v === "refused" ? v : null;
  } catch {
    return null;
  }
}

export function writeConsent(value: Consent | null): void {
  try {
    if (value) window.localStorage.setItem(KEY, value);
    else window.localStorage.removeItem(KEY);
  } catch {
    // stockage indisponible : le choix vaut pour la page en cours seulement
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: value }));
}

export function onConsentChange(fn: (c: Consent | null) => void): () => void {
  const h = () => fn(readConsent());
  window.addEventListener(EVENT, h);
  window.addEventListener("storage", h);
  return () => {
    window.removeEventListener(EVENT, h);
    window.removeEventListener("storage", h);
  };
}
