import { createFileRoute } from "@tanstack/react-router";

import { robotsTxt } from "@/lib/seo-files";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) =>
        new Response(robotsTxt(new URL(request.url).origin), {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        }),
    },
  },
});
