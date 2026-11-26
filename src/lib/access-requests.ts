export const ACCESS_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  approved: "Acceptée",
  rejected: "Refusée",
  cancelled: "Annulée",
};

/**
 * Message lisible pour une erreur d'accès / d'invitation. Une session sans double authentification
 * (aal1) donne des droits vides : on l'explique au lieu d'un message générique.
 */
export function accessErrorMessage(e: unknown): string {
  const m =
    e instanceof Error
      ? e.message
      : typeof e === "object" && e && "message" in e
        ? String((e as { message: unknown }).message)
        : "";
  if (/droits insuffisants|42501|permission denied|row-level security/i.test(m)) {
    return "Droits insuffisants. Si vous avez bien ce rôle, terminez d'abord la double authentification (code à 6 chiffres), puis réessayez.";
  }
  if (/unique|duplicate|one_pending/i.test(m))
    return "Une demande est déjà en attente pour cet employé.";
  return m && !/^(Failed|Network|TypeError)/.test(m) ? m : "Une erreur est survenue. Réessayez.";
}
