import { MARITAL_LABELS, ID_DOCUMENT_LABELS } from "@/lib/employee-schemas";
import { countryName } from "@/lib/countries";
import { formatDate } from "@/lib/format";

/** Valeur laissée à compléter à la main dans le Word quand l'information manque dans Fabri RH. */
export const BLANK = "……………………";

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** « 2026-11-26 » → « 26 novembre 2026 » (sans dépendre du fuseau ni de l'environnement). */
export function longDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return BLANK;
  const day = Number(m[3]);
  return `${day === 1 ? "1er" : day} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** Montant avec séparateur de milliers insécable : « 250 000 ». */
export function amount(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return BLANK;
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export type ContractKind = "cdd" | "cdi" | "stage" | "consultant";

const QUALITE: Record<ContractKind, string> = {
  cdd: "Contrat à Durée Déterminée (CDD)",
  cdi: "Contrat à Durée Indéterminée (CDI)",
  stage: "Contrat de Stage",
  consultant: "Contrat de Consultant",
};

/** Article 13 : un contrat à durée déterminée ne peut être rompu avant terme que dans trois cas. */
const RUPTURE_DETERMINEE =
  "Il ne peut être mis fin avant terme à un contrat à durée déterminée qu’en cas de faute lourde, d’accord partie constaté par écrit, ou de force majeure et ce, sous réserve du respect des dispositions légales et conventionnelles en la matière.";
const RUPTURE_INDETERMINEE =
  "Le présent contrat à durée indéterminée peut être rompu par l’une ou l’autre des parties dans le respect des dispositions légales et conventionnelles en la matière, notamment en ce qui concerne le préavis et les motifs de rupture.";

export type ContractDocInput = {
  employee: {
    first_names: string;
    last_name: string;
    gender: string | null;
    birth_date: string | null;
    birth_place: string | null;
    marital_status: string | null;
    nationality_code: string | null;
  };
  idDocument: { type: string | null; number: string | null } | null;
  jobTitle: string | null;
  contract: {
    type: ContractKind;
    start_date: string;
    duration_months: number | null;
    probation_months: number | null;
  };
  compensation: {
    base_salary_fcfa: number | null;
    sursalaire_fcfa: number | null;
    transport_allowance_fcfa: number | null;
    other_benefits: string | null;
    convention_category: string | null;
  } | null;
};

export type ContractDocValues = Record<string, string | boolean>;

const SHORT_ID: Record<string, string> = { cni: "CNI" };

function maritalLabel(status: string | null, female: boolean): string | null {
  if (!status) return null;
  const label = MARITAL_LABELS[status as keyof typeof MARITAL_LABELS];
  if (!label) return null;
  if (status === "marie") return female ? "Mariée" : "Marié";
  if (status === "divorce") return female ? "Divorcée" : "Divorcé";
  if (status === "veuf") return female ? "Veuve" : "Veuf";
  return label;
}

/**
 * Valeurs du modèle de CDD. Une information absente de Fabri RH est remplacée par des points de
 * suspension (à compléter dans le Word) et signalée dans `missing`.
 */
export function buildContractValues(input: ContractDocInput): {
  values: ContractDocValues;
  missing: string[];
} {
  const { employee: e, contract: c, compensation: k } = input;
  const missing: string[] = [];
  const need = <T>(value: T | null | undefined | "", label: string): T | null => {
    if (value === null || value === undefined || value === "") {
      missing.push(label);
      return null;
    }
    return value;
  };

  const female = e.gender === "F";
  const birthPlace = need(e.birth_place, "Lieu de naissance");
  const birthDate = need(e.birth_date, "Date de naissance");
  const nationality = need(e.nationality_code, "Nationalité");
  const marital = need(maritalLabel(e.marital_status, female), "Situation matrimoniale");
  const job = need(input.jobTitle, "Poste (affectation)");

  const idType = input.idDocument?.type ?? null;
  const idNumber = input.idDocument?.number ?? null;
  const idLabel =
    idType && idNumber
      ? `${SHORT_ID[idType] ?? ID_DOCUMENT_LABELS[idType as keyof typeof ID_DOCUMENT_LABELS] ?? idType} ${idNumber}`
      : null;
  const piece = need(idLabel, "Pièce d'identité (onglet Identité)");

  const base = need(k?.base_salary_fcfa, "Salaire de base (onglet Rémunération)");
  const sursalaire = k?.sursalaire_fcfa ?? (base === null ? null : 0);
  const transport = k?.transport_allowance_fcfa ?? (base === null ? null : 0);
  const category = need(k?.convention_category, "Catégorie conventionnelle (onglet Rémunération)");
  const open = c.type === "cdi";
  const duration = open ? null : need(c.duration_months, "Durée du contrat");

  const probation = c.probation_months;
  const full = `${e.first_names.trim()} ${e.last_name.trim().toUpperCase()}`.trim();

  const values: ContractDocValues = {
    civilite: female ? "Madame" : "Monsieur",
    e: female ? "e" : "",
    il: female ? "elle" : "il",
    Il: female ? "Elle" : "Il",
    nom_complet: full,
    date_naissance: birthDate ? formatDate(birthDate) : BLANK,
    lieu_naissance: birthPlace ?? BLANK,
    situation_matrimoniale: marital ?? BLANK,
    nationalite: nationality ? countryName(nationality) : BLANK,
    piece_identite: piece ?? BLANK,
    poste: job ?? BLANK,
    categorie_conv: category ?? BLANK,
    titre_duree: open ? "INDETERMINEE" : "DETERMINEE",
    qualite_contrat: QUALITE[c.type],
    nature_duree: open ? "indéterminée" : "déterminée",
    precision_duree: open ? "" : ` de ${duration === null ? BLANK : duration} mois renouvelable`,
    phrase_rupture: open ? RUPTURE_INDETERMINEE : RUPTURE_DETERMINEE,
    avec_essai: probation !== null && probation !== undefined,
    essai_duree: probation ? `${probation} mois` : "",
    essai_debut: longDate(c.start_date),
    base: amount(base),
    sursalaire: amount(sursalaire),
    // Brut = base + sursalaire ; le transport reste une ligne à part, comme dans le modèle.
    brut: base === null ? BLANK : amount(base + (sursalaire ?? 0)),
    transport: amount(transport),
    autres_avantages: k?.other_benefits?.trim() ?? "",
    date_signature: longDate(c.start_date),
  };
  return { values, missing };
}

/** Nom du fichier : CDD_NOM_Prenoms_2026-11-26.docx (sans caractères interdits). */
export function contractFileName(
  employee: { first_names: string; last_name: string },
  startDate: string,
  type: ContractKind = "cdd",
): string {
  const clean = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  return `${type.toUpperCase()}_${clean(employee.last_name).toUpperCase()}_${clean(employee.first_names)}_${startDate}.docx`;
}
