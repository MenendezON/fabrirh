-- 13-contrat-remuneration.sql — composantes de rémunération nécessaires au contrat de travail
-- Prérequis : scripts 01. Idempotent.
-- La ligne de rémunération (déjà datée, protégée par les droits « compensation ») porte désormais, en plus du net :
-- salaire de base, sursalaire, indemnité de transport, autres avantages et catégorie conventionnelle (ex. « 7ème »).
-- Le salaire BRUT du contrat = base + sursalaire : il est calculé à la génération, jamais stocké.
BEGIN;

ALTER TABLE public.compensation ADD COLUMN IF NOT EXISTS base_salary_fcfa bigint CHECK (base_salary_fcfa IS NULL OR base_salary_fcfa >= 0);
ALTER TABLE public.compensation ADD COLUMN IF NOT EXISTS sursalaire_fcfa bigint CHECK (sursalaire_fcfa IS NULL OR sursalaire_fcfa >= 0);
ALTER TABLE public.compensation ADD COLUMN IF NOT EXISTS transport_allowance_fcfa bigint CHECK (transport_allowance_fcfa IS NULL OR transport_allowance_fcfa >= 0);
ALTER TABLE public.compensation ADD COLUMN IF NOT EXISTS other_benefits text CHECK (other_benefits IS NULL OR length(other_benefits) <= 500);
ALTER TABLE public.compensation ADD COLUMN IF NOT EXISTS convention_category text CHECK (convention_category IS NULL OR length(convention_category) BETWEEN 1 AND 30);

COMMIT;
