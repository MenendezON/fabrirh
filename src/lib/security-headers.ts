/** HTTPS forcé + en-têtes de sécurité. Pas de CSP stricte : le rendu SSR injecte des scripts en ligne. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function httpsRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  if (LOCAL_HOSTS.has(url.hostname)) return null;
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    url.protocol.replace(":", "");
  if (proto !== "http") return null;
  url.protocol = "https:";
  return new Response(null, { status: 308, headers: { location: url.toString() } });
}

export const SECURITY_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "cross-origin-opener-policy": "same-origin",
};

export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!headers.has(k)) headers.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
