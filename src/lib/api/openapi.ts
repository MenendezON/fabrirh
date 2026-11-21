/** Spécification OpenAPI 3 de l'API de lecture. Les champs viennent de keys.ts : un seul endroit à tenir à jour. */
import {
  API_LEVELS,
  CONTRACT_COLUMNS,
  EMPLOYEE_COLUMNS,
  LEVEL_INFO,
  type ApiLevel,
} from "@/lib/api/keys";

const STRING = { type: "string", nullable: true } as const;
const FIELD_SCHEMAS: Record<string, Record<string, unknown>> = {
  matricule: { type: "string", example: "F0001" },
  nom: { type: "string", example: "Diop" },
  prenoms: { type: "string", example: "Awa" },
  sexe: { type: "string", nullable: true, enum: ["F", "M"], description: "Facultatif." },
  en_poste: { type: "boolean" },
  date_sortie: { type: "string", format: "date", nullable: true },
  contrat_debut: { type: "string", format: "date", nullable: true },
  contrat_fin: { type: "string", format: "date", nullable: true },
  date_naissance: { type: "string", format: "date", nullable: true },
  salaire_net_mensuel_fcfa: { type: "number", nullable: true, description: "FCFA, niveau 4." },
  debut: { type: "string", format: "date" },
  fin_prevue: { type: "string", format: "date", nullable: true },
  fin_effective: { type: "string", format: "date", nullable: true },
  duree_mois: { type: "integer", nullable: true },
};

const schemaFor = (name: string) => FIELD_SCHEMAS[name] ?? STRING;

function objectSchema(columns: string[]) {
  return {
    type: "object",
    properties: Object.fromEntries(columns.map((c) => [c, schemaFor(c)])),
  };
}

const levelNote = (l: ApiLevel) => `${LEVEL_INFO[l].label} : ${LEVEL_INFO[l].description}`;

const pageParams = [
  { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
  {
    name: "per_page",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 1000, default: 100 },
  },
];

const errorResponses = {
  "400": { $ref: "#/components/responses/Error" },
  "401": { $ref: "#/components/responses/Error" },
  "403": { $ref: "#/components/responses/Error" },
  "429": {
    description: "Plus de 120 requêtes par minute.",
    headers: { "Retry-After": { schema: { type: "integer" } } },
  },
};

export function buildOpenApiSpec(origin: string) {
  const employeeFields = API_LEVELS.flatMap((l) => EMPLOYEE_COLUMNS[l]);
  return {
    openapi: "3.0.3",
    info: {
      title: "Fabri RH — API de lecture",
      version: "1.0.0",
      description: [
        "API **en lecture seule** pour les applications internes (paie, pointage, annuaire).",
        "Authentification : en-tête `Authorization: Bearer fms_xxxxxxxx_…` ou `X-API-Key`.",
        "Le niveau de la clé détermine les champs renvoyés (cumulatifs) :",
        ...API_LEVELS.map((l) => `- ${levelNote(l)}`),
        "",
        "Pour essayer une requête : bouton **Authorize**, collez une clé, puis **Try it out**. Chaque essai est journalisé comme un appel réel.",
      ].join("\n"),
    },
    servers: [{ url: `${origin}/api/v1` }],
    security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
    paths: {
      "/employees": {
        get: {
          summary: "Liste des employés",
          description:
            "Niveau 1 minimum. Pour une synchronisation, combiner `presence=tous` et `updated_since`.",
          parameters: [
            {
              name: "presence",
              in: "query",
              schema: { type: "string", enum: ["actifs", "sortis", "tous"], default: "actifs" },
            },
            {
              name: "site",
              in: "query",
              schema: { type: "string" },
              description: "Nom du site principal.",
            },
            {
              name: "updated_since",
              in: "query",
              schema: { type: "string", format: "date-time" },
              description: "Seuls les employés modifiés depuis cette date (ISO).",
            },
            {
              name: "format",
              in: "query",
              schema: { type: "string", enum: ["json", "csv"], default: "json" },
              description: "CSV : UTF-8 avec BOM, total dans l'en-tête `X-Total-Count`.",
            },
            ...pageParams,
          ],
          responses: {
            "200": {
              description: "Page d'employés.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/EmployeeList" } },
                "text/csv": { schema: { type: "string" } },
              },
            },
            ...errorResponses,
          },
        },
      },
      "/employees/{matricule}": {
        get: {
          summary: "Un employé",
          parameters: [
            { name: "matricule", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "L'employé.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Employee" } },
              },
            },
            "404": { $ref: "#/components/responses/Error" },
            ...errorResponses,
          },
        },
      },
      "/contracts": {
        get: {
          summary: "Contrats",
          description: "Niveau 2 (contrats) minimum.",
          parameters: [
            { name: "matricule", in: "query", schema: { type: "string" } },
            ...pageParams,
          ],
          responses: {
            "200": {
              description: "Page de contrats.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/ContractList" } },
              },
            },
            ...errorResponses,
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", description: "Clé `fms_xxxxxxxx_…`" },
        apiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" },
      },
      responses: {
        Error: {
          description: "Erreur.",
          content: {
            "application/json": {
              schema: { type: "object", properties: { error: { type: "string" } } },
            },
          },
        },
      },
      schemas: {
        Employee: {
          ...objectSchema(employeeFields),
          description: "Les champs présents dépendent du niveau de la clé.",
        },
        EmployeeList: {
          type: "object",
          properties: {
            data: { type: "array", items: { $ref: "#/components/schemas/Employee" } },
            page: { type: "integer" },
            per_page: { type: "integer" },
            total: { type: "integer" },
          },
        },
        Contract: objectSchema(CONTRACT_COLUMNS),
        ContractList: {
          type: "object",
          properties: {
            data: { type: "array", items: { $ref: "#/components/schemas/Contract" } },
            page: { type: "integer" },
            per_page: { type: "integer" },
            total: { type: "integer" },
          },
        },
      },
    },
  };
}
