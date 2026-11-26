import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLES = [
  "admin_it",
  "drh",
  "gestionnaire_rh",
  "paie",
  "manager",
  "direction",
  "auditeur",
] as const;

const uuid = z.string().uuid();

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(2).max(120),
  roles: z.array(z.enum(ROLES)).min(1).max(ROLES.length),
  siteIds: z.array(uuid).max(50).default([]),
  unitIds: z.array(uuid).max(200).default([]),
  redirectTo: z.string().url(),
});

type Ctx = {
  supabase: {
    rpc: (
      fn: "has_permission",
      args: { _resource: string; _action: string },
    ) => PromiseLike<{
      data: boolean | null;
      error: unknown;
    }>;
  };
};

async function requirePermission(ctx: Ctx, action: "create" | "edit") {
  const { data, error } = await ctx.supabase.rpc("has_permission", {
    _resource: "users",
    _action: action,
  });
  if (error || data !== true)
    throw new Error("Accès refusé : droits insuffisants pour gérer les utilisateurs.");
}

/** Trace dans le journal d'audit une opération d'administration qui ne passe pas par une table surveillée. */
async function logAdminEvent(
  actorId: string,
  targetId: string,
  event:
    "mfa_reset" | "password_reset" | "account_disabled" | "account_enabled" | "employees_invited",
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("audit_log").insert({
    created_by: actorId,
    table_name: "auth_users",
    record_id: targetId,
    action: "UPDATE",
    changed_fields: [event],
    new_data: { event, user_id: targetId },
  });
}

/** Création d'un compte par invitation, avec ses rôles et ses périmètres. */
export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.input<typeof inviteSchema>) => inviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context, "create");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.fullName },
      redirectTo: data.redirectTo,
    });
    if (error || !invited.user) {
      const msg = error?.message ?? "";
      if (/already been registered|already exists/i.test(msg)) {
        throw new Error("Un compte existe déjà pour cette adresse e-mail.");
      }
      if (/rate limit/i.test(msg)) {
        throw new Error("Trop d'e-mails envoyés récemment. Réessayez plus tard.");
      }
      throw new Error("L'invitation n'a pas pu être envoyée.");
    }

    // Rôles et périmètres avec les droits de l'administrateur connecté (RLS + journal d'audit).
    const { error: roleError } = await context.supabase
      .from("user_roles")
      .insert(data.roles.map((role) => ({ user_id: invited.user.id, role })));
    if (roleError) {
      throw new Error("Invitation envoyée, mais les rôles n'ont pas pu être attribués.");
    }
    const scopes = [
      ...data.siteIds.map((site_id) => ({ user_id: invited.user.id, site_id })),
      ...data.unitIds.map((org_unit_id) => ({ user_id: invited.user.id, org_unit_id })),
    ];
    if (scopes.length > 0) {
      const { error: scopeError } = await context.supabase.from("user_scopes").insert(scopes);
      if (scopeError) {
        throw new Error("Invitation envoyée, mais les périmètres n'ont pas pu être enregistrés.");
      }
    }
    return { userId: invited.user.id };
  });

const targetSchema = z.object({ userId: uuid });

/** Désactive ou réactive un compte : rôles archivés ou restaurés, et connexion bloquée côté authentification. */
export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string; active: boolean }) =>
    targetSchema.extend({ active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context, "edit");
    if (data.userId === context.userId)
      throw new Error("Vous ne pouvez pas désactiver votre propre compte.");

    // Les rôles d'abord : les garde-fous de la base (dernier administrateur) s'appliquent ici.
    const { error: roleError } = await context.supabase
      .from("user_roles")
      .update({ archived_at: data.active ? null : new Date().toISOString() })
      .eq("user_id", data.userId);
    if (roleError) {
      const m = (roleError as { message?: string }).message ?? "";
      throw new Error(m.includes("dernier") ? m : "Modification refusée.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.active ? "none" : "876000h",
    });
    if (error)
      throw new Error("Les rôles ont été mis à jour, mais pas le blocage de la connexion.");
    await logAdminEvent(
      context.userId,
      data.userId,
      data.active ? "account_enabled" : "account_disabled",
    );
    return { ok: true };
  });

/** Envoie à l'utilisateur un e-mail de réinitialisation du mot de passe. */
export const sendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string; redirectTo: string }) =>
    targetSchema.extend({ redirectTo: z.string().url() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context, "edit");
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("email")
      .eq("id", data.userId)
      .maybeSingle();
    if (!profile?.email) throw new Error("Utilisateur introuvable.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(profile.email, {
      redirectTo: data.redirectTo,
    });
    if (error) {
      throw new Error(
        /rate limit/i.test(error.message)
          ? "Trop d'e-mails envoyés récemment. Réessayez plus tard."
          : "L'e-mail n'a pas pu être envoyé.",
      );
    }
    await logAdminEvent(context.userId, data.userId, "password_reset");
    return { ok: true };
  });

/** Supprime les facteurs TOTP de l'utilisateur : il devra en enregistrer un nouveau à sa prochaine connexion. */
export const resetUserMfa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string }) => targetSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context, "edit");
    if (data.userId === context.userId) {
      throw new Error("Vous ne pouvez pas réinitialiser votre propre double authentification.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: list, error } = await supabaseAdmin.auth.admin.mfa.listFactors({
      userId: data.userId,
    });
    if (error) throw new Error("Impossible de lire les facteurs de cet utilisateur.");
    for (const factor of list?.factors ?? []) {
      const { error: delError } = await supabaseAdmin.auth.admin.mfa.deleteFactor({
        id: factor.id,
        userId: data.userId,
      });
      if (delError) throw new Error("La réinitialisation a échoué.");
    }
    await logAdminEvent(context.userId, data.userId, "mfa_reset");
    return { removed: list?.factors?.length ?? 0 };
  });

const inviteEmployeesSchema = z.object({
  /** Vide = tous les employés en poste sans compte. */
  employeeIds: z.array(uuid).max(1000).optional(),
  /** Simulation : compte seulement, n'envoie aucun e-mail. */
  dryRun: z.boolean().default(false),
  redirectTo: z.string().url(),
});

export type InviteEmployeesResult = {
  dryRun: boolean;
  /** Fiches éligibles : en poste, sans compte, avec une adresse e-mail valide. */
  eligible: number;
  invited: number;
  /** Compte déjà existant à cette adresse, simplement relié à la fiche. */
  linked: number;
  noEmail: number;
  alreadyLinked: number;
  failed: { name: string; reason: string }[];
  /** Vrai si l'envoi s'est arrêté (limite d'e-mails) : relancer plus tard pour le reste. */
  stoppedEarly: boolean;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Donne un accès à des employés : invitation par e-mail, puis lien compte ↔ fiche. Le rôle « employé »
 * est attribué par la base (déclencheur) dès que le lien existe. Réservé à qui peut créer des comptes.
 */
async function runInviteEmployees(
  data: z.output<typeof inviteEmployeesSchema>,
  context: Ctx & { userId: string },
): Promise<InviteEmployeesResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let query = supabaseAdmin
    .from("v_employee_current")
    .select("employee_id, first_names, last_name, professional_email, email")
    .is("archived_at", null)
    .eq("is_active", true);
  if (data.employeeIds?.length) query = query.in("employee_id", data.employeeIds);
  const { data: employees, error } = await query.limit(2000);
  if (error) throw new Error("Impossible de lire la liste des employés.");

  const { data: links } = await supabaseAdmin
    .from("profiles")
    .select("employee_id")
    .not("employee_id", "is", null);
  const linked = new Set((links ?? []).map((l) => l.employee_id as string));

  const result: InviteEmployeesResult = {
    dryRun: data.dryRun,
    eligible: 0,
    invited: 0,
    linked: 0,
    noEmail: 0,
    alreadyLinked: 0,
    failed: [],
    stoppedEarly: false,
  };
  const todo: { id: string; name: string; email: string }[] = [];
  for (const e of employees ?? []) {
    if (!e.employee_id) continue;
    if (linked.has(e.employee_id)) {
      result.alreadyLinked += 1;
      continue;
    }
    const email = (e.professional_email || e.email || "").trim().toLowerCase();
    if (!EMAIL.test(email)) {
      result.noEmail += 1;
      continue;
    }
    todo.push({
      id: e.employee_id,
      name: `${e.first_names ?? ""} ${e.last_name ?? ""}`.trim(),
      email,
    });
  }
  result.eligible = todo.length;
  if (data.dryRun) return result;

  for (const t of todo) {
    const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      t.email,
      {
        data: { full_name: t.name },
        redirectTo: data.redirectTo,
      },
    );
    let userId = invited?.user?.id;
    if (inviteError || !userId) {
      const msg = inviteError?.message ?? "";
      if (/rate limit/i.test(msg)) {
        result.stoppedEarly = true;
        break;
      }
      if (/already been registered|already exists/i.test(msg)) {
        const { data: existing } = await supabaseAdmin
          .from("profiles")
          .select("id, employee_id")
          .ilike("email", t.email)
          .maybeSingle();
        if (existing && !existing.employee_id) {
          userId = existing.id;
          result.linked += 1;
        } else {
          result.failed.push({ name: t.name, reason: "Un compte existe déjà pour cette adresse." });
          continue;
        }
      } else {
        result.failed.push({ name: t.name, reason: "Invitation impossible." });
        continue;
      }
    } else {
      result.invited += 1;
    }
    const { error: linkError } = await supabaseAdmin
      .from("profiles")
      .update({ employee_id: t.id })
      .eq("id", userId);
    if (linkError) {
      result.failed.push({
        name: t.name,
        reason: "Invitation envoyée, mais lien à la fiche impossible.",
      });
    }
  }
  await logAdminEvent(context.userId, context.userId, "employees_invited");
  return result;
}

export const inviteEmployees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.input<typeof inviteEmployeesSchema>) => inviteEmployeesSchema.parse(input))
  .handler(async ({ data, context }): Promise<InviteEmployeesResult> => {
    await requirePermission(context, "create");
    return runInviteEmployees(data, context);
  });

const reviewSchema = z.object({
  requestId: uuid,
  approve: z.boolean(),
  note: z.string().trim().max(500).optional(),
  redirectTo: z.string().url(),
});

/**
 * Traite une demande d'accès (admin IT) : acceptée = invitation envoyée à l'employé puis demande clôturée ;
 * refusée = demande clôturée avec une note.
 */
export const reviewAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.input<typeof reviewSchema>) => reviewSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context, "create");
    const sb = context.supabase as unknown as {
      from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => PromiseLike<{ error: { message?: string } | null }>;
    };
    if (data.approve) {
      const { data: req } = await sb
        .from("access_requests")
        .select("employee_id, status")
        .eq("id", data.requestId)
        .maybeSingle();
      if (!req || req.status !== "pending") throw new Error("Demande introuvable ou déjà traitée.");
      const r = await runInviteEmployees(
        { employeeIds: [req.employee_id as string], dryRun: false, redirectTo: data.redirectTo },
        context,
      );
      if (r.invited + r.linked === 0) {
        throw new Error(
          r.noEmail > 0
            ? "Cette fiche n'a pas d'adresse e-mail valide : complétez-la, puis réessayez."
            : (r.failed[0]?.reason ??
                (r.alreadyLinked > 0 ? "Cet employé a déjà un compte." : "Aucun accès créé.")),
        );
      }
    }
    const { error } = await sb.rpc("review_access_request", {
      _id: data.requestId,
      _approve: data.approve,
      _note: data.note ?? null,
    });
    if (error) throw new Error(error.message ?? "La demande n'a pas pu être traitée.");
    return { ok: true };
  });
