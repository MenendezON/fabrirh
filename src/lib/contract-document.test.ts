import PizZip from "pizzip";
import { describe, expect, it } from "vitest";

import {
  amount,
  BLANK,
  buildContractValues,
  contractFileName,
  longDate,
  type ContractDocInput,
} from "./contract-document";
import { renderContractDocx } from "./contract-render.server";

const FULL: ContractDocInput = {
  employee: {
    first_names: "Mamadou Lamine",
    last_name: "Diop",
    gender: "M",
    birth_date: "1992-03-14",
    birth_place: "Thiès",
    marital_status: "marie",
    nationality_code: "SN",
  },
  idDocument: { type: "cni", number: "1 234 567 890 123" },
  jobTitle: "Soudeur",
  contract: { type: "cdd", start_date: "2026-12-01", duration_months: 6, probation_months: 1 },
  compensation: {
    base_salary_fcfa: 250000,
    sursalaire_fcfa: 50000,
    transport_allowance_fcfa: 26000,
    other_benefits: null,
    convention_category: "7ème",
  },
};

function textOf(base64: string): string {
  const xml = new PizZip(base64, { base64: true }).file("word/document.xml")!.asText();
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'");
}

describe("contrat de travail — valeurs", () => {
  it("calcule brut = base + sursalaire, transport à part", () => {
    const { values, missing } = buildContractValues(FULL);
    expect(values["base"]).toBe("250 000");
    expect(values["brut"]).toBe("300 000");
    expect(values["transport"]).toBe("26 000");
    expect(values["civilite"]).toBe("Monsieur");
    expect(values["nom_complet"]).toBe("Mamadou Lamine DIOP");
    expect(missing).toEqual([]);
  });
  it("accorde au féminin", () => {
    const { values } = buildContractValues({
      ...FULL,
      employee: { ...FULL.employee, gender: "F", marital_status: "celibataire" },
    });
    expect(values).toMatchObject({ civilite: "Madame", e: "e", il: "elle", Il: "Elle" });
  });
  it("laisse des points et signale ce qui manque", () => {
    const { values, missing } = buildContractValues({
      ...FULL,
      employee: { ...FULL.employee, birth_place: null, nationality_code: null },
      compensation: null,
    });
    expect(values["lieu_naissance"]).toBe(BLANK);
    expect(missing).toEqual(expect.arrayContaining(["Lieu de naissance", "Nationalité"]));
    expect(missing.some((m) => m.startsWith("Salaire de base"))).toBe(true);
    expect(values["brut"]).toBe(BLANK);
  });
  it("formate les dates et les montants", () => {
    expect(longDate("2026-12-01")).toBe("1er décembre 2026");
    expect(longDate("2026-03-05")).toBe("5 mars 2026");
    expect(amount(1234567)).toBe("1 234 567");
    expect(contractFileName({ first_names: "Aïssatou", last_name: "Ndiaye" }, "2026-12-01")).toBe(
      "CDD_NDIAYE_Aissatou_2026-12-01.docx",
    );
  });
});

describe("contrat de travail — autres types", () => {
  const render = (type: "cdi" | "stage" | "consultant", extra = {}) => {
    const input = { ...FULL, contract: { ...FULL.contract, type, ...extra } };
    return textOf(renderContractDocx(buildContractValues(input).values));
  };
  it("CDI : durée indéterminée, sans durée à saisir", () => {
    const { missing } = buildContractValues({
      ...FULL,
      contract: { ...FULL.contract, type: "cdi", duration_months: null },
    });
    expect(missing).not.toContain("Durée du contrat");
    const text = render("cdi", { duration_months: null });
    expect(text).toContain("CONTRAT DE TRAVAIL A DUREE INDETERMINEE");
    expect(text).toContain("en qualité Contrat à Durée Indéterminée (CDI)");
    expect(text).toContain("conclu pour une durée indéterminée.");
    expect(text).not.toContain("renouvelable");
    expect(text).toContain("Le présent contrat à durée indéterminée peut être rompu");
    expect(text).not.toContain("avant terme");
    expect(text).not.toMatch(/[{}]/);
  });
  it("stage et consultant : même modèle, durée déterminée", () => {
    expect(render("stage")).toContain("en qualité Contrat de Stage");
    expect(render("consultant")).toContain("en qualité Contrat de Consultant");
    expect(render("stage")).toContain("durée déterminée de 6 mois renouvelable");
  });
  it("le nom du fichier reprend le type", () => {
    expect(contractFileName({ first_names: "A", last_name: "B" }, "2026-12-01", "cdi")).toBe(
      "CDI_B_A_2026-12-01.docx",
    );
  });
});

describe("contrat de travail — document Word", () => {
  it("remplit le modèle sans balise ni pointillé restants", () => {
    const text = textOf(renderContractDocx(buildContractValues(FULL).values));
    expect(text).not.toMatch(/[{}]/);
    expect(text).not.toContain("…");
    expect(text).toContain("Nom du Travailleur :   Mamadou Lamine DIOP");
    expect(text).toContain("Lieu de Naissance : Thiès");
    expect(text).toContain("Monsieur Mamadou Lamine DIOP est engagé par la Société");
    expect(text).toContain("en qualité de Soudeur à la catégorie 7ème");
    expect(text).toContain("durée déterminée de 6 mois renouvelable");
    expect(text).toContain("période d’essai de 1 mois à compter du 1er décembre 2026");
    expect(text).toContain("Salaire BRUT : 300 000 F CFA");
    expect(text).toContain("Fait à Sebikotane, le 1er décembre 2026");
    // Phrases impersonnelles du modèle : jamais accordées.
    expect(text).toContain("Il est régi par");
    expect(text).toContain("Il ne peut être mis fin");
    expect(text).toContain("Il lui sera éventuellement");
  });
  it("supprime le paragraphe d'essai quand il n'y en a pas", () => {
    const { values } = buildContractValues({
      ...FULL,
      contract: { ...FULL.contract, probation_months: null },
    });
    const text = textOf(renderContractDocx(values));
    expect(text).not.toContain("période d’essai");
  });
  it("féminise le texte", () => {
    const { values } = buildContractValues({
      ...FULL,
      employee: { ...FULL.employee, gender: "F", first_names: "Awa" },
    });
    const text = textOf(renderContractDocx(values));
    expect(text).toContain("Madame Awa DIOP est engagée par la Société");
    expect(text).toContain("Ci-après dénommée");
    expect(text).toContain("Elle déclare en outre n’être tenue par aucune clause");
    expect(text).toContain("Madame Awa DIOP est tenue par le secret professionnel");
  });
});
