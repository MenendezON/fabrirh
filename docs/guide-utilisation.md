# Fabri RH — Gestion du personnel de Fabrimétal Sénégal

Ce guide est aussi disponible dans l'application, menu **Guide d'utilisation**, pour tous les utilisateurs connectés.

Destiné aux équipes RH, aux managers et à la paie. Ce que vous voyez dépend de votre rôle : un menu
absent signifie que votre rôle n'y donne pas accès.

## 1. Se connecter
1. Ouvrez l'application, saisissez votre e-mail et votre mot de passe.
2. Les rôles DRH, gestionnaire RH, paie et administrateur IT doivent aussi saisir le code à six
   chiffres de leur application d'authentification (première fois : scanner le QR code).
3. Mot de passe oublié : « Mot de passe oublié » sur l'écran de connexion, puis suivez le lien reçu.
4. Après une période d'inactivité (30 minutes par défaut), vous êtes déconnecté par sécurité.

Au clavier : la touche Tab parcourt les éléments ; le premier arrêt est « Aller au contenu ».

## 2. Employés
- **Liste** : recherche par nom ou matricule, filtres (site, unité, statut), export.
- **Créer** : bouton « Nouvel employé ». Le matricule est unique et obligatoire.
- **Fiche** : onglets Identité, Poste, Contrats et sortie, Rémunération, Documents, Appréciations, Historique (selon vos droits). L'onglet Identité contient le **genre** (Femme ou Homme ; « Homme » est proposé par défaut à la création, à corriger si besoin),  l'e-mail personnel, l'**e-mail professionnel** (facultatif) et la **nationalité** (liste de pays, le Sénégal en premier).
- **Rémunération** : chaque ligne peut être rattachée à un **contrat** de l'employé (facultatif).
- **Changer d'affectation** : ajoutez une nouvelle affectation avec sa date de début ; la précédente est fermée la veille.
- **Supprimer** n'existe pas : on **archive**. Une fiche archivée reste dans l'historique et le journal.

## 3. Contrats
- **Nouveau contrat** (onglet Contrats de la fiche) : type (CDI, CDD, stage, consultant), date de début, durée en mois pour les contrats à durée déterminée. La date de fin est calculée (début + durée − 1 jour).
- La durée ne peut pas dépasser le maximum légal paramétré (24 mois par défaut) ; deux contrats d'un même employé ne peuvent pas se chevaucher.
- **Renouveler** : crée le contrat suivant, lié au précédent. **Convertir en CDI** : clôt le CDD et ouvre un CDI.
- **Échéances** : contrats qui se terminent bientôt (délai d'alerte selon le type). **Retraites** : départs à la retraite à venir. **À régulariser** : CDD échus dont l'employé est toujours en poste — renouvelez ou enregistrez la sortie.
- **Cloche** (en haut à droite) : alertes du jour ; elles disparaissent quand la situation est régularisée.

## 4. Sorties
Dans la fiche : « Enregistrer une sortie », date et motif. Le contrat et l'affectation en cours sont
clos à cette date. Certains motifs sont confidentiels et ne s'affichent qu'aux rôles autorisés.
Si la personne revient, créez simplement un nouveau contrat : elle redevient active et son ancienneté
repart de la nouvelle date d'entrée.

## 5. Documents
- Formats PDF, JPG, PNG ; 10 Mo maximum.
- Une **description** facultative (500 caractères) peut accompagner chaque document ; ne mettez pas d'information sensible.
- Déposer une nouvelle version d'un document conserve les précédentes (historique).
- L'ouverture d'un document génère un lien valable environ une minute ; chaque ouverture est tracée.
- Les documents confidentiels sont invisibles pour les rôles non autorisés.
- Une alerte prévient 30 jours avant l'expiration d'un document (titre de séjour, diplôme à renouveler…).

## 6. Tableau de bord
Le tableau de bord inclut une répartition **par genre** (Femmes, Hommes, Non renseigné) de l'effectif en poste. Le modèle d'import comporte une colonne **Genre** (Femme/Homme, F/M acceptés).
Effectif actif, âge et ancienneté moyens/médians, répartitions, entrées et sorties par mois ou par
année. Filtrez par site ou unité. Les salaires n'apparaissent qu'avec la permission de rémunération.
Chaque graphique a son tableau de données et un export CSV/Excel. Un manager ne voit que son périmètre.

## 7. Administration
La gestion des comptes et des droits est réservée à l'**administrateur IT** (`admin_it`). Le DRH et le gestionnaire RH **consultent** les écrans Utilisateurs et Permissions ; pour créer un compte, changer un rôle, désactiver un accès ou réinitialiser un mot de passe ou un MFA, ils contactent l'administrateur IT.
- **Utilisateurs** : inviter, attribuer un ou plusieurs rôles avec leur périmètre, désactiver, réinitialiser le mot de passe ou le MFA.
- **Permissions** : matrice rôles × permissions × portée (tout, site, unité, équipe, soi-même). Le système empêche de se retirer son propre accès d'administration.
- **API et clés** (administrateur IT uniquement) : voir le chapitre 10.
- **Journal d'audit** : qui a fait quoi et quand, avec les valeurs avant/après (lecture seule).
- **Accès aux documents** : qui a ouvert quel document.
- **Paramètres** : âge de retraite, durée maximale d'un CDD, délais d'alerte, durée d'inactivité, et « Notifications par e-mail » (interrupteur). L'onglet **Alertes** indique quels rôles reçoivent chaque type d'alerte dans la cloche (administrateur IT et DRH).

## 8. Import du classeur « SUIVIS DU PERSONNEL FMS »
Réservé au DRH et au gestionnaire RH. Principe : (1) charger le classeur, (2) corriger les
rapprochements de valeurs (départements, postes, catégories) — une valeur non rapprochée bloque
l'import, (3) lancer la **simulation** (rien n'est écrit) et exporter le rapport d'anomalies,
(4) corriger la source ou les rapprochements, (5) lancer l'**exécution** — tout ou rien. Relancer le
même fichier ne crée pas de doublons. Le bouton **Importer** de la page Employés propose le **modèle de fichier** (Excel ou CSV, avec une feuille d'instructions) et un **contrôle** du fichier sans rien enregistrer. L'enregistrement définitif sera disponible après la mise à jour de la base.

## 9. Appréciations
Onglet **Appréciations** de la fiche (visible si votre rôle y a droit). Une appréciation a une nature (contrat, performance, autre), une date, une note de 1 à 5 facultative, un titre facultatif et un commentaire. Le texte n'apparaît jamais dans l'historique. Les appréciations (de contrat, de performance) sont confidentielles. Le **DRH** les crée, les modifie et les archive ; le **gestionnaire RH** les crée et les modifie ; le **manager** (son périmètre) et la **direction** peuvent seulement les **consulter** ; la paie et l'administrateur IT n'y ont pas accès. Un employé ne voit jamais ses propres appréciations.

## 10. Donner accès aux données à d'autres applications (administrateur IT)
Menu **API et clés**. Chaque application (paie, pointage…) reçoit sa propre clé, en lecture seule.
1. **Nouvelle clé** : nom de l'application, niveau d'accès (1 identité, 2 contrats, 3 coordonnées, 4 rémunération), site éventuel, date d'expiration.
2. La **durée de vie est obligatoire** : 365 jours au plus (paramètre « Durée de vie maximale d'une clé d'API »). Pour renouveler, créer une nouvelle clé puis révoquer l'ancienne.
3. La clé s'affiche **une seule fois** : la copier et la transmettre de façon sécurisée. Si elle est perdue, la révoquer et en créer une autre.
4. Choisir le niveau le plus bas suffisant : niveau 4 pour la paie seulement. Pour un rapport Power BI partagé, niveau 1 ou 2.
5. **Révoquer** coupe l'accès immédiatement. Le tableau des 100 derniers appels montre qui a lu quoi.
Détails techniques pour les développeurs : `docs/api.md`.

## 11. Aide et incidents
- Message d'erreur en rouge avec « Réessayer » : vérifiez votre connexion puis réessayez.
- « Vous n'avez pas le droit… » : demandez l'accès à l'administrateur RH.
- Signalement : indiquez la page, l'heure et le message affiché ; les erreurs techniques sont consignées automatiquement.

## 12. Espace employé (libre-service)

**Administrateur IT — donner l'accès aux employés.** *Utilisateurs → Inviter les employés* : l'écran simule d'abord (nombre d'employés invitables, sans e-mail valide, déjà reliés), puis envoie une invitation à chacun. Pour un seul employé : bouton *Donner l'accès* sur sa fiche. Le rôle **Employé** est attribué automatiquement dès que le compte est lié à la fiche.

**Employé.** Après avoir choisi son mot de passe, l'employé arrive sur *Mon profil* : ses informations, son poste, ses contrats, sa rémunération et ses documents — et seulement les siens. Pour changer téléphone, adresse, situation familiale ou nombre d'enfants : onglet *Mes coordonnées* → *Envoyer pour validation*. Une seule demande à la fois ; il peut l'annuler tant qu'elle est en attente.

**RH.** *Demandes de coordonnées* (menu, droit de modifier les employés) : comparer l'ancien et le nouveau, accepter (la fiche est mise à jour) ou refuser avec une note.

Sur téléphone, le menu s'ouvre par le bouton en haut à gauche ; les écrans s'adaptent à la largeur.

### Comptes et dossiers (automatique)

- Chaque compte créé reçoit **automatiquement un dossier employé** et le rôle « Employé » (il ne voit que ses données). Si un dossier non lié porte la même adresse e-mail, il est utilisé ; sinon un dossier est créé avec un matricule provisoire `PROV-0001`…
- Un matricule provisoire se remplace **une seule fois** (onglet Identité → Modifier) ; ensuite il est permanent.
- **DRH / gestionnaire RH** : sur la fiche d'un employé sans compte, bouton **Demander l'accès**. L'**admin IT** traite la demande dans **Demandes d'accès** (accepter = invitation par e-mail, ou refuser). L'admin IT peut aussi cliquer directement **Donner l'accès**.
- Rôles DRH, gestionnaire RH, paie et admin IT : terminez la double authentification, sinon aucun droit n'est actif.

### Période d'essai

- À la création d'un contrat, choisissez la **période d'essai** : aucune, 1 mois ou 2 mois. Elle est **renouvelable une seule fois** (même durée) avec le bouton « Renouveler l'essai » dans l'onglet Contrats de la fiche.
- Le suivi se trouve dans **Contrats → Périodes d'essai** : fin d'essai, temps restant, site et unité.
- La **DRH et les gestionnaires RH** reçoivent une alerte (cloche, et e-mail si activé) 15 jours avant la fin de l'essai ; ce délai se règle dans Paramètres RH.

### Contrat de travail automatique (CDD, CDI, stage, consultant)

- Renseignez la **rémunération** de l'employé (onglet Rémunération : base, sursalaire, transport, autres avantages, catégorie conventionnelle), son **affectation** (poste), son identité (naissance, situation, nationalité, pièce d'identité) et son **contrat** (type, durée sauf CDI, période d'essai).
- Dans l'onglet **Contrats**, le bouton **Contrat** génère le contrat à partir du modèle de l'entreprise : aperçu à l'écran, puis **Télécharger (.docx)**.
- Une information absente est laissée en **pointillés** dans le document et listée dans l'avertissement : complétez-la dans Fabri RH puis régénérez, ou dans Word.
- Le même modèle sert aux 4 types ; seules quatre formulations changent : titre, « en qualité de… », article 3 (durée) et article 13 (rupture). Un CDI n'a ni durée ni « renouvelable » ; les formulations CDI, stage et consultant sont à faire valider par la direction juridique.
- Salaire brut = base + sursalaire. Le texte s'accorde au féminin (Madame, engagée…) selon le genre de la fiche. La date de signature et le début de l'essai reprennent la date de début du contrat.
- Le modèle se modifie dans Word (`scripts/MODELE_CDD_HOMME_SEBIKHOTANE.docx`), puis `python3 scripts/build-contract-template.py` régénère le modèle balisé. Chaque génération est tracée dans le journal d'audit.
