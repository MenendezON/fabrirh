/** Détection d'une session expirée (par opposition à une déconnexion voulue). */
const EVENT = "fabri-rh-session-expired";
let intentional = false;

export function markIntentionalSignOut(): void {
  intentional = true;
}
export function resetIntentionalSignOut(): void {
  intentional = false;
}
export function isIntentionalSignOut(): boolean {
  return intentional;
}

export function isSessionError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { status?: number; code?: string; message?: string };
  const msg = typeof e.message === "string" ? e.message : typeof error === "string" ? error : "";
  return (
    e.status === 401 ||
    e.code === "PGRST301" ||
    /jwt expired|invalid jwt|not authenticated|refresh_token_not_found|invalid refresh token/i.test(
      msg,
    )
  );
}

export function notifySessionExpired(): void {
  if (typeof window === "undefined" || intentional) return;
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function onSessionExpired(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
