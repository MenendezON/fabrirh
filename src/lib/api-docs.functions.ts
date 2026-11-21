import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildOpenApiSpec } from "@/lib/api/openapi";

type Ctx = {
  userId: string;
  supabase: {
    rpc: (
      fn: "has_role",
      args: { _user_id: string; _role: "admin_it" },
    ) => PromiseLike<{ data: boolean | null; error: unknown }>;
  };
};

/** Spécification de l'API : servie uniquement à une session admin_it, vérifiée côté serveur. */
export const getOpenApiSpec = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    const { data, error } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId,
      _role: "admin_it",
    });
    if (error || data !== true)
      throw new Error(
        "Accès refusé : la documentation interactive est réservée à l'administrateur IT.",
      );
    // Chaîne JSON : la spécification est un document libre, pas un type métier.
    return JSON.stringify(buildOpenApiSpec(new URL(getRequest().url).origin));
  });
