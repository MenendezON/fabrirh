/** Métadonnées de page : un seul endroit pour les titres, descriptions et aperçus sociaux. */
export const SITE_NAME = "Fabri RH";
export const SITE_DESCRIPTION =
  "Outil interne de suivi du personnel de Fabrimétal Sénégal : employés, contrats, documents et sites.";

/**
 * Adresse publique du site (ex. https://rh.fabrimetal.sn), sans barre finale. Facultative :
 * sans elle, l'aperçu social utilise un chemin relatif, que certains réseaux n'affichent pas.
 */
const SITE_URL = ((import.meta.env["VITE_SITE_URL"] as string | undefined) ?? "").replace(
  /\/$/,
  "",
);

export const absoluteUrl = (path: string) => `${SITE_URL}${path}`;

type HeadInput = {
  title: string;
  description: string;
  /** Page à ne pas référencer (connexion, pages privées). */
  noindex?: boolean;
  /** Ajoute l'image d'aperçu (pages publiques seulement). */
  image?: boolean;
};

type Meta = Record<string, string>;

export function pageHead({ title, description, noindex, image }: HeadInput): { meta: Meta[] } {
  const full = title === SITE_NAME ? title : `${title} — ${SITE_NAME}`;
  const meta: Meta[] = [
    { title: full },
    { name: "description", content: description },
    { property: "og:title", content: full },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:locale", content: "fr_FR" },
    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
    { name: "twitter:title", content: full },
    { name: "twitter:description", content: description },
  ];
  if (image) {
    meta.push(
      { property: "og:image", content: absoluteUrl("/og-image.png") },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Fabri RH — le suivi du personnel, sans le classeur." },
      { name: "twitter:image", content: absoluteUrl("/og-image.png") },
    );
  }
  if (noindex) meta.push({ name: "robots", content: "noindex, nofollow" });
  return { meta };
}
