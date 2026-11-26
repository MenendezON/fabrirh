import { describe, expect, it } from "vitest";

import { hasBroadPermission, hasPermission } from "./permissions";

describe("hasBroadPermission", () => {
  const employe = [{ resource: "employees", action: "view", scope: "self" }];
  const drh = [{ resource: "employees", action: "view", scope: "all" }];
  it("exclut le libre-service (portée self)", () => {
    expect(hasPermission(employe, "employees", "view")).toBe(true);
    expect(hasBroadPermission(employe, "employees", "view")).toBe(false);
  });
  it("accepte une portée large", () => {
    expect(hasBroadPermission(drh, "employees", "view")).toBe(true);
    expect(hasBroadPermission(undefined, "employees", "view")).toBe(false);
  });
});
