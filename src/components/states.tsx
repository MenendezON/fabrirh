import { Link } from "@tanstack/react-router";
import { AlertTriangle, Inbox, Loader2, Lock, SearchX } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { userMessage } from "@/lib/log";

export function LoadingState({ label = "Chargement…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  title = "Impossible de charger les données",
}: {
  error?: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <div role="alert" className="rounded-lg border border-destructive/40 bg-card p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 text-destructive" aria-hidden />
        <div>
          <p className="font-medium">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{userMessage(error)}</p>
          {onRetry && (
            <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
              Réessayer
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed bg-card p-10 text-center">
      <Inbox className="size-6 text-muted-foreground" aria-hidden />
      <p className="mt-3 font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-md text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Squelette de liste : la page garde sa forme pendant l'attente, ce qui paraît plus court qu'un cercle. */
export function ListSkeleton({
  rows = 6,
  label = "Chargement…",
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div role="status" aria-label={label} className="space-y-3 py-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Aucun résultat : on explique pourquoi et on propose quoi faire ensuite. */
export function NoResults({
  query,
  suggestions = [
    "Vérifiez l'orthographe (nom, prénom ou matricule).",
    "Essayez un seul mot, ou une partie du matricule.",
    "Retirez un ou plusieurs filtres.",
  ],
  onClear,
  clearLabel = "Effacer la recherche et les filtres",
}: {
  query?: string;
  suggestions?: string[];
  onClear?: () => void;
  clearLabel?: string;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-10 text-center">
      <SearchX className="size-6 text-muted-foreground" aria-hidden />
      <p className="mt-3 font-medium">
        {query ? `Aucun résultat pour « ${query} »` : "Aucun résultat avec ces critères"}
      </p>
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        {suggestions.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      {onClear && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onClear}>
          {clearLabel}
        </Button>
      )}
    </div>
  );
}

/** Accès refusé : dit pourquoi, et propose un chemin de retour. */
export function PermissionDenied({
  title = "Accès réservé",
  reason,
  backTo = "/accueil",
  backLabel = "Retour à l'accueil",
}: {
  title?: string;
  reason: string;
  backTo?: "/accueil" | "/employes";
  backLabel?: string;
}) {
  return (
    <div role="alert" className="mx-auto max-w-md rounded-lg border bg-card p-8 text-center">
      <Lock className="mx-auto size-6 text-muted-foreground" aria-hidden />
      <h1 className="mt-3 text-xl font-bold">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{reason}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Si vous pensez que c'est une erreur, demandez l'accès à l'administrateur IT.
      </p>
      <Button asChild className="mt-5">
        <Link to={backTo}>{backLabel}</Link>
      </Button>
    </div>
  );
}
