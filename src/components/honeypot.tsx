import type { Ref } from "react";

import { HONEYPOT_NAME } from "@/lib/antispam";

/** Champ piège : hors écran, ignoré des lecteurs d'écran et du clavier ; un humain ne le remplit jamais. */
export function Honeypot({ inputRef }: { inputRef: Ref<HTMLInputElement> }) {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label>
        Ne pas remplir
        <input ref={inputRef} type="text" name={HONEYPOT_NAME} tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}
