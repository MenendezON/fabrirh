import { describe, expect, it } from "vitest";

import {
  contactFormSchema,
  diffContact,
  formatContactValue,
  type ContactCurrent,
} from "./contact-requests";

const current: ContactCurrent = {
  phone: "770000000",
  address: "Dakar",
  marital_status: "celibataire",
  children_count: 0,
};
const same = {
  phone: "770000000",
  address: "Dakar",
  marital_status: "celibataire",
  children_count: "0",
};

describe("diffContact", () => {
  it("ne renvoie rien si rien n'a changé", () => {
    expect(diffContact(same, current)).toEqual({});
  });
  it("ne garde que les champs modifiés", () => {
    expect(diffContact({ ...same, phone: " 771111111 ", children_count: "2" }, current)).toEqual({
      phone: "771111111",
      children_count: 2,
    });
  });
  it("permet de vider un champ texte", () => {
    expect(diffContact({ ...same, address: "" }, current)).toEqual({ address: "" });
  });
  it("traite les valeurs nulles comme vides", () => {
    const empty: ContactCurrent = {
      phone: null,
      address: null,
      marital_status: null,
      children_count: null,
    };
    expect(
      diffContact({ phone: "", address: "", marital_status: "", children_count: "" }, empty),
    ).toEqual({});
  });
});

describe("contactFormSchema", () => {
  it("refuse un nombre d'enfants invalide", () => {
    expect(contactFormSchema.safeParse({ ...same, children_count: "-1" }).success).toBe(false);
    expect(contactFormSchema.safeParse({ ...same, children_count: "31" }).success).toBe(false);
    expect(contactFormSchema.safeParse({ ...same, children_count: "1.5" }).success).toBe(false);
    expect(contactFormSchema.safeParse({ ...same, children_count: "3" }).success).toBe(true);
  });
  it("refuse un texte de plus de 200 caractères", () => {
    expect(contactFormSchema.safeParse({ ...same, address: "x".repeat(201) }).success).toBe(false);
  });
});

describe("formatContactValue", () => {
  it("libellé de la situation familiale", () => {
    expect(formatContactValue("marital_status", "marie")).toBe("Marié(e)");
  });
  it("tiret pour une valeur vide", () => {
    expect(formatContactValue("phone", null)).toBe("—");
    expect(formatContactValue("phone", "")).toBe("—");
  });
});
