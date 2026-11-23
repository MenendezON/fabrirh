import { z } from "zod";

export const MARITAL_OPTIONS = [
  { value: "celibataire", label: "Célibataire" },
  { value: "marie", label: "Marié(e)" },
  { value: "divorce", label: "Divorcé(e)" },
  { value: "veuf", label: "Veuf / veuve" },
] as const;

export const CONTACT_FIELD_LABELS: Record<string, string> = {
  phone: "Téléphone",
  address: "Adresse",
  marital_status: "Situation familiale",
  children_count: "Nombre d'enfants",
};

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  approved: "Acceptée",
  rejected: "Refusée",
  cancelled: "Annulée",
};

export const contactFormSchema = z.object({
  phone: z.string().trim().max(200, "200 caractères maximum."),
  address: z.string().trim().max(200, "200 caractères maximum."),
  marital_status: z.string(),
  children_count: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) <= 30), "Nombre entier de 0 à 30."),
});
export type ContactForm = z.infer<typeof contactFormSchema>;

export type ContactCurrent = {
  phone: string | null;
  address: string | null;
  marital_status: string | null;
  children_count: number | null;
};

/** Ne garde que les champs réellement modifiés par rapport aux valeurs actuelles. */
export function diffContact(
  form: ContactForm,
  current: ContactCurrent,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const set = (k: keyof ContactCurrent, v: string | number) => {
    out[k] = v;
  };
  const phone = form.phone.trim();
  if (phone !== (current.phone ?? "")) set("phone", phone);
  const address = form.address.trim();
  if (address !== (current.address ?? "")) set("address", address);
  if (form.marital_status && form.marital_status !== (current.marital_status ?? ""))
    set("marital_status", form.marital_status);
  if (
    form.children_count !== "" &&
    Number(form.children_count) !== (current.children_count ?? null)
  )
    set("children_count", Number(form.children_count));
  return out;
}

export function formatContactValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "marital_status")
    return MARITAL_OPTIONS.find((o) => o.value === value)?.label ?? String(value);
  return String(value);
}
