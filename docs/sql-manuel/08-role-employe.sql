-- 08-role-employe.sql — ajoute la valeur « employe » au type de rôles.
-- À exécuter SEUL et AVANT le script 09 : PostgreSQL interdit d'utiliser une valeur d'énumération
-- ajoutée dans la même transaction. Idempotent.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'employe';
