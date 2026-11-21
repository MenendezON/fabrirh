import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";

import { PageHeader, RequireRole } from "@/components/app-shell";
import { ErrorState, LoadingState } from "@/components/states";
import { getOpenApiSpec } from "@/lib/api-docs.functions";

export const Route = createFileRoute("/_authenticated/api-docs")({
  head: () => ({
    meta: [
      { title: "Documentation API — Fabri RH" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <RequireRole
      roles={["admin_it"]}
      message="La documentation interactive de l'API est réservée à l'administrateur IT."
    >
      <Content />
    </RequireRole>
  );
}

function Content() {
  const fetchSpec = useServerFn(getOpenApiSpec);
  const spec = useQuery({
    queryKey: ["openapi-spec"],
    queryFn: async () => JSON.parse(await fetchSpec()) as Record<string, unknown>,
    staleTime: 300_000,
  });
  const host = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(true);
  const [failed, setFailed] = useState<unknown>(null);

  useEffect(() => {
    if (!spec.data || !host.current) return;
    let cancelled = false;
    (async () => {
      try {
        // Chargé côté navigateur seulement : l'exclure du rendu serveur garde le Worker léger.
        if (import.meta.env.SSR) return;
        const [{ default: SwaggerUIBundle }] = await Promise.all([
          import("swagger-ui-dist/swagger-ui-bundle.js"),
          import("swagger-ui-dist/swagger-ui.css"),
        ]);
        if (cancelled || !host.current) return;
        SwaggerUIBundle({
          domNode: host.current,
          spec: spec.data,
          docExpansion: "list",
          deepLinking: false,
          persistAuthorization: false,
        });
        setRendering(false);
      } catch (e) {
        if (!cancelled) setFailed(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spec.data]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Administrateur IT"
        title="Documentation API"
        description="Vérifiez vos API : collez une clé via Authorize, puis essayez chaque requête. Les essais sont journalisés comme de vrais appels."
      />
      {spec.isLoading && <LoadingState label="Chargement de la spécification…" />}
      {Boolean(spec.error || failed) && (
        <ErrorState
          error={spec.error ?? failed}
          title="Impossible d'afficher la documentation"
          onRetry={() => void spec.refetch()}
        />
      )}
      {spec.data && rendering && !failed && <LoadingState label="Préparation de l'interface…" />}
      <div ref={host} className="swagger-host rounded-lg bg-white p-2 text-neutral-900" />
    </div>
  );
}
