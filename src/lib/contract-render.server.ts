import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

import { CONTRACT_TEMPLATE_BASE64 } from "@/assets/contract-templates/contract-template";
import type { ContractDocValues } from "@/lib/contract-document";

/** Remplit le modèle de contrat (balises {…}) et renvoie le .docx en base64. */
export function renderContractDocx(values: ContractDocValues): string {
  const zip = new PizZip(CONTRACT_TEMPLATE_BASE64, { base64: true });
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });
  doc.render(values);
  return doc.getZip().generate({ type: "base64", compression: "DEFLATE" });
}
