/**
 * Mesure d'audience : Plausible (sans témoin, sans publicité, données agrégées).
 * Inactive tant que VITE_PLAUSIBLE_DOMAIN n'est pas renseigné, et ne se charge qu'après accord.
 * Variables : VITE_PLAUSIBLE_DOMAIN (ex. rh.fabrimetal.sn), VITE_PLAUSIBLE_SRC (facultatif, instance
 * auto-hébergée ; par défaut https://plausible.io/js/script.js).
 */
const SCRIPT_ID = "fabri-rh-analytics";

export const analyticsDomain = (): string =>
  ((import.meta.env["VITE_PLAUSIBLE_DOMAIN"] as string | undefined) ?? "").trim();

export const analyticsAvailable = (): boolean => analyticsDomain() !== "";

export function enableAnalytics(): void {
  if (!analyticsAvailable() || document.getElementById(SCRIPT_ID)) return;
  const s = document.createElement("script");
  s.id = SCRIPT_ID;
  s.defer = true;
  s.dataset["domain"] = analyticsDomain();
  s.src =
    ((import.meta.env["VITE_PLAUSIBLE_SRC"] as string | undefined) ?? "").trim() ||
    "https://plausible.io/js/script.js";
  document.head.appendChild(s);
}

export function disableAnalytics(): void {
  document.getElementById(SCRIPT_ID)?.remove();
}
