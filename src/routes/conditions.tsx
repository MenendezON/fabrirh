import { createFileRoute } from "@tanstack/react-router";

import { LegalLayout, LegalSection } from "@/components/legal-layout";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/conditions")({
  head: () =>
    pageHead({
      title: "Conditions générales d'utilisation",
      description:
        "Règles d'utilisation de Fabri RH, l'outil interne de gestion du personnel de Fabrimétal Sénégal : accès, responsabilités, sécurité.",
      image: true,
    }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalLayout title="Conditions générales d'utilisation">
      <p>
        Ces conditions encadrent l'usage de Fabri RH, outil interne de Fabrimétal Sénégal. En vous
        connectant, vous les acceptez.
      </p>

      <LegalSection title="1. Accès réservé">
        <p>
          L'outil est réservé au personnel de Fabrimétal autorisé. Les comptes sont créés par
          l'administrateur IT ; il n'y a pas d'inscription libre. Votre rôle détermine ce que vous
          voyez et ce que vous pouvez modifier.
        </p>
      </LegalSection>

      <LegalSection title="2. Votre compte">
        <ul className="list-disc space-y-1 pl-5">
          <li>Gardez votre mot de passe et votre application d'authentification pour vous seul.</li>
          <li>Ne partagez jamais votre compte ; chaque action est journalisée à votre nom.</li>
          <li>Verrouillez votre poste. Une session inactive se ferme automatiquement.</li>
          <li>Signalez tout accès suspect à l'administrateur IT sans attendre.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Usage attendu">
        <ul className="list-disc space-y-1 pl-5">
          <li>Consultez et saisissez seulement les données nécessaires à votre mission.</li>
          <li>
            Exportez et imprimez avec parcimonie ; les fichiers sortis de l'outil restent
            confidentiels.
          </li>
          <li>
            N'utilisez pas l'outil pour un but personnel, ni pour collecter des informations sur des
            collègues.
          </li>
          <li>Saisissez des informations exactes et neutres, notamment dans les appréciations.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Confidentialité">
        <p>
          Les données du personnel sont confidentielles. Vous êtes tenu au secret professionnel pour
          tout ce que vous consultez. Toute divulgation non autorisée peut engager votre
          responsabilité et donner lieu à des sanctions disciplinaires et à des poursuites.
        </p>
      </LegalSection>

      <LegalSection title="5. Clés d'API">
        <p>
          Les clés d'API sont créées par l'administrateur IT, ont une durée de vie limitée et un
          niveau d'accès précis. Elles ne doivent être stockées que dans l'application autorisée,
          jamais dans un courriel ou un document partagé.
        </p>
      </LegalSection>

      <LegalSection title="6. Disponibilité et responsabilité">
        <p>
          L'outil est fourni pour un usage professionnel interne, sans garantie de disponibilité
          permanente. Fabrimétal peut le suspendre pour maintenance ou raison de sécurité. Les
          informations affichées doivent être vérifiées avant toute décision définitive les
          concernant.
        </p>
      </LegalSection>

      <LegalSection title="7. Propriété">
        <p>
          L'outil et son contenu restent la propriété de Fabrimétal Sénégal et de ses prestataires.
          Toute copie ou extraction en dehors de l'usage prévu est interdite.
        </p>
      </LegalSection>

      <LegalSection title="8. Données personnelles">
        <p>
          Le traitement des données est décrit dans la{" "}
          <a href="/confidentialite" className="underline underline-offset-4">
            politique de confidentialité
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="9. Droit applicable">
        <p>
          Ces conditions sont régies par le droit sénégalais. Tout litige relève des juridictions
          compétentes de Dakar.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
