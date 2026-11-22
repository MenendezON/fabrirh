import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  checkSubmission,
  cooldownMs,
  COOLDOWN_BASE_MS,
  MAX_FAILURES,
  MIN_FILL_MS,
} from "@/lib/antispam";
import { buildOpenApiSpec } from "@/lib/api/openapi";
import { CONTRACT_COLUMNS, EMPLOYEE_COLUMNS } from "@/lib/api/keys";
import { clearAllDrafts, clearDraft, loadDraft, saveDraft } from "@/lib/drafts";
import { absoluteUrl, pageHead } from "@/lib/seo";
import { PRIVATE_PREFIXES, PUBLIC_PATHS, robotsTxt, sitemapXml } from "@/lib/seo-files";
import { httpsRedirect, withSecurityHeaders } from "@/lib/security-headers";
import { isSessionError } from "@/lib/session-expiry";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const SRC = walk("src").filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".gen.ts"));
const read = (f: string) => readFileSync(f, "utf8");

describe("secrets : rien de secret dans le navigateur", () => {
  it("le fichier .env ne contient aucune clé de service ni secret", () => {
    for (const f of [".env", ".env.example"]) {
      let env = "";
      try {
        env = read(f);
      } catch {
        continue; // .env n'est plus versionné
      }
      const filled = env.split("\n").filter((l) => /^(SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL)=.+/.test(l));
      expect(filled, f).toEqual([]);
    }
  });
  it("seul du code serveur importe client.server ou lit la clé de service", () => {
    const allowed = (f: string) =>
      f.endsWith(".server.ts") ||
      f.endsWith(".functions.ts") ||
      f.startsWith(join("src", "routes", "api")) ||
      f === join("src", "lib", "api", "server.ts");
    const offenders = SRC.filter(
      (f) => !allowed(f) && /SERVICE_ROLE|client\.server/.test(read(f)) && !f.includes("/test/"),
    );
    expect(offenders).toEqual([]);
  });
  it("les fichiers .functions.ts n'importent client.server que dynamiquement", () => {
    for (const f of SRC.filter((x) => x.endsWith(".functions.ts"))) {
      expect(read(f), f).not.toMatch(/^import .*client\.server/m);
    }
  });
});

describe("liens internes", () => {
  const routes = new Set(
    [...read("src/routeTree.gen.ts").matchAll(/^\s+'(\/[^']*)': typeof/gm)].map(
      (m) => (m[1] as string).replace(/\/$/, "") || "/",
    ),
  );
  const matches = (path: string) =>
    [...routes].some(
      (r) => r === path || new RegExp(`^${r.replace(/\$[A-Za-z]+/g, "[^/]+")}$`).test(path),
    );
  it("chaque to=/href= littéral pointe vers une route existante", () => {
    const broken: string[] = [];
    for (const f of SRC) {
      for (const m of read(f).matchAll(/\b(?:to|href)[=:]\s*[{]?\s*"(\/[^"?#]*)"/g)) {
        const p = (m[1] as string).replace(/\/$/, "") || "/";
        if (p.startsWith("/api/") || /\.(png|svg|ico|webmanifest|xml|txt)$/.test(p)) continue;
        if (!matches(p)) broken.push(`${f}: ${p}`);
      }
    }
    expect(broken).toEqual([]);
  });
  it("le sitemap ne liste que des pages publiques qui existent", () => {
    for (const p of PUBLIC_PATHS) expect(matches(p), p).toBe(true);
  });
});

describe("SEO", () => {
  it("pageHead : titre, description, réseaux sociaux, noindex", () => {
    const { meta } = pageHead({ title: "Test", description: "Desc", noindex: true, image: true });
    const by = (k: string) => meta.find((m) => m["name"] === k || m["property"] === k);
    expect(meta.find((m) => m["title"])?.["title"]).toBe("Test — Fabri RH");
    expect(by("description")?.["content"]).toBe("Desc");
    expect(by("og:image")?.["content"]).toMatch(/og-image\.png$/);
    expect(by("robots")?.["content"]).toContain("noindex");
  });
  it("pageHead sans image n'ajoute pas og:image", () => {
    const { meta } = pageHead({ title: "T", description: "D" });
    expect(meta.some((m) => m["property"] === "og:image")).toBe(false);
  });
  it("absoluteUrl", () => {
    expect(absoluteUrl("/x")).toMatch(/\/x$/);
  });
  it("robots.txt bloque l'espace connecté et annonce le sitemap", () => {
    const t = robotsTxt("https://exemple.sn");
    for (const p of PRIVATE_PREFIXES) expect(t).toContain(`Disallow: ${p}`);
    expect(t).toContain("Sitemap: https://exemple.sn/sitemap.xml");
  });
  it("sitemap.xml liste les pages publiques", () => {
    const x = sitemapXml("https://exemple.sn", "2026-11-21");
    for (const p of PUBLIC_PATHS)
      expect(x).toContain(`<loc>https://exemple.sn${p === "/" ? "/" : p}</loc>`);
    expect(x).not.toContain("/employes");
  });
  it("le fichier public/robots.txt statique n'existe plus (la route le sert)", () => {
    expect(() => readFileSync("public/robots.txt")).toThrow();
  });
  it("les images d'aperçu existent et restent légères", () => {
    for (const f of ["og-image.png", "favicon.svg", "apple-touch-icon.png", "icon-192.png"]) {
      expect(statSync(`public/${f}`).size).toBeLessThan(60_000);
    }
  });
});

describe("HTTPS et en-têtes", () => {
  it("redirige http vers https, sauf en local", () => {
    const r = httpsRedirect(new Request("http://app.exemple.sn/x?y=1"));
    expect(r?.status).toBe(308);
    expect(r?.headers.get("location")).toBe("https://app.exemple.sn/x?y=1");
    expect(httpsRedirect(new Request("http://localhost:3000/"))).toBeNull();
    expect(
      httpsRedirect(
        new Request("http://app.exemple.sn/", { headers: { "x-forwarded-proto": "https" } }),
      ),
    ).toBeNull();
  });
  it("ajoute HSTS et co. sans écraser l'existant", () => {
    const r = withSecurityHeaders(
      new Response("ok", { headers: { "x-frame-options": "SAMEORIGIN" } }),
    );
    expect(r.headers.get("strict-transport-security")).toMatch(/max-age=31536000/);
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });
});

describe("antispam", () => {
  const base = { honeypot: "", shownAt: 0, now: MIN_FILL_MS + 1, failures: 0, lastFailureAt: 0 };
  it("laisse passer un envoi normal", () => expect(checkSubmission(base).ok).toBe(true));
  it("refuse le champ piège rempli", () =>
    expect(checkSubmission({ ...base, honeypot: "x" })).toMatchObject({
      ok: false,
      reason: "honeypot",
    }));
  it("refuse un envoi instantané", () =>
    expect(checkSubmission({ ...base, now: 100 })).toMatchObject({
      ok: false,
      reason: "too-fast",
    }));
  it("impose une pause après trop d'échecs, qui double puis plafonne", () => {
    expect(cooldownMs(MAX_FAILURES - 1)).toBe(0);
    expect(cooldownMs(MAX_FAILURES)).toBe(COOLDOWN_BASE_MS);
    expect(cooldownMs(MAX_FAILURES + 1)).toBe(COOLDOWN_BASE_MS * 2);
    expect(cooldownMs(50)).toBe(300_000);
    const v = checkSubmission({ ...base, failures: MAX_FAILURES, lastFailureAt: base.now - 1000 });
    expect(v).toMatchObject({ ok: false, reason: "cooldown" });
    expect(
      checkSubmission({
        ...base,
        failures: MAX_FAILURES,
        lastFailureAt: base.now - COOLDOWN_BASE_MS - 1,
      }).ok,
    ).toBe(true);
  });
});

describe("session expirée et brouillons", () => {
  it("reconnaît les erreurs de session", () => {
    expect(isSessionError({ message: "JWT expired" })).toBe(true);
    expect(isSessionError({ status: 401 })).toBe(true);
    expect(isSessionError({ code: "PGRST301" })).toBe(true);
    expect(isSessionError(new Error("Connexion impossible"))).toBe(false);
    expect(isSessionError(null)).toBe(false);
  });
  it("sauvegarde, relit et efface un brouillon", () => {
    const store = new Map<string, string>();
    const fake = {
      get length() {
        return store.size;
      },
      key: (i: number) => [...store.keys()][i] ?? null,
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    Object.defineProperty(window, "sessionStorage", { value: fake, configurable: true });
    saveDraft("a", { x: 1 });
    saveDraft("b", { y: 2 });
    expect(loadDraft("a")).toEqual({ x: 1 });
    clearDraft("a");
    expect(loadDraft("a")).toBeNull();
    clearAllDrafts();
    expect(loadDraft("b")).toBeNull();
  });
});

describe("documentation OpenAPI", () => {
  const spec = buildOpenApiSpec("https://exemple.sn") as {
    servers: { url: string }[];
    paths: Record<string, unknown>;
    components: { schemas: Record<string, { properties: Record<string, unknown> }> };
  };
  it("décrit les trois ressources et l'adresse de base", () => {
    expect(spec.servers[0]?.url).toBe("https://exemple.sn/api/v1");
    expect(Object.keys(spec.paths)).toEqual(["/employees", "/employees/{matricule}", "/contracts"]);
  });
  it("reste synchronisée avec les champs réellement renvoyés", () => {
    expect(Object.keys(spec.components.schemas["Employee"]!.properties)).toEqual(
      Object.values(EMPLOYEE_COLUMNS).flat(),
    );
    expect(Object.keys(spec.components.schemas["Contract"]!.properties)).toEqual(CONTRACT_COLUMNS);
  });
  it("la page et le serveur la réservent à l'admin_it", () => {
    expect(read("src/lib/api-docs.functions.ts")).toMatch(/_role: "admin_it"/);
    expect(read("src/routes/_authenticated/api-docs.tsx")).toMatch(/roles=\{\["admin_it"\]\}/);
    expect(read("src/components/app-shell.tsx")).toMatch(
      /to: "\/api-docs"[^}]*roles: \["admin_it"\]/,
    );
  });
});
