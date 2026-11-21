import { createFileRoute } from "@tanstack/react-router";

import { LegalLayout, LegalSection } from "@/components/legal-layout";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/confidentialite")({
  head: () =>
    pageHead({
      title: "Politique de confidentialité",
      description:
        "Comment Fabri RH traite les données personnelles des salariés de Fabrimétal Sénégal : finalités, accès, durées de conservation et droits.",
      image: true,
    }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalLayout title="Politique de confidentialité">
      <p>
        Fabri RH est l'outil interne de gestion du personnel de Fabrimétal Sénégal (« Fabrimétal »).
        Il réunit des données personnelles de salariés. Cette page explique lesquelles, pourquoi,
        qui peut les voir, combien de temps elles sont conservées et comment exercer vos droits.
      </p>

      <LegalSection title="1. Qui est responsable ?">
        <p>
          Fabrimétal Sénégal est responsable du traitement. L'administrateur informatique et la
          direction des ressources humaines assurent le fonctionnement et la sécurité de l'outil.
        </p>
      </LegalSection>

      <LegalSection title="2. Données traitées">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Identité et contact :</strong> matricule, nom, prénoms, genre, date et lieu de
            naissance, nationalité, adresse, téléphone, e-mails personnel et professionnel,
            situation familiale, personnes à prévenir en cas d'urgence.
          </li>
          <li>
            <strong>Vie professionnelle :</strong> affectations, sites, contrats, dates d'entrée et
            de sortie, appréciations, documents du dossier.
          </li>
          <li>
            <strong>Données sensibles ou confidentielles :</strong> pièce d'identité, rémunération,
            documents confidentiels, motifs de sortie. Elles ne sont visibles que des rôles
            habilités.
          </li>
          <li>
            <strong>Comptes et sécurité :</strong> adresse e-mail de connexion, rôle, journal des
            actions (qui a modifié quoi, quand), accès aux documents confidentiels, appels des clés
            d'API.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Pourquoi ces données ?">
        <p>
          Pour gérer le personnel : administration du personnel et des contrats, suivi des
          échéances, préparation de la paie, obligations légales (code du travail, sécurité
          sociale), pilotage par des statistiques et sécurité du système. Les données ne sont pas
          utilisées à d'autres fins et ne sont pas vendues.
        </p>
      </LegalSection>

      <LegalSection title="4. Qui y accède ?">
        <p>
          L'accès dépend du rôle et du périmètre (site, unité, équipe) défini par l'administrateur
          IT. Un manager voit son équipe ; la direction consulte ; la paie n'accède qu'à ce dont
          elle a besoin ; personne ne voit ses propres appréciations. Chaque modification et chaque
          ouverture de document confidentiel sont journalisées. Les rôles à forts privilèges exigent
          une double authentification.
        </p>
        <p>
          Des applications internes (paie, pointage) peuvent lire certaines données par une
          interface réservée, avec une clé personnelle à durée limitée, un niveau d'accès précis et
          un journal des appels.
        </p>
      </LegalSection>

      <LegalSection title="5. Hébergement et sécurité">
        <p>
          Les données sont hébergées chez des prestataires techniques (base de données, hébergement
          de l'application) et transmises chiffrées (HTTPS). Les fichiers du dossier sont dans un
          espace privé et ne s'ouvrent que par un lien temporaire. Aucune donnée n'est supprimée par
          les utilisateurs : les éléments sont archivés, ce qui garde la traçabilité.
        </p>
      </LegalSection>

      <LegalSection title="6. Durées de conservation">
        <p>
          Les données sont conservées pendant la durée de la relation de travail, puis archivées
          pour la durée imposée par la loi (obligations sociales, fiscales et prud'homales). Les
          durées précises sont fixées par Fabrimétal avec son conseil juridique ; à leur échéance,
          les dossiers sont supprimés ou anonymisés.
        </p>
      </LegalSection>

      <LegalSection title="7. Témoins (cookies) et stockage local">
        <p>
          L'outil utilise uniquement le stockage nécessaire à son fonctionnement : session de
          connexion, préférences d'affichage, brouillons de formulaires et votre choix sur cette
          page. Ils ne servent pas à vous suivre. Une mesure d'audience anonyme, sans publicité,
          peut être activée : elle ne se déclenche qu'avec votre accord, que vous pouvez changer à
          tout moment via « Gérer mes choix » en bas de page.
        </p>
      </LegalSection>

      <LegalSection title="8. Vos droits">
        <p>
          Conformément à la loi sénégalaise n° 2008-12 sur la protection des données à caractère
          personnel, vous pouvez demander l'accès à vos données, leur rectification, leur effacement
          lorsque la loi le permet, et vous opposer à un traitement pour motif légitime.
          Adressez-vous à votre direction des ressources humaines ou à l'administrateur IT. Vous
          pouvez aussi saisir la Commission de protection des données personnelles (CDP).
        </p>
      </LegalSection>

      <LegalSection title="9. Évolutions">
        <p>
          Cette politique peut évoluer avec l'outil ; la date de version figure en haut de page.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
