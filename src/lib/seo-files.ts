/** Pages publiques référencées : tout le reste est derrière une connexion. */
export const PUBLIC_PATHS = ["/", "/confidentialite", "/conditions"] as const;

/** Chemins privés ou techniques à ne pas explorer. */
export const PRIVATE_PREFIXES = [
  "/api/",
  "/auth",
  "/mfa",
  "/reset-password",
  "/accueil",
  "/employes",
  "/contrats",
  "/organigramme",
  "/tableau-de-bord",
  "/permissions",
  "/utilisateurs",
  "/parametres",
  "/journal",
  "/acces-documents",
  "/api-cles",
  "/api-docs",
  "/documentation",
  "/aide",
] as const;

export function robotsTxt(origin: string): string {
  return [
    "User-agent: *",
    "Allow: /$",
    "Allow: /confidentialite",
    "Allow: /conditions",
    ...PRIVATE_PREFIXES.map((p) => `Disallow: ${p}`),
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
}

export function sitemapXml(
  origin: string,
  lastmod = new Date().toISOString().slice(0, 10),
): string {
  const urls = PUBLIC_PATHS.map(
    (p) =>
      `  <url><loc>${origin}${p === "/" ? "/" : p}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq></url>`,
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
