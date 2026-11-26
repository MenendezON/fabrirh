import { z } from "zod";

export const DOCUMENT_KINDS = [
  { value: "attestation_travail", label: "Attestation de travail" },
  { value: "attestation_conge", label: "Attestation de congé" },
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]["value"];

export const DOCUMENT_KIND_LABELS: Record<string, string> = Object.fromEntries(
  DOCUMENT_KINDS.map((k) => [k.value, k.label]),
);

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  fulfilled: "Délivrée",
  rejected: "Refusée",
  cancelled: "Annulée",
};

export const documentRequestSchema = z
  .object({
    kind: z.enum(["attestation_travail", "attestation_conge"]),
    leaveStart: z.string(),
    leaveEnd: z.string(),
    note: z.string().trim().max(500, "500 caractères maximum."),
  })
  .superRefine((v, ctx) => {
    if (v.kind !== "attestation_conge") return;
    if (v.leaveStart && v.leaveEnd && v.leaveEnd < v.leaveStart) {
      ctx.addIssue({
        code: "custom",
        path: ["leaveEnd"],
        message: "La fin du congé doit suivre son début.",
      });
    }
  });

export type DocumentRequestForm = z.infer<typeof documentRequestSchema>;

/** Valeurs à enregistrer : la période n'existe que pour une attestation de congé. */
export function documentRequestRow(employeeId: string, v: DocumentRequestForm) {
  const conge = v.kind === "attestation_conge";
  return {
    employee_id: employeeId,
    kind: v.kind,
    leave_start: conge && v.leaveStart ? v.leaveStart : null,
    leave_end: conge && v.leaveEnd ? v.leaveEnd : null,
    note: v.note.trim() || null,
  };
}

export function documentErrorMessage(e: unknown): string {
  const m =
    e instanceof Error
      ? e.message
      : typeof e === "object" && e && "message" in e
        ? String((e as { message: unknown }).message)
        : "";
  if (/one_pending|duplicate|unique/i.test(m)) {
    return "Une demande de ce type est déjà en attente.";
  }
  if (/row-level security|permission denied|42501|droits/i.test(m)) {
    return "Vous n'avez pas le droit d'effectuer cette action.";
  }
  return m && !/^(Failed|Network|TypeError)/.test(m) ? m : "Une erreur est survenue. Réessayez.";
}
