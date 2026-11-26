#!/usr/bin/env python3
"""Fabrique le modèle balisé du CDD (docxtemplater) à partir du modèle Word d'origine.

Usage : python3 scripts/build-contract-template.py
Entrée : scripts/MODELE_CONTRAT.docx  — Sortie : src/assets/contract-templates/contract.docx
Les « …… » du modèle deviennent des balises {nom}, le texte juridique n'est pas modifié ; les accords
masculin/féminin passent par {civilite}, {il}, {Il}, {engage}, {dénomme_e}, {e}.
"""
import re, shutil, sys, zipfile

SRC = "scripts/MODELE_CONTRAT.docx"
DST = "src/assets/contract-templates/contract.docx"
T = re.compile(r'(<w:t(?: [^>]*)?>)([^<]*)(</w:t>)')
DOTS = re.compile(r'^[\s .…]*$')
HAS_DOTS = lambda n: n.strip(' \u00a0') != '' and DOTS.match(n) is not None
PARA = re.compile(r'<w:p[ >].*?</w:p>', re.S)

def nodes(p): return [m.group(2) for m in T.finditer(p)]
def text(p): return ''.join(nodes(p))
def set_nodes(p, new):
    it = iter(new)
    return T.sub(lambda m: m.group(1) + next(it) + m.group(3), p)

def transform(p):
    ns = nodes(p); full = text(p); out = list(ns)
    if not ns: return p
    head = full.startswith('Dont le siège')
    # --- paragraphes « Monsieur ………… » : civilité + nom
    if 'Monsieur' in ns and not head:
        i = ns.index('Monsieur'); out[i] = '{civilite}'
        j = i + 1; first = True
        while j < len(ns) and DOTS.match(ns[j]):
            if HAS_DOTS(ns[j]):
                out[j] = '{nom_complet}' if first else ''
                first = False
            j += 1
        # un espace seul entre « Monsieur » et les points est conservé
    # --- identité
    if full.startswith('Nom du Travailleur'): out[-1] = ' {nom_complet}'
    elif full.startswith('Date de Naissance'): out[-1] = '{date_naissance}'
    elif full.startswith('Lieu de Naissance'): out[-1] = out[-1] + '{lieu_naissance}'
    elif full.startswith('Situation matrimoniale'): out[-1] = '{situation_matrimoniale}'
    elif full.startswith('Nationalité'): out[-1] = out[-1] + ' {nationalite}'
    elif full.startswith('N° du Passeport'): out[-1] = '{piece_identite}'
    elif full.startswith('Ci-après dénommé') and len(ns) == 1: out[0] = 'Ci-après dénommé{e}'
    # --- poste, catégorie
    for k, n in enumerate(ns):
        if full.startswith('Le Travailleur est engagé pour') and HAS_DOTS(n): out[k] = '{poste}'
        if full.startswith('Monsieur') and 'qualité de' in full:
            if HAS_DOTS(n) and len(n.strip()) > 10: out[k] = "{poste} "
            if n == '7': out[k] = '{categorie_conv}'
            if n == 'ème': out[k] = ''
        if n == 'est engagé': out[k] = 'est engagé{e}'
        if full.startswith('Le Travailleur est engagé pour') and n.startswith('Le Travailleur est engagé'): out[k] = n.replace('est engagé', 'est engagé{e}')
    # --- nature du contrat (CDD / CDI / stage / consultant) : mêmes articles, formulations variables
    for k, n in enumerate(ns):
        if n == ' DETERMINEE': out[k] = ' {titre_duree}'
        if full.startswith('Le présent contrat est conclu conformément'):
            out[k] = n.replace('Contrat à Durée Déterminée (CDD)', '{qualite_contrat}')
        if full.startswith('Le présent contrat est conclu pour une durée'):
            if n == ' déterminée': out[k] = ' {nature_duree}'
            if n == ' de 6 mois renouvelable': out[k] = '{precision_duree}'
        if full.startswith('Il ne peut être mis fin avant terme'): out[k] = '{phrase_rupture}'
    # --- essai
    for k, n in enumerate(ns):
        if full.startswith('Au préalable'):
            if n == '1 Mois': out[k] = '{essai_duree}'
            if HAS_DOTS(n) and len(n.strip()) > 5: out[k] = '{essai_debut}'
    # --- rémunération
    if full.startswith('Salaire de base'): out[2] = '{base}'
    if full.startswith('Sursalaire'): out[1] = '{sursalaire}'
    if full.startswith('Salaire BRUT'): out[1] = '{brut}'
    if full.startswith('Indemnité de transport'): out[1] = '{transport}'
    if full.startswith('Autres Avantages'): out[-1] = out[-1] + ' {autres_avantages}'
    if full.startswith('Fait à'): out[-1] = '{date_signature}'
    # --- pronoms (hors paragraphes qui ne parlent pas du travailleur)
    skip = head or full.startswith('Il est régi') or full.startswith('Il ne peut') or full.startswith('Il exercera') or full.startswith('Il lui sera')
    for k, n in enumerate(out):
        if skip: break
        n2 = re.sub(r'\bIl\b', '{Il}', n); n2 = re.sub(r'\bil\b', '{il}', n2)
        out[k] = n2
    if full.startswith('Il exercera'): out[0] = out[0].replace('Il', '{Il}', 1) if ns[0] == 'Il' else out[0]
    for k, n in enumerate(out):
        if 'tenue par aucune' in n: out[k] = n.replace('tenue', 'tenu{e}')
        if ns[k].startswith(' tenu par le secret'): out[k] = ns[k].replace(' tenu ', ' tenu{e} ', 1)
        if (full.startswith('Monsieur') or full.startswith('Au préalable')) and 'soumis' in n and 'Il' not in n:
            out[k] = re.sub(r'\bsoumis\b', 'soumis{e}', out[k])
    return set_nodes(p, out)

def main():
    shutil.copy(SRC, DST)
    zin = zipfile.ZipFile(SRC)
    x = zin.read('word/document.xml').decode('utf8')
    x = PARA.sub(lambda m: transform(m.group(0)), x)
    # paragraphe d'essai conditionnel : balises de boucle dans des paragraphes dédiés
    def wrap(m):
        p = m.group(0)
        if text(p).startswith('Au préalable'):
            loop = lambda t: '<w:p><w:r><w:t>%s</w:t></w:r></w:p>' % t
            return loop('{#avec_essai}') + p + loop('{/avec_essai}')
        return p
    x = PARA.sub(wrap, x)
    with zipfile.ZipFile(DST, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == 'word/document.xml': data = x.encode('utf8')
            zout.writestr(item, data)
    import base64
    b64 = base64.b64encode(open(DST, 'rb').read()).decode()
    open(DST.replace('.docx', '-template.ts'), 'w').write(
        '// Généré par scripts/build-contract-template.py — ne pas modifier à la main.\n'
        'export const CONTRACT_TEMPLATE_BASE64 =\n  "' + b64 + '";\n')
    print('OK', DST)

if __name__ == '__main__': main()
