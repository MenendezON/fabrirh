import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildContractValues,
  contractFileName,
  type ContractDocInput,
} from "@/lib/contract-document";

export type ContractDocumentResult = {
  fileName: string;
  /** Fichier .docx encodé en base64. */
  base64: string;
  /** Informations absentes de Fabri RH : laissées en pointillés dans le document. */
  missing: string[];
};

/**
 * Génère le contrat de travail (CDD) d'un employé à partir du modèle de l'entreprise. Toutes les lectures
 * passent par la session de l'utilisateur : la base applique ses droits (contrat, rémunération, identité).
 */
export const generateContractDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { contractId: string }) =>
    z.object({ contractId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ContractDocumentResult> => {
    const sb = context.supabase;
    const { data: contract } = await sb
      .from("contracts")
      .select("id, employee_id, type, start_date, duration_months, probation_months")
      .eq("id", data.contractId)
      .is("archived_at", null)
      .maybeSingle();
    if (!contract) throw new Error("Contrat introuvable, ou accès refusé.");
    if (contract.type !== "cdd") {
      throw new Error("Le modèle de contrat n'est disponible que pour les CDD pour le moment.");
    }

    const [{ data: employee }, { data: current }, { data: sensitive }, { data: pay }] =
      await Promise.all([
        sb
          .from("employees")
          .select(
            "first_names, last_name, gender, birth_date, birth_place, marital_status, nationality_code",
          )
          .eq("id", contract.employee_id)
          .maybeSingle(),
        sb
          .from("v_employee_current")
          .select("job_title_name")
          .eq("employee_id", contract.employee_id)
          .maybeSingle(),
        sb
          .from("employee_sensitive")
          .select("id_document_type, id_document_number")
          .eq("employee_id", contract.employee_id)
          .is("archived_at", null)
          .maybeSingle(),
        sb
          .from("compensation")
          .select(
            "contract_id, effective_date, base_salary_fcfa, sursalaire_fcfa, transport_allowance_fcfa, other_benefits, convention_category",
          )
          .eq("employee_id", contract.employee_id)
          .is("archived_at", null)
          .order("effective_date", { ascending: false }),
      ]);
    if (!employee) throw new Error("Dossier introuvable, ou accès refusé.");

    // Rémunération : celle rattachée à ce contrat, sinon la plus récente en vigueur à sa date de début.
    const lines = pay ?? [];
    const compensation =
      lines.find((l) => l.contract_id === contract.id) ??
      lines.find((l) => l.effective_date <= contract.start_date) ??
      lines[0] ??
      null;

    const input: ContractDocInput = {
      employee,
      idDocument: sensitive
        ? { type: sensitive.id_document_type, number: sensitive.id_document_number }
        : null,
      jobTitle: current?.job_title_name ?? null,
      contract,
      compensation,
    };
    const { values, missing } = buildContractValues(input);
    const { renderCddDocx } = await import("@/lib/contract-render.server");
    const base64 = renderCddDocx(values);

    // Trace : un contrat contient des données personnelles et salariales.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_log").insert({
      created_by: context.userId,
      table_name: "contracts",
      record_id: contract.id,
      action: "UPDATE",
      changed_fields: ["contract_generated"],
      new_data: { event: "contract_generated", employee_id: contract.employee_id },
    });

    return { fileName: contractFileName(employee, contract.start_date), base64, missing };
  });
