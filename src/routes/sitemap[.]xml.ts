import { createFileRoute } from "@tanstack/react-router";

import { sitemapXml } from "@/lib/seo-files";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) =>
        new Response(sitemapXml(new URL(request.url).origin), {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        }),
    },
  },
});
