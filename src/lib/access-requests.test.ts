import { describe, expect, it } from "vitest";

import { ACCESS_STATUS_LABELS, accessErrorMessage } from "./access-requests";

describe("accessErrorMessage", () => {
  it("explique la double authentification quand les droits sont vides", () => {
    expect(
      accessErrorMessage(
        new Error("Accès refusé : droits insuffisants pour gérer les utilisateurs."),
      ),
    ).toMatch(/double authentification/);
    expect(accessErrorMessage({ message: "permission denied for table access_requests" })).toMatch(
      /double authentification/,
    );
  });
  it("signale une demande déjà en attente", () => {
    expect(
      accessErrorMessage({
        message: 'duplicate key value violates unique constraint "access_requests_one_pending"',
      }),
    ).toMatch(/déjà en attente/);
  });
  it("garde un message métier lisible et masque le technique", () => {
    expect(accessErrorMessage(new Error("Cette demande a déjà été traitée."))).toBe(
      "Cette demande a déjà été traitée.",
    );
    expect(accessErrorMessage(new TypeError("Failed to fetch"))).toBe(
      "Une erreur est survenue. Réessayez.",
    );
    expect(accessErrorMessage(null)).toBe("Une erreur est survenue. Réessayez.");
  });
  it("traduit les statuts", () => {
    expect(ACCESS_STATUS_LABELS["pending"]).toBe("En attente");
    expect(ACCESS_STATUS_LABELS["approved"]).toBe("Acceptée");
  });
});
