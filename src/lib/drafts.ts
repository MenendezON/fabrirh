import { useEffect, useRef } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";

/**
 * Brouillons de formulaire : conservés dans l'onglet (sessionStorage), jamais sur disque partagé.
 * Ils survivent à une session expirée puis à la reconnexion ; une déconnexion volontaire les efface.
 */
const PREFIX = "fabri-rh-draft:";

export function saveDraft(key: string, value: unknown): void {
  try {
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // stockage indisponible : pas de brouillon, sans conséquence
  }
}

export function loadDraft<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  try {
    window.sessionStorage.removeItem(PREFIX + key);
  } catch {
    // rien à faire
  }
}

export function clearAllDrafts(): void {
  try {
    const s = window.sessionStorage;
    for (let i = s.length - 1; i >= 0; i--) {
      const k = s.key(i);
      if (k?.startsWith(PREFIX)) s.removeItem(k);
    }
  } catch {
    // rien à faire
  }
}

/** Sauvegarde le formulaire à chaque saisie tant qu'il est actif ; restaure au premier affichage. */
export function useFormDraft<T extends FieldValues>(
  form: UseFormReturn<T>,
  key: string,
  active: boolean,
  onRestore?: () => void,
): { discard: () => void } {
  const restored = useRef(false);
  const { watch, reset } = form;

  useEffect(() => {
    if (!active || restored.current) return;
    restored.current = true;
    const draft = loadDraft<T>(key);
    if (draft) {
      reset(draft);
      onRestore?.();
    }
  }, [active, key, reset, onRestore]);

  useEffect(() => {
    if (!active) {
      restored.current = false;
      return;
    }
    const sub = watch((values) => saveDraft(key, values));
    return () => sub.unsubscribe();
  }, [active, key, watch]);

  return { discard: () => clearDraft(key) };
}
