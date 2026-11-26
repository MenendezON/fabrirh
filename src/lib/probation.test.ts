import { describe, expect, it } from "vitest";

import { probationEnd, probationLabel } from "./contracts";

describe("période d'essai", () => {
  it("dernier jour = début + durée − 1 jour", () => {
    expect(probationEnd("2026-01-01", 1, false)).toBe("2026-01-31");
    expect(probationEnd("2026-01-15", 2, false)).toBe("2026-03-14");
  });
  it("double la durée une fois renouvelée", () => {
    expect(probationEnd("2026-01-01", 1, true)).toBe("2026-02-28");
    expect(probationEnd("2026-01-15", 2, true)).toBe("2026-05-14");
  });
  it("gère les fins de mois courtes", () => {
    expect(probationEnd("2026-01-31", 1, false)).toBe("2026-02-27");
  });
  it("affiche la durée et la date de fin", () => {
    expect(probationLabel("2026-01-01", 1, true)).toBe("2 mois (renouvelé) — jusqu'au 28/02/2026");
  });
});
