#!/usr/bin/env python3
"""Fabrique le modèle balisé du CDD (docxtemplater) à partir du modèle Word d'origine.

Usage : python3 scripts/build-contract-template.py
Entrée : scripts/MODELE_CDD_HOMME_SEBIKHOTANE.docx  — Sortie : src/assets/contract-templates/contract.docx
Les « …… » du modèle deviennent des balises {nom}, le texte juridique n'est pas modifié ; les accords
masculin/féminin passent par {civilite}, {il}, {Il}, {engage}, {dénomme_e}, {e}.
"""
import re, shutil, sys, zipfile

SRC = "scripts/MODELE_CDD_HOMME_SEBIKHOTANE.docx"
DST = "src/assets/contract-templates/contract.docx"
T = re.compile(r'(<w:t(?: [^>]*)?>)([^<]*)(</w:t>)')
DOTS = re.compile(r'^[\s .…]*$')
HAS_DOTS = lambda n: n.strip(' \u00a0') != '' and DOTS.match(n) is not None
PARA = re.compile(r'<w:p[ >].*?</w:p>', re.S)


# ---------------------------------------------------------------------------------------------
# Mise en forme imposée (A4, marges 1", Times New Roman, interligne 1,15)
#   Document  : A4 (11906 × 16838 twips), marges 1" (1440) sur toutes les sections
#   Titre     : Times New Roman 24 pt, gras, centré, interligne 1,15
#   Paragraphes : Times New Roman 12 pt, justifiés, interligne 1,15
# Les alignements « à droite » et « centré » du modèle (D'une part, signatures…) sont conservés.
# ---------------------------------------------------------------------------------------------
FONT = 'Times New Roman'
LINE = 276                      # 1,15 × 240 (interligne « multiple »)
BODY_PT, TITLE_PT = 12, 24      # points
PAGE_W, PAGE_H, MARGIN = 11906, 16838, 1440

PPR_AFTER_SPACING = ['ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection',
                     'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange']
PPR_AFTER_JC = PPR_AFTER_SPACING[PPR_AFTER_SPACING.index('textDirection'):]
RPR_AFTER_SZ = ['highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang',
                'eastAsianLayout', 'specVanish', 'oMath']

def insert_before(xml, tag_names, new):
    """Insère `new` avant le premier élément enfant de `tag_names` (ordre imposé par le schéma OOXML)."""
    m = re.search(r'<w:(%s)[ />]' % '|'.join(tag_names), xml)
    return xml[:m.start()] + new + xml[m.start():] if m else xml + new

def drop(xml, tag):
    xml = re.sub(r'<w:%s(?: [^>]*)?/>' % tag, '', xml)
    return re.sub(r'<w:%s(?: [^>]*)?>.*?</w:%s>' % (tag, tag), '', xml, flags=re.S)

def fmt_rpr(rpr, pt, bold=False):
    """Contenu d'un <w:rPr> : police, taille (et gras pour le titre) imposées, le reste conservé."""
    for t in ('rFonts', 'sz', 'szCs'): rpr = drop(rpr, t)
    if bold:
        rpr = drop(rpr, 'b'); rpr = drop(rpr, 'bCs')
    fonts = '<w:rFonts w:ascii="%s" w:eastAsia="%s" w:hAnsi="%s" w:cs="%s"/>' % ((FONT,) * 4)
    # rStyle doit rester le premier enfant
    m = re.match(r'(<w:rStyle [^>]*/>)', rpr)
    head, rest = (m.group(1), rpr[m.end():]) if m else ('', rpr)
    bold_xml = '<w:b/><w:bCs/>' if bold else ''
    rest = insert_before(rest, ['i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow', 'emboss',
                                'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w',
                                'kern', 'position', 'sz', 'szCs'] + RPR_AFTER_SZ, '') if False else rest
    size = '<w:sz w:val="%d"/><w:szCs w:val="%d"/>' % (pt * 2, pt * 2)
    rest = insert_before(rest, RPR_AFTER_SZ, size)
    return head + fonts + bold_xml + rest

def fmt_paragraph(p, title):
    pt = TITLE_PT if title else BODY_PT
    # propriétés de chaque run, et du saut de paragraphe
    p = re.sub(r'<w:rPr>(.*?)</w:rPr>', lambda m: '<w:rPr>' + fmt_rpr(m.group(1), pt, title) + '</w:rPr>', p, flags=re.S)
    def add_rpr(m):  # run sans <w:rPr> : en créer un
        return m.group(1) + '<w:rPr>' + fmt_rpr('', pt, title) + '</w:rPr>' + m.group(2)
    p = re.sub(r'(<w:r(?: [^>]*)?>)(?!<w:rPr>)((?:<w:(?:t|tab|br|sym)[ />]|<w:fldChar|<w:instrText))', add_rpr, p)
    # propriétés du paragraphe : interligne 1,15 (espacements avant/après conservés), alignement
    m = re.search(r'<w:pPr>(.*?)</w:pPr>', p, flags=re.S)
    ppr = m.group(1) if m else ''
    sp = re.search(r'<w:spacing ([^>]*)/>', ppr)
    keep = ''
    if sp:
        for a in ('before', 'after', 'beforeLines', 'afterLines', 'beforeAutospacing', 'afterAutospacing'):
            am = re.search(r'w:%s="[^"]*"' % a, sp.group(1))
            if am: keep += ' ' + am.group(0)
    jc = re.search(r'<w:jc w:val="(\w+)"/>', ppr)
    align = 'center' if title else (jc.group(1) if jc and jc.group(1) in ('center', 'right') else 'both')
    ppr = drop(drop(ppr, 'spacing'), 'jc')
    ppr = insert_before(ppr, PPR_AFTER_SPACING, '<w:spacing%s w:line="%d" w:lineRule="auto"/>' % (keep, LINE))
    ppr = insert_before(ppr, PPR_AFTER_JC, '<w:jc w:val="%s"/>' % align)
    new = '<w:pPr>' + ppr + '</w:pPr>'
    if m: return p[:m.start()] + new + p[m.end():]
    return re.sub(r'(<w:p(?: [^>]*)?>)', lambda mm: mm.group(1) + new, p, count=1)

def fmt_sections(x):
    """A4 + marges 1" sur chaque section ; colonnes remises à l'échelle de la largeur utile."""
    text_w = PAGE_W - 2 * MARGIN
    x = re.sub(r'<w:pgSz [^>]*/>', '<w:pgSz w:w="%d" w:h="%d"/>' % (PAGE_W, PAGE_H), x)
    x = re.sub(r'<w:pgMar [^>]*/>', lambda m: re.sub(r'w:(top|right|bottom|left)="\d+"', lambda a: 'w:%s="%d"' % (a.group(1), MARGIN), m.group(0)), x)
    def cols(m):
        widths = [int(v) for v in re.findall(r'<w:col w:w="(\d+)"', m.group(0))]
        spaces = [int(v) for v in re.findall(r'w:space="(\d+)"/>', m.group(0))[:0]]
        if len(widths) < 2: return '<w:cols w:space="708"/>'
        gaps = [int(v) for v in re.findall(r'<w:col w:w="\d+" w:space="(\d+)"', m.group(0))]
        total = sum(widths) + sum(gaps)
        k = text_w / total
        out = '<w:cols w:num="%d" w:space="0" w:equalWidth="0">' % len(widths)
        for i, w in enumerate(widths):
            gap = gaps[i] if i < len(gaps) else None
            out += '<w:col w:w="%d"%s/>' % (round(w * k), (' w:space="%d"' % round(gap * k)) if gap is not None else '')
        return out + '</w:cols>'
    return re.sub(r'<w:cols(?: [^>]*)?(?:/>|>.*?</w:cols>)', cols, x, flags=re.S)

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
    x = PARA.sub(lambda m: fmt_paragraph(m.group(0), text(m.group(0)).startswith('CONTRAT DE TRAVAIL')), x)
    x = fmt_sections(x)
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
