import { describe, expect, it } from "vitest";

import {
  documentErrorMessage,
  documentRequestRow,
  documentRequestSchema,
} from "@/lib/document-requests";

const base = { kind: "attestation_travail", leaveStart: "", leaveEnd: "", note: "" } as const;

describe("documentRequestSchema", () => {
  it("accepte une attestation de travail sans précision", () => {
    expect(documentRequestSchema.safeParse(base).success).toBe(true);
  });
  it("refuse un congé dont la fin précède le début", () => {
    const r = documentRequestSchema.safeParse({
      ...base,
      kind: "attestation_conge",
      leaveStart: "2026-12-10",
      leaveEnd: "2026-12-01",
    });
    expect(r.success).toBe(false);
  });
  it("accepte un congé sans dates (la RH retrouve la période)", () => {
    expect(documentRequestSchema.safeParse({ ...base, kind: "attestation_conge" }).success).toBe(
      true,
    );
  });
  it("limite le motif à 500 caractères", () => {
    expect(documentRequestSchema.safeParse({ ...base, note: "x".repeat(501) }).success).toBe(false);
  });
});

describe("documentRequestRow", () => {
  it("ignore la période pour une attestation de travail", () => {
    const row = documentRequestRow("e1", {
      ...base,
      leaveStart: "2026-12-01",
      leaveEnd: "2026-12-05",
    });
    expect(row.leave_start).toBeNull();
    expect(row.leave_end).toBeNull();
  });
  it("garde la période d'un congé et vide le motif blanc", () => {
    const row = documentRequestRow("e1", {
      kind: "attestation_conge",
      leaveStart: "2026-12-01",
      leaveEnd: "2026-12-05",
      note: "  ",
    });
    expect(row).toMatchObject({ leave_start: "2026-12-01", leave_end: "2026-12-05", note: null });
  });
});

describe("documentErrorMessage", () => {
  it("explique le doublon", () => {
    expect(
      documentErrorMessage(new Error("violates unique constraint document_requests_one_pending")),
    ).toMatch(/déjà en attente/);
  });
});
