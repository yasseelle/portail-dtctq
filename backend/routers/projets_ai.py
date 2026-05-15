"""
routers/projets_ai.py
======================
Analyse IA intelligente pour le Suivi des Projets ONEE.

Phase 1 — Découverte de projets  : Claude lit tous les documents, détecte les projets
                                    par numéro de marché (TC/SR) et localisation,
                                    retourne des suggestions que l'admin peut approuver.

Phase 2 — Construction timeline  : Pour un projet approuvé, Claude lit le contenu txt
                                    des documents liés et construit la timeline précise.

Phase 3 — Système vivant         : Chaque nouveau document est analysé et rattaché
                                    automatiquement au bon projet (si confiance > seuil).

Accès : Super Admin uniquement pour les actions d'analyse.
        Tous les admins pour approuver/rejeter.

Dans main.py :
  from routers import projets_ai
  app.include_router(projets_ai.router)
"""

import os
import re
import json
import time
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel

import models, auth
from database import get_db

router = APIRouter(prefix="/projets-ai", tags=["Projets IA"])

SUPER_ADMIN = "84488R"

# ── Chargement config IA ──────────────────────────────────────────────────────
def _load_env():
    for loc in [
        Path(r"C:\projets\portail-dtctq\.env"),
        Path(__file__).resolve().parents[1] / ".env",
    ]:
        if loc.exists():
            with open(loc, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        os.environ.setdefault(k.strip(), v.strip())
            break

_load_env()
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", os.getenv("API_KEY"))
CLAUDE_MODEL      = os.environ.get("CLAUDE_MODEL", "claude-haiku-4-5-20251001")

# Fichier de config des chemins (sauvegardé par le super admin)
CONFIG_FILE = Path(__file__).resolve().parents[1] / "projets_ai_config.json"

DEFAULT_CONFIG = {
    "txt_paths": {
        "courrier":         r"C:\courrier\texts",
        "bordereau":        r"C:\bordereau_envoi\texts",
        "courrier_depart":  r"C:\courrier_depart_reception\texts",
        "devis":            r"C:\devis\texts",
    },
    "batch_size": 30,
    "txt_truncate_chars": 500,
    "confidence_threshold": 65,
    "auto_link_threshold": 80,
}


# =============================================================================
# HELPERS CONFIG
# =============================================================================

def load_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
            # Merge avec defaults pour les clés manquantes
            merged = {**DEFAULT_CONFIG, **saved}
            merged["txt_paths"] = {**DEFAULT_CONFIG["txt_paths"], **saved.get("txt_paths", {})}
            return merged
        except Exception:
            pass
    return DEFAULT_CONFIG.copy()


def save_config(cfg: dict):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


# =============================================================================
# HELPERS LECTURE TXT
# =============================================================================

def _read_txt(txt_path: str, max_chars: int = 500) -> str:
    """Lit le contenu txt d'un document scanné."""
    if not txt_path:
        return ""
    p = Path(txt_path)
    if not p.exists():
        return ""
    try:
        content = p.read_text(encoding="utf-8", errors="ignore")
        return content[:max_chars].strip()
    except Exception:
        return ""


def _find_txt_by_date(txt_dir: Path, date_str: str, extra_hint: str = "") -> str:
    """
    Cherche un fichier txt par correspondance de date.
    Date DB format : "09/04/2026" -> cherche "20260409*.txt" dans le dossier.
    Methode principale quand pdf_path est vide en DB.
    """
    if not date_str or not txt_dir.exists():
        return ""
    parts = date_str.strip().split("/")
    if len(parts) != 3:
        return ""
    try:
        date_prefix = f"{parts[2]}{parts[1].zfill(2)}{parts[0].zfill(2)}"
    except Exception:
        return ""
    try:
        matches = list(txt_dir.glob(f"{date_prefix}*.txt"))
        if matches:
            return str(sorted(matches)[-1])
        year  = parts[2]
        month = parts[1].zfill(2)
        day   = parts[0].zfill(2)
        for f in txt_dir.glob("*.txt"):
            nm = f.stem
            if year in nm and month in nm and day in nm:
                return str(f)
    except Exception:
        pass
    return ""


def _find_txt_file(table: str, pdf_path: str, txt_paths: dict,
                   date_str: str = "", extra_hint: str = "") -> str:
    """
    Cherche le fichier txt correspondant a un document.
    Strategie en 3 etapes :
    1. Via pdf_path (si disponible)
    2. Via date du document (principal pour docs sans pdf_path)
    3. Via extra_hint (expediteur/destinataire) dans le nom du fichier
    """
    txt_dir = Path(txt_paths.get(table, ""))

    # Etape 1 : via pdf_path
    if pdf_path:
        base = Path(pdf_path).stem
        if txt_dir.exists():
            for candidate in [
                txt_dir / f"{base}.txt",
                txt_dir / f"{base.lower()}.txt",
            ]:
                if candidate.exists():
                    return str(candidate)
            try:
                for f in txt_dir.glob("*.txt"):
                    if f.stem.lower() == base.lower():
                        return str(f)
            except Exception:
                pass
            m = re.search(r"(\d{8})", base)
            if m:
                date_part = m.group(1)
                try:
                    for f in txt_dir.glob(f"{date_part}*.txt"):
                        return str(f)
                except Exception:
                    pass

    # Etape 2 : via date du document
    if date_str and txt_dir.exists():
        found = _find_txt_by_date(txt_dir, date_str, extra_hint)
        if found:
            return found

    # Etape 3 : via extra_hint
    if extra_hint and txt_dir.exists():
        hint_clean = re.sub(r'[^A-Za-z0-9]', '', extra_hint.upper())[:8]
        if hint_clean:
            try:
                for f in txt_dir.glob("*.txt"):
                    if hint_clean in f.stem.upper():
                        return str(f)
            except Exception:
                pass

    return ""


def _extract_marche_number(text: str) -> Optional[str]:
    """
    Extrait le numéro de marché ONEE depuis un texte.
    Formats reconnus :
      TC98310P2 / TC 98310 P2 / TC98310 P2 / SR95614 / SR 95614 P2
      Marché N° TC98310P2 / MARCHE : TC97132P2
    """
    if not text:
        return None
    t = text.upper()
    patterns = [
        # TC ou SR suivi de chiffres + suffixe optionnel P1/P2/P3
        r'\b(TC\s*\d{4,6}\s*(?:P\d)?)\b',
        r'\b(SR\s*\d{4,6}\s*(?:P\d)?)\b',
        # Marché N° TCXXXXX
        r'MARCH[EÉ]\s*[N°:]*\s*[:\s]*(TC\s*\d{4,6}\s*(?:P\d)?)',
        r'MARCH[EÉ]\s*[N°:]*\s*[:\s]*(SR\s*\d{4,6}\s*(?:P\d)?)',
        # N° TC / N°TC
        r'N[°º\.]\s*(TC\s*\d{4,6}\s*(?:P\d)?)',
        r'N[°º\.]\s*(SR\s*\d{4,6}\s*(?:P\d)?)',
    ]
    for pat in patterns:
        m = re.search(pat, t)
        if m:
            # Normalise : supprime les espaces internes → TC98310P2
            return re.sub(r'\s+', '', m.group(1))
    return None


def _extract_project_name_from_objet(objet: str, marche: str) -> str:
    """
    Extrait le nom propre du projet depuis le champ objet du bordereau/courrier.
    Ex: "Marché N°TC98310P2 : Réfection des lignes 60kV N°21,22 TIT MELLIL"
     → "Réfection des lignes 60kV N°21,22 TIT MELLIL"
    """
    if not objet:
        return ""
    # Supprime le préfixe "Marché N°TCXXXX :" ou "MARCHE : TCXXXX"
    cleaned = re.sub(
        r'(?i)march[eé]\s*[n°:º\.]*\s*(?:TC|SR)\s*\d{4,6}\s*(?:P\d)?\s*[:\-–]?\s*',
        '', objet
    ).strip()
    # Supprime aussi si le numéro de marché est juste au début
    if marche:
        cleaned = re.sub(
            r'(?i)^' + re.escape(marche) + r'\s*[:\-–]?\s*',
            '', cleaned
        ).strip()
    # Nettoyage < > parfois présents dans les bordereaux
    cleaned = re.sub(r'[<>]', '', cleaned).strip()
    return cleaned or objet


def _build_doc_summary(row, table: str, txt_paths: dict, max_chars: int) -> dict:
    """Construit le résumé d'un document pour l'envoi à Claude."""
    if table == "courrier":
        pdf_path     = getattr(row, "pdf_path", "")
        objet        = getattr(row, "objet", "") or ""
        ref          = getattr(row, "expediteur", "") or ""
        date         = getattr(row, "date_courrier", "") or ""
        destinataire = ""
    elif table == "bordereau":
        pdf_path     = getattr(row, "pdf_path", "")
        objet        = getattr(row, "objet", "") or ""
        ref          = getattr(row, "reference", "") or ""
        date         = ""
        destinataire = getattr(row, "destinataire", "") or ""
    elif table == "courrier_depart":
        pdf_path     = getattr(row, "pdf_depart_path", "")
        objet        = getattr(row, "objet", "") or ""
        ref          = getattr(row, "reference", "") or ""
        date         = getattr(row, "date_depart", "") or ""
        destinataire = getattr(row, "destinataire", "") or ""
    elif table == "devis":
        pdf_path     = getattr(row, "pdf_path", "")
        objet        = getattr(row, "objet", "") or ""
        ref          = getattr(row, "reference", "") or ""
        date         = getattr(row, "date_devis", "") or ""
        destinataire = getattr(row, "destinataire", "") or ""
    else:
        pdf_path = ""; objet = ""; ref = ""; date = ""; destinataire = ""

    # Cherche le fichier txt (contenu OCR)
    txt_file    = _find_txt_file(table, pdf_path, txt_paths)
    txt_content = _read_txt(txt_file, max_chars) if txt_file else ""

    # ── Extraction numéro marché ─────────────────────────────────────────────
    # Cherche dans objet COMPLET (pas tronqué) + txt + ref + destinataire
    all_text = f"{objet} {ref} {destinataire} {txt_content}"
    marche   = _extract_marche_number(all_text)

    # ── Extraction nom projet depuis objet ───────────────────────────────────
    # L'objet bordereau contient souvent :
    # "Réfection des lignes 60kV N°21,22 <TIT MELLIL>" ou
    # "Marché N°TC98310P2 : Réfection des lignes..."
    # On extrait la partie descriptive comme nom de projet
    project_name_hint = _extract_project_name_from_objet(objet, marche or "")

    return {
        "id":                row.id,
        "table":             table,
        "reference":         ref[:100],
        "objet":             objet,           # ← COMPLET, pas tronqué
        "objet_court":       objet[:120],     # Pour affichage
        "project_name_hint": project_name_hint,  # Nom extrait directement
        "destinataire":      destinataire[:80],
        "date":              date,
        "marche":            marche or "",
        "txt_extrait":       txt_content[:max_chars] if txt_content else "",
    }


# =============================================================================
# AUTH
# =============================================================================

def require_super_admin(current_user=Depends(auth.get_current_user)):
    if current_user.matricule != SUPER_ADMIN:
        raise HTTPException(403, "Réservé au Super Admin uniquement")
    return current_user


# =============================================================================
# SCHEMAS
# =============================================================================

class ConfigUpdate(BaseModel):
    txt_paths:             Dict[str, str]
    batch_size:            Optional[int] = 30
    txt_truncate_chars:    Optional[int] = 500
    confidence_threshold:  Optional[int] = 65
    auto_link_threshold:   Optional[int] = 80


class SuggestionApproval(BaseModel):
    suggestion_id:  str                    # ID temporaire de la suggestion
    nom:            str                    # Nom final (peut être modifié par admin)
    type_projet:    Optional[str] = "autre"
    localisation:   Optional[str] = ""
    description:    Optional[str] = ""
    priorite:       Optional[str] = "normale"
    doc_links:      List[Dict[str, Any]]   # [{table, doc_id, etape, doc_ref, doc_titre, doc_date}]


class SuggestionReject(BaseModel):
    suggestion_id: str
    raison:        Optional[str] = ""


class LiveDocCheck(BaseModel):
    table:    str
    doc_id:   int
    doc_ref:  Optional[str] = ""
    doc_titre:Optional[str] = ""
    doc_date: Optional[str] = ""
    txt_path: Optional[str] = ""


# =============================================================================
# ÉTAPES TIMELINE
# =============================================================================

ETAPES_ORDRE = {
    "demande_initiale":     1,
    "reunion":              2,
    "etude_technique":      3,
    "carnet_piquetage":     4,
    "approvisionnement":    5,
    "bon_execution":        6,
    "travaux_en_cours":     7,
    "devis_realisation":    8,
    "bon_livraison":        9,
    "reception_travaux":    10,
    "cloture":              11,
    "renouvellement":       12,
    "autre":                99,
}

ETAPES_LABELS = {
    "demande_initiale":  "📬 Demande initiale",
    "reunion":           "🤝 Réunion",
    "etude_technique":   "📐 Étude technique",
    "carnet_piquetage":  "📍 Carnet de piquetage",
    "approvisionnement": "📦 Approvisionnement matériel",
    "bon_execution":     "✅ Bon d'exécution",
    "travaux_en_cours":  "🔨 Travaux en cours",
    "devis_realisation": "💰 Devis de réalisation",
    "bon_livraison":     "📤 Bon de livraison",
    "reception_travaux": "🏁 Réception travaux",
    "cloture":           "🎉 Clôture",
    "renouvellement":    "🔄 Renouvellement/Rénovation",
    "autre":             "📄 Document",
}


# =============================================================================
# CLAUDE CALLS
# =============================================================================

def _call_claude(prompt: str, max_tokens: int = 2000) -> str:
    """Appel Claude avec gestion d'erreur."""
    if not ANTHROPIC_API_KEY:
        raise HTTPException(503, "Clé API Claude non configurée dans .env")
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}]
        )
        return response.content[0].text.strip()
    except Exception as e:
        raise HTTPException(500, f"Erreur Claude AI : {str(e)}")


def _parse_json_response(text: str) -> Any:
    """Parse JSON depuis réponse Claude (enlève les backticks)."""
    clean = re.sub(r"```json\s*|```\s*", "", text).strip()
    # Cherche le premier [ ou { 
    start = min(
        (clean.find("[") if "[" in clean else len(clean)),
        (clean.find("{") if "{" in clean else len(clean)),
    )
    if start < len(clean):
        clean = clean[start:]
    return json.loads(clean)


def _pre_cluster_by_marche(docs: List[dict]) -> tuple:
    """
    Groupe les documents par numéro de marché AVANT d'appeler Claude.
    Pour chaque groupe avec marché connu, construit le nom du projet
    directement depuis les champs objet des bordereaux (sans IA).

    Retourne:
      - clusters_with_marche : projets déjà résolus (marché + nom trouvés)
      - docs_without_marche  : documents sans marché, à analyser par Claude
    """
    marche_map: Dict[str, List[dict]] = {}
    no_marche: List[dict] = []

    for doc in docs:
        m = doc.get("marche", "").strip().upper()
        if m and len(m) >= 5:
            if m not in marche_map:
                marche_map[m] = []
            marche_map[m].append(doc)
        else:
            no_marche.append(doc)

    clusters = []
    for marche, group_docs in marche_map.items():
        # Cherche le meilleur nom de projet dans le groupe
        # Priorité : bordereau > courrier_depart > courrier > devis
        project_name = ""
        for priority_table in ["bordereau", "courrier_depart", "courrier", "devis"]:
            for doc in group_docs:
                if doc["table"] == priority_table and doc.get("project_name_hint"):
                    candidate = doc["project_name_hint"].strip()
                    if len(candidate) > len(project_name):
                        project_name = candidate
            if project_name:
                break

        # Fallback : objet complet du premier bordereau
        if not project_name:
            for doc in group_docs:
                if doc.get("objet") and len(doc["objet"]) > 10:
                    project_name = doc["objet"].strip()
                    break

        # Détermine le destinataire principal (= nom entreprise)
        destinataire = ""
        for doc in group_docs:
            if doc.get("destinataire") and doc["table"] == "bordereau":
                destinataire = doc["destinataire"]
                break

        clusters.append({
            "marche":       marche,
            "project_name": project_name or f"Projet {marche}",
            "destinataire": destinataire,
            "docs":         group_docs,
            "pre_resolved": bool(project_name),
        })

    return clusters, no_marche


def _discover_projects_batch(docs: List[dict], existing_projects: List[dict]) -> List[dict]:
    """
    Phase 1 : Découverte intelligente de projets.

    Stratégie en 2 temps :
    1. Pre-clustering par numéro de marché (sans Claude, instantané)
       → Nom du projet extrait directement depuis l'objet bordereau
    2. Claude analyse uniquement les documents sans numéro de marché détecté
    """
    # ── ÉTAPE 1 : Pre-clustering par marché ──────────────────────────────────
    clusters, docs_without_marche = _pre_cluster_by_marche(docs)

    suggestions = []
    sug_counter = len(suggestions)

    # Convertit les clusters pré-résolus en suggestions directes
    for i, cluster in enumerate(clusters):
        marche = cluster["marche"]

        # Vérifie si ce marché existe déjà parmi les projets existants
        existing_id = None
        for ep in existing_projects:
            ep_marche = re.sub(r'\s+', '', (ep.get("marche_numero") or ep.get("nom", "")).upper())
            if marche.replace(" ", "") in ep_marche or ep_marche in marche.replace(" ", ""):
                existing_id = ep["id"]
                break

        # Détermine l'étape de chaque document
        doc_links = []
        for doc in cluster["docs"]:
            etape = _guess_etape_from_objet(doc.get("objet", ""), doc["table"])
            doc_links.append({
                "table":      doc["table"],
                "doc_id":     doc["id"],
                "etape":      etape,
                "raison":     f"Marché {marche} détecté dans {doc['table']} — {doc.get('objet_court','')[:60]}",
                "doc_ref":    doc.get("reference", ""),
                "doc_titre":  doc.get("objet_court", "")[:100],
                "doc_date":   doc.get("date", ""),
            })

        suggestions.append({
            "suggestion_id":      f"pre_{i}",
            "nom":                cluster["project_name"],
            "type_projet":        "ligne_electrique",
            "localisation":       _extract_localisation(cluster["project_name"]),
            "marche_numero":      marche,
            "description":        f"Marché {marche} — {cluster['project_name'][:100]}",
            "priorite":           "normale",
            "confiance":          95,   # Haute confiance car extraction directe
            "est_renouvellement": any(kw in cluster["project_name"].upper()
                                      for kw in ["RENOUVEL", "RÉNOVATION", "RÉFECTION", "REMPLACEMENT", "REFONTE"]),
            "projet_existant_id": existing_id,
            "documents":          doc_links,
            "source":             "pre_cluster",   # Pas besoin de Claude
        })

    # ── ÉTAPE 2 : Claude pour les documents sans marché ──────────────────────
    if docs_without_marche:
        if len(docs_without_marche) > 0:
            docs_text = "\n".join([
                f"[{d['table'].upper()} #{d['id']}] "
                f"De/Ref:{d['reference'][:60]} | Destinataire:{d.get('destinataire','')[:40]} | "
                f"Date:{d['date']} | "
                f"OBJET COMPLET:{d['objet'][:300]} | "
                f"Texte OCR:{d['txt_extrait'][:150] if d['txt_extrait'] else 'non disponible'}"
                for d in docs_without_marche
            ])

            existing_text = "\n".join([
                f"- ID:{p['id']} | {p['nom']} | Marché:{p.get('marche_numero','?')}"
                for p in existing_projects
            ]) or "Aucun projet existant"

            prompt = f"""Tu es un expert en gestion de projets ONEE (Office National de l'Électricité et de l'Eau Potable, Maroc).

PROJETS DÉJÀ EXISTANTS :
{existing_text}

DOCUMENTS SANS NUMÉRO DE MARCHÉ DÉTECTÉ (à analyser) :
{docs_text}

CONTEXTE ONEE :
- Les projets ONEE concernent des lignes électriques 60kV/225kV : réfection, refonte, déviation, dépose, remplacement de supports/câbles
- Le nom du projet = description technique exacte de l'objet (ex: "Refonte des lignes 60KV N°136-1 et N°136-2")
- Si l'objet mentionne une localisation (TIT MELLIL, PORTIQUE 44, SETTAT...) → l'inclure dans le nom
- Les bordereaux d'envoi mentionnent toujours l'objet exact du projet dans le champ "Objet"

RÈGLES :
1. Regroupe par ligne électrique, localisation ou type de travaux similaires
2. Le nom du projet = reprendre EXACTEMENT la description de l'objet du document (pas inventer)
3. Un devis = estimation pour déviation/refonte/dépose de lignes → étape "devis_realisation"
4. Ignore les courriers RH/administratifs sans travaux réseau

Réponds UNIQUEMENT avec un JSON valide :
[
  {{
    "suggestion_id": "s1",
    "nom": "Nom EXACT repris de l'objet du document",
    "type_projet": "ligne_electrique|poste|maintenance|administratif|autre",
    "localisation": "zone géographique si mentionnée",
    "marche_numero": null,
    "description": "description courte",
    "priorite": "normale",
    "confiance": 70,
    "est_renouvellement": false,
    "projet_existant_id": null,
    "documents": [
      {{"table": "bordereau", "doc_id": 12, "etape": "etude_technique",
        "raison": "bordereau de plans techniques",
        "doc_ref": "ref...", "doc_titre": "titre...", "doc_date": "date..."}}
    ]
  }}
]

Étapes: demande_initiale, reunion, etude_technique, carnet_piquetage, approvisionnement, bon_execution, travaux_en_cours, devis_realisation, bon_livraison, reception_travaux, cloture, renouvellement, autre

Réponds UNIQUEMENT avec le JSON."""

            try:
                raw  = _call_claude(prompt, max_tokens=3000)
                ai_suggestions = _parse_json_response(raw)
                for s in ai_suggestions:
                    s["source"] = "claude"
                suggestions.extend(ai_suggestions)
            except Exception as e:
                suggestions.append({
                    "suggestion_id": "err_0",
                    "erreur": str(e),
                    "docs_skipped": len(docs_without_marche),
                })

    return suggestions


def _guess_etape_from_objet(objet: str, table: str) -> str:
    """Détermine l'étape depuis le contenu de l'objet sans appel IA."""
    o = objet.upper()
    if table == "devis":
        return "devis_realisation"
    if any(k in o for k in ["PIQUETAGE", "CARNET", "BON POUR PIQUETAGE"]):
        return "carnet_piquetage"
    if any(k in o for k in ["BON POUR EXECUTION", "BON D'EXÉCUTION", "EXECUTION"]):
        return "bon_execution"
    if any(k in o for k in ["LIVRAISON", "BON DE LIVRAISON"]):
        return "bon_livraison"
    if any(k in o for k in ["RÉCEPTION", "RECEPTION", "PV DE RÉCEPTION"]):
        return "reception_travaux"
    if any(k in o for k in ["ATTACHEMENT", "SITUATION", "DÉCOMPTE", "DECOMPTE"]):
        return "travaux_en_cours"
    if any(k in o for k in ["ÉTUDE", "ETUDE", "FAISABILITÉ", "FAISABILITE"]):
        return "etude_technique"
    if any(k in o for k in ["APPROVISIONNEMENT", "COMMANDE", "MATÉRIEL", "MATERIEL"]):
        return "approvisionnement"
    if any(k in o for k in ["RÉUNION", "REUNION", "COMPTE RENDU", "CR "]):
        return "reunion"
    if table == "bordereau":
        return "etude_technique"  # Les bordereaux sont souvent des plans/études
    if table == "courrier":
        return "demande_initiale"
    return "autre"


def _extract_localisation(project_name: str) -> str:
    """Extrait la localisation depuis le nom du projet."""
    # Cherche des noms de villes ou zones connues ONEE Maroc
    zones = [
        "CASABLANCA", "SETTAT", "BERRECHID", "RABAT", "MOHAMMEDIA",
        "TIT MELLIL", "BOUSKOURA", "MEDIOUNA", "KENITRA", "SALE",
        "PORTIQUE", "AIN SEBAA", "SIDI BERNOUSSI", "ZENATA",
    ]
    name_up = project_name.upper()
    found = [z for z in zones if z in name_up]
    return " - ".join(found[:2]) if found else ""


def _build_timeline_for_project(project_name: str, docs: List[dict]) -> List[dict]:
    """
    Phase 2 : Claude lit le contenu txt des documents d'un projet
    et construit la timeline précise avec dates, montants, intervenants.
    """
    docs_text = "\n\n".join([
        f"--- [{d['table'].upper()} #{d['id']}] Objet: {d['objet']} | Date: {d['date']} ---\n{d['txt_extrait'] or 'Texte non disponible'}"
        for d in docs
    ])

    prompt = f"""Tu analyses les documents du projet ONEE : "{project_name}"

DOCUMENTS DU PROJET :
{docs_text}

Pour chaque document, détermine :
1. L'étape précise dans le cycle de vie du projet
2. La date exacte (extraite du texte si possible)
3. Le montant mentionné (si applicable)
4. Les intervenants principaux (signataires, services)

Réponds UNIQUEMENT en JSON :
[
  {{
    "table": "courrier",
    "doc_id": 12,
    "etape": "demande_initiale",
    "etape_ordre": 1,
    "date_extraite": "12/03/2026",
    "montant_extrait": null,
    "intervenants": "DTC/TQ → Division Planification",
    "resume": "Demande d'étude pour nouvelle ligne",
    "confiance_etape": 90
  }}
]

Étapes: demande_initiale(1), reunion(2), etude_technique(3), carnet_piquetage(4), approvisionnement(5), bon_execution(6), travaux_en_cours(7), devis_realisation(8), bon_livraison(9), reception_travaux(10), cloture(11), renouvellement(12), autre(99)

Réponds UNIQUEMENT avec le JSON."""

    raw = _call_claude(prompt, max_tokens=2000)
    return _parse_json_response(raw)


def _check_document_for_projects(doc: dict, existing_projects: List[dict]) -> dict:
    """
    Phase 3 : Vérifie si un nouveau document appartient à un projet existant.
    """
    if not existing_projects:
        return {"projet_id": None, "confiance": 0}

    projects_text = "\n".join([
        f"- ID:{p['id']} | {p['nom']} | {p.get('localisation','')} | Marché:{p.get('marche_numero','?')}"
        for p in existing_projects[:30]
    ])

    prompt = f"""Document ONEE à analyser :
- Table: {doc['table']}
- Référence: {doc['reference']}
- Objet: {doc['objet']}
- Marché détecté: {doc['marche'] or 'aucun'}
- Texte: {doc['txt_extrait'][:300] if doc['txt_extrait'] else 'aucun'}

Projets existants :
{projects_text}

Ce document appartient-il à un projet existant ?
- Si oui : donne l'ID du projet et l'étape.
- Si non : indique projet_id null.

Réponds UNIQUEMENT en JSON :
{{"projet_id": 5, "etape": "bon_execution", "confiance": 87, "raison": "même numéro de marché TC95614"}}
ou
{{"projet_id": null, "confiance": 0, "raison": "aucun projet correspondant"}}"""

    try:
        raw = _call_claude(prompt, max_tokens=200)
        return _parse_json_response(raw)
    except Exception:
        return {"projet_id": None, "confiance": 0, "raison": "erreur analyse"}


# =============================================================================
# ENDPOINTS CONFIG
# =============================================================================

@router.get("/config")
def get_config(current_user=Depends(require_super_admin)):
    """Récupère la configuration actuelle des chemins."""
    return load_config()


@router.put("/config")
def update_config(req: ConfigUpdate, current_user=Depends(require_super_admin)):
    """Sauvegarde la configuration des chemins txt."""
    cfg = load_config()
    cfg["txt_paths"]            = req.txt_paths
    cfg["batch_size"]           = req.batch_size or 30
    cfg["txt_truncate_chars"]   = req.txt_truncate_chars or 500
    cfg["confidence_threshold"] = req.confidence_threshold or 65
    cfg["auto_link_threshold"]  = req.auto_link_threshold or 80
    save_config(cfg)
    # Vérifie que les chemins existent
    warnings = []
    for table, path in req.txt_paths.items():
        if path and not Path(path).exists():
            warnings.append(f"Chemin inexistant : {path} ({table})")
    return {
        "message": "✅ Configuration sauvegardée",
        "warnings": warnings,
        "config": cfg,
    }


@router.get("/config/test-paths")
def test_paths(current_user=Depends(require_super_admin)):
    """Teste l'accessibilité des chemins configurés."""
    cfg = load_config()
    results = {}
    for table, path in cfg["txt_paths"].items():
        p = Path(path)
        if not path:
            results[table] = {"status": "non configuré", "count": 0}
        elif not p.exists():
            results[table] = {"status": "chemin introuvable", "path": path, "count": 0}
        else:
            txt_files = list(p.glob("*.txt"))
            results[table] = {
                "status": "ok",
                "path": path,
                "count": len(txt_files),
                "exemple": txt_files[0].name if txt_files else None,
            }
    return results


# =============================================================================
# ENDPOINT PHASE 1 — ANALYSE & DÉCOUVERTE
# =============================================================================

@router.post("/analyse")
def analyse_documents(
    date_from: Optional[str] = Query(None, description="Filtrer depuis date DD/MM/YYYY"),
    tables:    Optional[str] = Query(None, description="Tables à analyser, ex: courrier,devis"),
    current_user=Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """
    Phase 1 : Analyse tous les documents non liés à un projet
    et retourne des suggestions de projets à créer.
    """
    cfg     = load_config()
    batch   = cfg["batch_size"]
    max_ch  = cfg["txt_truncate_chars"]
    txt_p   = cfg["txt_paths"]
    tables_to_scan = tables.split(",") if tables else ["courrier", "bordereau", "courrier_depart", "devis"]

    # IDs déjà liés à un projet
    linked_ids: Dict[str, set] = {t: set() for t in tables_to_scan}
    for doc in db.query(models.ProjetDocument).filter(models.ProjetDocument.doc_id.isnot(None)).all():
        if doc.doc_type in linked_ids:
            linked_ids[doc.doc_type].add(doc.doc_id)

    # Projets existants (pour ne pas recréer)
    existing_projects = []
    for p in db.query(models.Projet).all():
        existing_projects.append({
            "id":            p.id,
            "nom":           p.nom,
            "localisation":  p.localisation or "",
            "marche_numero": "",  # sera extrait si présent dans description
        })

    # Collecte les documents non liés
    all_docs: List[dict] = []

    table_models = {
        "courrier":        models.Courrier,
        "bordereau":       models.Bordereau,
        "courrier_depart": models.CourrierDepart,
        "devis":           models.Devis,
    }

    for table in tables_to_scan:
        model = table_models.get(table)
        if not model:
            continue
        q = db.query(model)
        rows = q.order_by(model.id.desc()).limit(500).all()
        for row in rows:
            if row.id in linked_ids.get(table, set()):
                continue
            summary = _build_doc_summary(row, table, txt_p, max_ch)
            all_docs.append(summary)

    if not all_docs:
        return {
            "suggestions": [],
            "stats": {"total_docs_analysed": 0, "message": "Tous les documents sont déjà liés à des projets."},
        }

    # Traitement en batches
    all_suggestions = []
    suggestion_counter = 0

    for i in range(0, len(all_docs), batch):
        batch_docs = all_docs[i: i + batch]
        try:
            suggestions = _discover_projects_batch(batch_docs, existing_projects)
            # Renommer les suggestion_id pour être uniques cross-batch
            for s in suggestions:
                suggestion_counter += 1
                s["suggestion_id"] = f"sug_{suggestion_counter}"
                s["batch_index"]   = i // batch
            all_suggestions.extend(suggestions)
            time.sleep(0.3)  # Évite rate limiting
        except Exception as e:
            # On continue malgré une erreur sur un batch
            all_suggestions.append({
                "suggestion_id": f"err_{i}",
                "erreur": str(e),
                "docs_skipped": len(batch_docs),
            })

    # Fusionne les suggestions qui ont le même numéro de marché
    merged = _merge_suggestions_by_marche(all_suggestions)

    # Filtre par seuil de confiance
    threshold = cfg["confidence_threshold"]
    high_conf  = [s for s in merged if s.get("confiance", 0) >= threshold and "erreur" not in s]
    low_conf   = [s for s in merged if s.get("confiance", 0) < threshold and "erreur" not in s]
    errors     = [s for s in merged if "erreur" in s]

    return {
        "suggestions":       high_conf,
        "suggestions_faible_confiance": low_conf,
        "errors":            errors,
        "stats": {
            "total_docs_analysed":    len(all_docs),
            "total_suggestions":      len(high_conf),
            "faible_confiance":       len(low_conf),
            "docs_deja_lies":         sum(len(v) for v in linked_ids.values()),
            "batches":                (len(all_docs) + batch - 1) // batch,
            "seuil_confiance":        threshold,
        }
    }


def _merge_suggestions_by_marche(suggestions: List[dict]) -> List[dict]:
    """
    Fusionne les suggestions avec le même numéro de marché.
    Priorité : pre_cluster > claude (nom extrait directement = plus fiable).
    """
    marche_map: Dict[str, dict] = {}
    no_marche = []

    for s in suggestions:
        if "erreur" in s:
            no_marche.append(s)
            continue
        m = s.get("marche_numero") or ""
        m = re.sub(r"\s+", "", m.upper()) if m else ""
        if m and len(m) >= 4:
            if m not in marche_map:
                marche_map[m] = s
            else:
                existing = marche_map[m]
                existing_doc_keys = {(d["table"], d["doc_id"]) for d in existing.get("documents", [])}
                for doc in s.get("documents", []):
                    key = (doc["table"], doc["doc_id"])
                    if key not in existing_doc_keys:
                        existing["documents"].append(doc)
                        existing_doc_keys.add(key)
                existing["confiance"] = max(
                    existing.get("confiance", 0),
                    s.get("confiance", 0)
                )
                # Si pre_cluster disponible → garde son nom (plus fiable que Claude)
                if s.get("source") == "pre_cluster" and existing.get("source") != "pre_cluster":
                    existing["nom"] = s["nom"]
                    existing["source"] = "pre_cluster"
        else:
            no_marche.append(s)

    return list(marche_map.values()) + no_marche


# =============================================================================
# ENDPOINT PHASE 1 — APPROBATION
# =============================================================================

@router.post("/suggestions/approuver")
def approve_suggestion(
    req: SuggestionApproval,
    current_user=Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    """
    L'admin approuve une suggestion : crée le projet et lie tous les documents.
    """
    # Crée le projet
    projet = models.Projet(
        nom          = req.nom,
        type_projet  = req.type_projet or "autre",
        description  = req.description or "",
        localisation = req.localisation or "",
        priorite     = req.priorite or "normale",
        statut       = "en_cours",
        created_by   = current_user.id,
    )
    db.add(projet)
    db.flush()  # Récupère l'ID sans commit

    # Lie les documents
    linked = 0
    errors = []
    for doc_link in req.doc_links:
        try:
            etape = doc_link.get("etape", "autre")
            pd = models.ProjetDocument(
                projet_id   = projet.id,
                doc_type    = doc_link["table"],
                doc_id      = doc_link["doc_id"],
                doc_ref     = doc_link.get("doc_ref", ""),
                doc_titre   = doc_link.get("doc_titre", ""),
                doc_date    = doc_link.get("doc_date", ""),
                etape       = etape,
                etape_ordre = ETAPES_ORDRE.get(etape, 99),
                notes       = doc_link.get("raison", ""),
                pdf_path    = "",
                added_by_ai = True,
            )
            db.add(pd)
            linked += 1
        except Exception as e:
            errors.append(str(e))

    db.commit()

    return {
        "message":    f"✅ Projet « {req.nom} » créé avec {linked} document(s) lié(s)",
        "projet_id":  projet.id,
        "linked":     linked,
        "errors":     errors,
    }


@router.post("/suggestions/rejeter")
def reject_suggestion(req: SuggestionReject, current_user=Depends(auth.require_admin)):
    """Enregistre le rejet d'une suggestion (log seulement)."""
    return {"message": f"Suggestion {req.suggestion_id} rejetée", "raison": req.raison}


# =============================================================================
# ENDPOINT PHASE 2 — CONSTRUCTION TIMELINE
# =============================================================================

@router.post("/projets/{projet_id}/construire-timeline")
def build_timeline(
    projet_id: int,
    current_user=Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    """
    Phase 2 : Pour un projet existant, Claude lit le contenu txt de tous
    ses documents liés et reconstruit la timeline avec précision.
    """
    projet = db.query(models.Projet).filter(models.Projet.id == projet_id).first()
    if not projet:
        raise HTTPException(404, "Projet introuvable")

    proj_docs = db.query(models.ProjetDocument).filter(
        models.ProjetDocument.projet_id == projet_id
    ).all()

    if not proj_docs:
        return {"message": "Aucun document lié à ce projet", "updated": 0}

    cfg     = load_config()
    txt_p   = cfg["txt_paths"]
    max_ch  = cfg["txt_truncate_chars"]

    # Construit les résumés avec contenu txt
    table_models = {
        "courrier":        models.Courrier,
        "bordereau":       models.Bordereau,
        "courrier_depart": models.CourrierDepart,
        "devis":           models.Devis,
    }

    docs_for_ai = []
    for pd in proj_docs:
        model = table_models.get(pd.doc_type)
        if model and pd.doc_id:
            row = db.query(model).filter(model.id == pd.doc_id).first()
            if row:
                summary = _build_doc_summary(row, pd.doc_type, txt_p, max_ch)
                summary["projet_doc_id"] = pd.id
                docs_for_ai.append(summary)

    if not docs_for_ai:
        return {"message": "Documents introuvables en base", "updated": 0}

    # Appel Claude Phase 2
    timeline = _build_timeline_for_project(projet.nom, docs_for_ai)

    # Met à jour les étapes dans la DB
    updated = 0
    for item in timeline:
        doc_id  = item.get("doc_id")
        table   = item.get("table")
        etape   = item.get("etape", "autre")
        pd_row  = next((pd for pd in proj_docs if pd.doc_id == doc_id and pd.doc_type == table), None)
        if pd_row:
            pd_row.etape       = etape
            pd_row.etape_ordre = item.get("etape_ordre") or ETAPES_ORDRE.get(etape, 99)
            if item.get("resume"):
                pd_row.notes = item["resume"]
            updated += 1

    db.commit()

    return {
        "message": f"✅ Timeline reconstruite — {updated} étape(s) mise(s) à jour",
        "updated": updated,
        "timeline": timeline,
    }


# =============================================================================
# ENDPOINT PHASE 3 — SYSTÈME VIVANT (nouveau document)
# =============================================================================

@router.post("/check-nouveau-document")
def check_new_document(
    req: LiveDocCheck,
    current_user=Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    """
    Phase 3 : Vérifie si un nouveau document scanné correspond à un projet existant.
    Retourne une suggestion de rattachement si confiance > seuil.
    """
    cfg = load_config()

    # Lit le contenu txt
    txt_content = ""
    if req.txt_path:
        txt_content = _read_txt(req.txt_path, cfg["txt_truncate_chars"])

    doc = {
        "table":       req.table,
        "id":          req.doc_id,
        "reference":   req.doc_ref or "",
        "objet":       req.doc_titre or "",
        "date":        req.doc_date or "",
        "marche":      _extract_marche_number(req.doc_titre or "") or _extract_marche_number(txt_content),
        "txt_extrait": txt_content,
    }

    # Projets existants
    existing = [
        {"id": p.id, "nom": p.nom, "localisation": p.localisation or ""}
        for p in db.query(models.Projet).filter(models.Projet.statut != "annule").all()
    ]

    result = _check_document_for_projects(doc, existing)

    auto_threshold = cfg["auto_link_threshold"]
    should_auto_link = (
        result.get("projet_id") and
        result.get("confiance", 0) >= auto_threshold
    )

    if should_auto_link:
        projet_id = result["projet_id"]
        etape     = result.get("etape", "autre")
        # Vérifie pas déjà lié
        already = db.query(models.ProjetDocument).filter(
            models.ProjetDocument.projet_id == projet_id,
            models.ProjetDocument.doc_type  == req.table,
            models.ProjetDocument.doc_id    == req.doc_id,
        ).first()
        if not already:
            db.add(models.ProjetDocument(
                projet_id   = projet_id,
                doc_type    = req.table,
                doc_id      = req.doc_id,
                doc_ref     = req.doc_ref or "",
                doc_titre   = req.doc_titre or "",
                doc_date    = req.doc_date or "",
                etape       = etape,
                etape_ordre = ETAPES_ORDRE.get(etape, 99),
                notes       = result.get("raison", "Auto-lié par IA"),
                added_by_ai = True,
            ))
            db.commit()
            result["action"] = "auto_linked"
        else:
            result["action"] = "already_linked"
    else:
        result["action"] = "suggestion_only"

    return result


# =============================================================================
# ENDPOINT — STATS ANALYSE
# =============================================================================

@router.get("/stats")
def get_ai_stats(
    current_user=Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    """Stats sur l'état du système IA projets."""
    total_projets  = db.query(models.Projet).count()
    total_liens    = db.query(models.ProjetDocument).count()
    liens_ia       = db.query(models.ProjetDocument).filter(models.ProjetDocument.added_by_ai == True).count()
    liens_manuels  = total_liens - liens_ia

    # Documents non liés
    linked_courrier = {d.doc_id for d in db.query(models.ProjetDocument).filter(models.ProjetDocument.doc_type == "courrier").all()}
    linked_devis    = {d.doc_id for d in db.query(models.ProjetDocument).filter(models.ProjetDocument.doc_type == "devis").all()}
    linked_bord     = {d.doc_id for d in db.query(models.ProjetDocument).filter(models.ProjetDocument.doc_type == "bordereau").all()}

    non_lies = {
        "courrier":   db.query(models.Courrier).count() - len(linked_courrier),
        "devis":      db.query(models.Devis).count() - len(linked_devis),
        "bordereau":  db.query(models.Bordereau).count() - len(linked_bord),
    }

    return {
        "total_projets":  total_projets,
        "total_liens":    total_liens,
        "liens_ia":       liens_ia,
        "liens_manuels":  liens_manuels,
        "taux_ia":        round((liens_ia / total_liens * 100) if total_liens else 0, 1),
        "docs_non_lies":  non_lies,
        "total_non_lies": sum(non_lies.values()),
        "claude_model":   CLAUDE_MODEL,
        "api_configured": bool(ANTHROPIC_API_KEY),
    }