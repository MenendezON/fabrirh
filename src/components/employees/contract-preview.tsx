import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  generateContractDocument,
  type ContractDocumentResult,
} from "@/lib/contract-document.functions";

function toBlob(base64: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

/** Aperçu du contrat généré à partir du modèle, avec téléchargement du .docx. */
export function ContractPreviewDialog({
  contractId,
  onClose,
}: {
  contractId: string | null;
  onClose: () => void;
}) {
  const generate = useServerFn(generateContractDocument);
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; doc: ContractDocumentResult }
  >({ status: "loading" });

  useEffect(() => {
    if (!contractId) return;
    let cancelled = false;
    setState({ status: "loading" });
    generate({ data: { contractId } })
      .then((doc) => !cancelled && setState({ status: "ready", doc }))
      .catch(
        (e: unknown) =>
          !cancelled &&
          setState({
            status: "error",
            message: e instanceof Error ? e.message : "Le contrat n'a pas pu être généré.",
          }),
      );
    return () => {
      cancelled = true;
    };
  }, [contractId, generate]);

  useEffect(() => {
    if (state.status !== "ready" || !host.current) return;
    const el = host.current;
    let cancelled = false;
    (async () => {
      const { renderAsync } = await import("docx-preview");
      if (cancelled) return;
      el.innerHTML = "";
      await renderAsync(toBlob(state.doc.base64), el, undefined, {
        inWrapper: true,
        ignoreWidth: false,
        breakPages: true,
      });
    })().catch(() => {
      if (!cancelled)
        el.textContent =
          "Aperçu indisponible : téléchargez le contrat pour le consulter dans Word.";
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  const download = () => {
    if (state.status !== "ready") return;
    const url = URL.createObjectURL(toBlob(state.doc.base64));
    const a = document.createElement("a");
    a.href = url;
    a.download = state.doc.fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Dialog open={contractId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle>Contrat de travail</DialogTitle>
        </DialogHeader>
        {state.status === "loading" && (
          <p className="flex items-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="animate-spin" /> Génération du contrat…
          </p>
        )}
        {state.status === "error" && (
          <p role="alert" className="py-6 text-destructive">
            {state.message}
          </p>
        )}
        {state.status === "ready" && (
          <>
            {state.doc.missing.length > 0 && (
              <div
                role="status"
                className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="font-medium">
                    À compléter (laissé en pointillés dans le document) :
                  </p>
                  <ul className="list-disc pl-5">
                    {state.doc.missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <Button size="sm" onClick={download}>
                <Download /> Télécharger (.docx)
              </Button>
            </div>
            <div
              ref={host}
              className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/40"
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
