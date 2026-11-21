import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { BrandName } from "@/components/brand";

export const LEGAL_UPDATED = "21 novembre 2026";

export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-5 py-4 sm:px-10">
        <Link to="/" aria-label="Fabri RH, accueil">
          <BrandName />
        </Link>
      </header>
      <main id="contenu" className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> Retour à l'accueil
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Version du {LEGAL_UPDATED}</p>
        <div className="legal mt-8 space-y-6 text-[0.95rem] leading-relaxed">{children}</div>
      </main>
      <LegalFooter />
    </div>
  );
}

export function LegalFooter({ inverted }: { inverted?: boolean }) {
  return (
    <footer
      className={
        inverted
          ? "px-6 py-6 text-sm text-sidebar-muted sm:px-12"
          : "border-t px-5 py-6 text-sm text-muted-foreground sm:px-10"
      }
    >
      <nav aria-label="Informations légales" className="flex flex-wrap gap-x-6 gap-y-2">
        <Link to="/confidentialite" className="underline-offset-4 hover:underline">
          Politique de confidentialité
        </Link>
        <Link to="/conditions" className="underline-offset-4 hover:underline">
          Conditions générales d'utilisation
        </Link>
        <span>© Fabrimétal Sénégal</span>
      </nav>
    </footer>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}
