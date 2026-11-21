/**
 * Antispam côté formulaire (première ligne de défense, contournable par un robot qui n'utilise pas
 * le navigateur : la vraie limite reste celle de l'authentification Supabase).
 *  - champ piège invisible (les robots le remplissent, pas les humains)
 *  - délai minimum entre l'affichage et l'envoi
 *  - pause croissante après des échecs répétés
 */
import { useCallback, useRef, useState } from "react";

export const MIN_FILL_MS = 1500;
export const MAX_FAILURES = 5;
export const COOLDOWN_BASE_MS = 15_000;

export type SpamVerdict =
  { ok: true } | { ok: false; reason: "honeypot" | "too-fast" | "cooldown"; waitMs?: number };

export function checkSubmission(input: {
  honeypot: string;
  shownAt: number;
  now: number;
  failures: number;
  lastFailureAt: number;
}): SpamVerdict {
  if (input.honeypot.trim() !== "") return { ok: false, reason: "honeypot" };
  if (input.now - input.shownAt < MIN_FILL_MS) return { ok: false, reason: "too-fast" };
  if (input.failures >= MAX_FAILURES) {
    const wait = cooldownMs(input.failures) - (input.now - input.lastFailureAt);
    if (wait > 0) return { ok: false, reason: "cooldown", waitMs: wait };
  }
  return { ok: true };
}

/** 15 s au 5e échec, puis le double à chaque échec, plafonné à 5 min. */
export function cooldownMs(failures: number): number {
  if (failures < MAX_FAILURES) return 0;
  return Math.min(COOLDOWN_BASE_MS * 2 ** (failures - MAX_FAILURES), 300_000);
}

export const HONEYPOT_NAME = "website";

export function useAntispam() {
  const shownAt = useRef(Date.now());
  const honeypot = useRef<HTMLInputElement>(null);
  const failures = useRef(0);
  const lastFailureAt = useRef(0);
  const [message, setMessage] = useState<string | null>(null);

  const verify = useCallback((): boolean => {
    const verdict = checkSubmission({
      honeypot: honeypot.current?.value ?? "",
      shownAt: shownAt.current,
      now: Date.now(),
      failures: failures.current,
      lastFailureAt: lastFailureAt.current,
    });
    if (verdict.ok) {
      setMessage(null);
      return true;
    }
    setMessage(
      verdict.reason === "cooldown"
        ? `Trop de tentatives. Patientez ${Math.ceil((verdict.waitMs ?? 0) / 1000)} secondes avant de réessayer.`
        : verdict.reason === "too-fast"
          ? "Envoi trop rapide. Patientez une seconde puis réessayez."
          : "Envoi refusé.",
    );
    return false;
  }, []);

  const recordFailure = useCallback(() => {
    failures.current += 1;
    lastFailureAt.current = Date.now();
  }, []);
  const recordSuccess = useCallback(() => {
    failures.current = 0;
  }, []);

  return { honeypotRef: honeypot, verify, recordFailure, recordSuccess, message };
}
