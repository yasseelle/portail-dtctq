"""
routers/projets.py
==================
Suivi intelligent de projets ONEE.
- CRUD projets (admin)
- Liaison documents ↔ projets (manuelle + IA)
- Timeline automatique
- Analyse IA de l'état d'avancement

Dans main.py :
  from routers import projets
  app.include_router(projets.router)
"""

import os
import re
import json
from pathlib import Path
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from pydantic import BaseModel

import models, auth
from database import get_db

router = APIRouter(prefix="/projets", tags=["Projets"])

ANTHROPIC_API_KEY = ""
CLAUDE_MODEL      = "claude-haiku-4-5-20251001"

# Charger clé depuis .env
def _load_env():
    env_locations = [
        Path(r"C:\projets\portail-dtctq\.env"),
        Path(__file__).resolve().parents[1] / ".env",
    ]
    for loc in env_locations:
        if loc.exists():
            with open(loc, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        os.environ.setdefault(k.strip(), v.strip())
            break

_load_env()
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL      = os.environ.get("CLAUDE_MODEL", "claude-haiku-4-5-20251001")

# ── Types & étapes ────────────────────────────────────────────────────────────
TYPE_PROJET = {
    "ligne_electrique": "⚡ Ligne Électrique",
    "poste":            "🏭 Poste Électrique",
    "maintenance":      "🔧 Maintenance",
    "administratif":    "📋 Administratif",
    "autre":            "📁 Autre",
}

STATUT_CONFIG = {
    "en_cours":  {"label":"En cours",  "color":"#2563eb", "icon":"🔵"},
    "suspendu":  {"label":"Suspendu",  "color":"#f59e0b", "icon":"🟡"},
    "termine":   {"label":"Terminé",   "color":"#10b981", "icon":"🟢"},
    "annule":    {"label":"Annulé",    "color":"#ef4444", "icon":"🔴"},
}

PRIORITE_CONFIG = {
    "haute":   {"label":"Haute",   "color":"#ef4444"},
    "normale": {"label":"Normale", "color":"#2563eb"},
    "basse":   {"label":"Basse",   "color":"#6b7280"},
}

# Ordre des étapes dans la timeline
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
    "autre":             "📄 Document",
}


# =============================================================================
# SCHEMAS
# =============================================================================

class ProjetCreate(BaseModel):
    nom:           str
    type_projet:   Optional[str] = "autre"
    description:   Optional[str] = ""
    localisation:  Optional[str] = ""
    priorite:      Optional[str] = "normale"
    date_debut:    Optional[str] = ""
    date_fin_prev: Optional[str] = ""

class ProjetUpdate(BaseModel):
    nom:           Optional[str] = None
    type_projet:   Optional[str] = None
    description:   Optional[str] = None
    localisation:  Optional[str] = None
    statut:        Optional[str] = None
    priorite:      Optional[str] = None
    date_debut:    Optional[str] = None
    date_fin_prev: Optional[str] = None

class DocLinkRequest(BaseModel):
    doc_type:  str             # courrier | devis | bordereau | autre
    doc_id:    Optional[int]   = None
    doc_ref:   Optional[str]   = ""
    doc_titre: Optional[str]   = ""
    doc_date:  Optional[str]   = ""
    etape:     Optional[str]   = "autre"
    notes:     Optional[str]   = ""
    pdf_path:  Optional[str]   = ""

class NoteCreate(BaseModel):
    contenu: str


# =============================================================================
# HELPERS
# =============================================================================

def format_projet(p: models.Projet, docs: list, notes: list) -> dict:
    st = STATUT_CONFIG.get(p.statut, STATUT_CONFIG["en_cours"])
    pr = PRIORITE_CONFIG.get(p.priorite, PRIORITE_CONFIG["normale"])
    pct = _calc_progression(docs)
    return {
        "id":           p.id,
        "nom":          p.nom,
        "type_projet":  p.type_projet,
        "type_label":   TYPE_PROJET.get(p.type_projet, "📁 Autre"),
        "description":  p.description,
        "localisation": p.localisation,
        "statut":       p.statut,
        "statut_label": st["label"],
        "statut_color": st["color"],
        "statut_icon":  st["icon"],
        "priorite":     p.priorite,
        "priorite_label": pr["label"],
        "priorite_color": pr["color"],
        "date_debut":   p.date_debut,
        "date_fin_prev":p.date_fin_prev,
        "progression":  pct,
        "nb_documents": len(docs),
        "documents":    sorted(docs, key=lambda d: d["etape_ordre"]),
        "notes":        notes,
        "created_at":   p.created_at.strftime("%d/%m/%Y") if p.created_at else "—",
        "updated_at":   p.updated_at.strftime("%d/%m/%Y %H:%M") if p.updated_at else "—",
    }


def format_doc(d: models.ProjetDocument) -> dict:
    return {
        "id":          d.id,
        "projet_id":   d.projet_id,
        "doc_type":    d.doc_type,
        "doc_id":      d.doc_id,
        "doc_ref":     d.doc_ref,
        "doc_titre":   d.doc_titre,
        "doc_date":    d.doc_date,
        "etape":       d.etape,
        "etape_label": ETAPES_LABELS.get(d.etape, "📄 Document"),
        "etape_ordre": d.etape_ordre,
        "notes":       d.notes,
        "pdf_path":    d.pdf_path,
        "added_by_ai": d.added_by_ai,
        "created_at":  d.created_at.strftime("%d/%m/%Y") if d.created_at else "—",
    }


def _calc_progression(docs: list) -> int:
    """Calcule le % d'avancement basé sur les étapes présentes."""
    if not docs: return 0
    etapes_presentes = {d["etape"] for d in docs if d["etape"] != "autre"}
    etapes_cles = ["demande_initiale","carnet_piquetage","bon_execution","devis_realisation","reception_travaux","cloture"]
    done = sum(1 for e in etapes_cles if e in etapes_presentes)
    return min(int((done / len(etapes_cles)) * 100), 100)


# =============================================================================
# ── IA : ANALYSE ET LIAISON AUTOMATIQUE ───────────────────────────────────────
# =============================================================================

def _detect_etape_with_ai(doc_ref: str, doc_titre: str, doc_type: str) -> str:
    """Détecte l'étape d'un document via Claude."""
    if not ANTHROPIC_API_KEY or ANTHROPIC_API_KEY.startswith("sk-ant-REMPLACE"):
        return _detect_etape_simple(doc_titre, doc_type)

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

        prompt = f"""Tu analyses un document ONEE (Office National de l'Electricité).

Document :
- Type : {doc_type}
- Référence : {doc_ref}
- Titre/Objet : {doc_titre}

Quelle est l'étape de ce document dans un projet de travaux ?
Réponds UNIQUEMENT avec un de ces codes (rien d'autre) :
demande_initiale | reunion | etude_technique | carnet_piquetage | approvisionnement | bon_execution | travaux_en_cours | devis_realisation | bon_livraison | reception_travaux | cloture | autre"""

        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=30,
            messages=[{"role": "user", "content": prompt}]
        )
        etape = response.content[0].text.strip().lower()
        return etape if etape in ETAPES_ORDRE else "autre"

    except Exception:
        return _detect_etape_simple(doc_titre, doc_type)


def _detect_etape_simple(titre: str, doc_type: str) -> str:
    """Détection basique par mots-clés (fallback sans IA)."""
    t = (titre or "").lower()
    if any(w in t for w in ["réunion","réunion","meeting","convocation"]): return "reunion"
    if any(w in t for w in ["piquetage","carnet","liste matériel","matériaux"]): return "carnet_piquetage"
    if any(w in t for w in ["bon exécution","bon d'exécution","exécution"]): return "bon_execution"
    if any(w in t for w in ["devis","montant","coût","estimation","prix"]): return "devis_realisation"
    if any(w in t for w in ["réception","procès-verbal","pv réception"]): return "reception_travaux"
    if any(w in t for w in ["clôture","clotûre","fin travaux","achèvement"]): return "cloture"
    if any(w in t for w in ["approvisionnement","commande","livraison matériel"]): return "approvisionnement"
    if any(w in t for w in ["bon livraison","livraison"]): return "bon_livraison"
    if any(w in t for w in ["étude","plan","rapport technique"]): return "etude_technique"
    if any(w in t for w in ["demande","sollicite","requête","initiale"]): return "demande_initiale"
    if doc_type == "devis": return "devis_realisation"
    if doc_type == "bordereau": return "bon_execution"
    return "autre"


def _find_matching_projects(doc_titre: str, doc_ref: str, db: Session) -> list:
    """Cherche les projets qui correspondent à ce document via IA."""
    if not ANTHROPIC_API_KEY or ANTHROPIC_API_KEY.startswith("sk-ant-REMPLACE"):
        return []

    all_projets = db.query(models.Projet).all()
    if not all_projets: return []

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

        projets_list = "\n".join([
            f"- ID:{p.id} | {p.nom} | {p.localisation} | {p.type_projet}"
            for p in all_projets
        ])

        prompt = f"""Tu dois trouver si ce document appartient à un projet existant.

Document :
- Titre/Objet : {doc_titre}
- Référence   : {doc_ref}

Projets existants :
{projets_list}

Si le document correspond à un projet, réponds avec le JSON :
{{"projet_id": <id>, "confiance": <0-100>}}

Si aucun projet ne correspond, réponds :
{{"projet_id": null, "confiance": 0}}

Réponds UNIQUEMENT avec le JSON."""

        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=60,
            messages=[{"role": "user", "content": prompt}]
        )
        raw = re.sub(r"```json\s*|```\s*", "", response.content[0].text).strip()
        result = json.loads(raw)
        if result.get("projet_id") and result.get("confiance", 0) >= 60:
            return [result["projet_id"]]
        return []

    except Exception:
        return []


def _analyze_project_status(projet: models.Projet, docs: list) -> dict:
    """Analyse l'état d'avancement d'un projet avec Claude."""
    if not ANTHROPIC_API_KEY or ANTHROPIC_API_KEY.startswith("sk-ant-REMPLACE"):
        return {"analyse": "Clé API non configurée.", "prochaine_etape": "", "blocages": ""}

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

        docs_text = "\n".join([
            f"- [{d['etape_label']}] {d['doc_ref']} — {d['doc_titre']} ({d['doc_date']})"
            for d in sorted(docs, key=lambda x: x["etape_ordre"])
        ]) or "Aucun document lié"

        prompt = f"""Tu es un expert en gestion de projets ONEE (Office National de l'Electricité et Eau Potable, Maroc).

Projet : {projet.nom}
Type   : {projet.type_projet}
Lieu   : {projet.localisation}
Statut : {projet.statut}

Documents liés (dans l'ordre) :
{docs_text}

Analyse l'état d'avancement de ce projet et réponds en JSON :
{{
  "analyse": "Résumé de l'état actuel en 2-3 phrases",
  "prochaine_etape": "Quelle est la prochaine action attendue ?",
  "blocages": "Y a-t-il des blocages ou retards potentiels ?",
  "pourcentage": <nombre 0-100>,
  "recommendation": "Recommandation principale"
}}

Réponds en français. JSON uniquement."""

        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}]
        )
        raw = re.sub(r"```json\s*|```\s*", "", response.content[0].text).strip()
        return json.loads(raw)

    except Exception as e:
        return {"analyse": f"Analyse non disponible : {str(e)}", "prochaine_etape": "", "blocages": ""}


# =============================================================================
# ── ENDPOINTS ─────────────────────────────────────────────────────────────────
# =============================================================================

@router.get("/")
def list_projets(
    search:      Optional[str] = Query(None),
    statut:      Optional[str] = Query(None),
    type_projet: Optional[str] = Query(None),
    page:        int = Query(1, ge=1),
    limit:       int = Query(20, ge=1, le=100),
    current_user=Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(models.Projet)
    if search:
        term = f"%{search}%"
        q = q.filter(or_(
            models.Projet.nom.ilike(term),
            models.Projet.localisation.ilike(term),
            models.Projet.description.ilike(term),
        ))
    if statut:      q = q.filter(models.Projet.statut      == statut)
    if type_projet: q = q.filter(models.Projet.type_projet == type_projet)

    total = q.count()
    projets = q.order_by(models.Projet.updated_at.desc()).offset((page-1)*limit).limit(limit).all()

    result = []
    for p in projets:
        docs  = [format_doc(d) for d in db.query(models.ProjetDocument).filter(models.ProjetDocument.projet_id == p.id).all()]
        notes = [{"id":n.id,"contenu":n.contenu,"created_at":n.created_at.strftime("%d/%m/%Y %H:%M") if n.created_at else "—"}
                 for n in db.query(models.ProjetNote).filter(models.ProjetNote.projet_id == p.id).all()]
        result.append(format_projet(p, docs, notes))

    return {"total": total, "page": page, "pages": (total+limit-1)//limit, "items": result}


@router.get("/stats")
def get_stats(
    current_user=Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    all_p = db.query(models.Projet).all()
    by_statut = {}
    by_type   = {}
    for p in all_p:
        by_statut[p.statut]      = by_statut.get(p.statut, 0) + 1
        by_type[p.type_projet]   = by_type.get(p.type_projet, 0) + 1

    total_docs = db.query(models.ProjetDocument).count()
    ai_docs    = db.query(models.ProjetDocument).filter(models.ProjetDocument.added_by_ai == True).count()

    return {
        "total":       len(all_p),
        "by_statut":   [{"statut":k, "count":v, "label":STATUT_CONFIG.get(k,{}).get("label",k), "color":STATUT_CONFIG.get(k,{}).get("color","#6b7280")} for k,v in by_statut.items()],
        "by_type":     [{"type":k, "count":v, "label":TYPE_PROJET.get(k,k)} for k,v in by_type.items()],
        "total_docs":  total_docs,
        "ai_docs":     ai_docs,
    }


@router.get("/{projet_id}")
def get_projet(
    projet_id: int,
    current_user=Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    p = db.query(models.Projet).filter(models.Projet.id == projet_id).first()
    if not p: raise HTTPException(404, "Projet introuvable")
    docs  = [format_doc(d) for d in db.query(models.ProjetDocument).filter(models.ProjetDocument.projet_id == projet_id).all()]
    notes = [{"id":n.id,"contenu":n.contenu,"created_at":n.created_at.strftime("%d/%m/%Y %H:%M") if n.created_at else "—"}
             for n in db.query(models.ProjetNote).filter(models.ProjetNote.projet_id == projet_id).all()]
    return format_projet(p, docs, notes)


@router.get("/{projet_id}/analyse-ia")
def analyse_ia(
    projet_id: int,
    current_user=Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Analyse l'état d'avancement du projet avec Claude AI."""
    p = db.query(models.Projet).filter(models.Projet.id == projet_id).first()
    if not p: raise HTTPException(404, "Projet introuvable")
    docs = [format_doc(d) for d in db.query(models.ProjetDocument).filter(models.ProjetDocument.projet_id == projet_id).all()]
    return _analyze_project_status(p, docs)


@router.post("/{projet_id}/lier-document-auto")
def auto_link_document(
    projet_id: int,
    req: DocLinkRequest,
    current_user=Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    """Lie un document à un projet avec détection automatique de l'étape."""
    p = db.query(models.Projet).filter(models.Projet.id == projet_id).first()
    if not p: raise HTTPException(404, "Projet introuvable")

    # Détecter l'étape automatiquement
    etape = _detect_etape_with_ai(req.doc_ref or "", req.doc_titre or "", req.doc_type)

    doc = models.ProjetDocument(
        projet_id   = projet_id,
        doc_type    = req.doc_type,
        doc_id      = req.doc_id,
        doc_ref     = req.doc_ref or "",
        doc_titre   = req.doc_titre or "",
        doc_date    = req.doc_date or "",
        etape       = etape,
        etape_ordre = ETAPES_ORDRE.get(etape, 99),
        notes       = req.notes or "",
        pdf_path    = req.pdf_path or "",
        added_by_ai = False,
    )
    db.add(doc); db.commit(); db.refresh(doc)
    return {
        "message":    f"✅ Document lié au projet",
        "etape":      etape,
        "etape_label":ETAPES_LABELS.get(etape, "📄 Document"),
        "doc_id":     doc.id,
    }


@router.post("/scan-and-link")
def scan_and_link(
    current_user=Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    """
    Scan tous les documents récents (courriers, devis, bordereaux)
    et tente de les lier automatiquement aux projets existants via IA.
    """
    linked = 0; skipped = 0; errors = 0

    all_projets = db.query(models.Projet).all()
    if not all_projets:
        return {"message": "⚠️ Aucun projet créé — créez d'abord des projets", "linked": 0, "skipped": 0}

    # Récupérer liens existants pour éviter les doublons
    existing_links = {
        (d.doc_type, d.doc_id)
        for d in db.query(models.ProjetDocument).filter(
            models.ProjetDocument.doc_id.isnot(None)
        ).all()
    }

    def try_link(doc_type, doc_id, doc_ref, doc_titre, doc_date, pdf_path=""):
        nonlocal linked, skipped, errors
        if (doc_type, doc_id) in existing_links:
            skipped += 1; return
        try:
            projet_ids = _find_matching_projects(doc_titre or "", doc_ref or "", db)
            for pid in projet_ids:
                etape = _detect_etape_with_ai(doc_ref or "", doc_titre or "", doc_type)
                db.add(models.ProjetDocument(
                    projet_id   = pid,
                    doc_type    = doc_type,
                    doc_id      = doc_id,
                    doc_ref     = doc_ref     or "",
                    doc_titre   = doc_titre   or "",
                    doc_date    = doc_date    or "",
                    pdf_path    = pdf_path    or "",
                    etape       = etape,
                    etape_ordre = ETAPES_ORDRE.get(etape, 99),
                    added_by_ai = True,
                ))
                linked += 1
        except Exception:
            errors += 1

    def get_field(obj, *names):
        """Récupère le premier champ non-vide parmi les noms donnés."""
        for name in names:
            v = getattr(obj, name, None)
            if v and str(v).strip() not in ("", "None", "Non spécifié"):
                return str(v).strip()
        return ""

    # ── Courrier (table: courrier) ──
    try:
        # Modèle correspondant à __tablename__ = 'courrier'
        CourrierModel = next(
            (c for c in models.Base.__subclasses__() if c.__tablename__ == "courrier"), None
        )
        if CourrierModel:
            for c in db.query(CourrierModel).order_by(CourrierModel.id.desc()).limit(100).all():
                try_link(
                    "courrier", c.id,
                    get_field(c, "expediteur", "ref", "reference"),
                    get_field(c, "objet", "titre", "description"),
                    get_field(c, "date_courrier", "date", "mois"),
                    get_field(c, "pdf_filename", "pdf_path"),
                )
    except Exception: pass

    # ── Courrier Départ (table: courrier_depart) ──
    try:
        DepartModel = next(
            (c for c in models.Base.__subclasses__() if c.__tablename__ == "courrier_depart"), None
        )
        if DepartModel:
            for c in db.query(DepartModel).order_by(DepartModel.id.desc()).limit(100).all():
                try_link(
                    "depart", c.id,
                    get_field(c, "reference", "ref", "expediteur"),
                    get_field(c, "objet", "titre", "description"),
                    get_field(c, "date_depart", "date_courrier", "date"),
                    get_field(c, "pdf_path", "pdf_filename"),
                )
    except Exception: pass

    # ── Bordereau (table: bordereau) ──
    try:
        BordereauModel = next(
            (c for c in models.Base.__subclasses__() if c.__tablename__ == "bordereau"), None
        )
        if BordereauModel:
            for b in db.query(BordereauModel).order_by(BordereauModel.id.desc()).limit(100).all():
                try_link(
                    "bordereau", b.id,
                    get_field(b, "reference", "ref", "expediteur"),
                    get_field(b, "objet", "titre", "description"),
                    get_field(b, "date", "date_envoi", "created_at"),
                    get_field(b, "pdf_path", "pdf_filename"),
                )
    except Exception: pass

    # ── Devis ──
    try:
        if hasattr(models, "Devis"):
            for d in db.query(models.Devis).order_by(models.Devis.id.desc()).limit(100).all():
                try_link(
                    "devis", d.id,
                    d.reference or "",
                    d.objet     or "",
                    d.date_devis or "",
                    d.pdf_path   or "",
                )
    except Exception: pass

    db.commit()
    msg = f"✅ Scan terminé — {linked} lien(s) créé(s)"
    if skipped: msg += f", {skipped} déjà liés"
    if errors:  msg += f", {errors} erreur(s)"
    return {"message": msg, "linked": linked, "skipped": skipped, "errors": errors}


# ── CRUD PROJETS ──────────────────────────────────────────────────────────────

@router.post("/")
def create_projet(req: ProjetCreate, current_user=Depends(auth.require_admin), db: Session=Depends(get_db)):
    p = models.Projet(
        nom=req.nom, type_projet=req.type_projet or "autre",
        description=req.description or "", localisation=req.localisation or "",
        priorite=req.priorite or "normale",
        date_debut=req.date_debut or "", date_fin_prev=req.date_fin_prev or "",
        created_by=current_user.id,
    )
    db.add(p); db.commit(); db.refresh(p)
    return {"message":f"✅ Projet '{req.nom}' créé", "id":p.id}


@router.put("/{projet_id}")
def update_projet(projet_id:int, req:ProjetUpdate, current_user=Depends(auth.require_admin), db:Session=Depends(get_db)):
    p = db.query(models.Projet).filter(models.Projet.id==projet_id).first()
    if not p: raise HTTPException(404,"Projet introuvable")
    for field in ("nom","type_projet","description","localisation","statut","priorite","date_debut","date_fin_prev"):
        val = getattr(req, field)
        if val is not None: setattr(p, field, val)
    db.commit()
    return {"message":"✅ Projet mis à jour"}


@router.delete("/{projet_id}")
def delete_projet(projet_id:int, current_user=Depends(auth.require_admin), db:Session=Depends(get_db)):
    p = db.query(models.Projet).filter(models.Projet.id==projet_id).first()
    if not p: raise HTTPException(404,"Projet introuvable")
    db.query(models.ProjetDocument).filter(models.ProjetDocument.projet_id==projet_id).delete()
    db.query(models.ProjetNote).filter(models.ProjetNote.projet_id==projet_id).delete()
    db.delete(p); db.commit()
    return {"message":f"✅ Projet supprimé"}


@router.delete("/{projet_id}/documents/{doc_id}")
def delete_doc_link(projet_id:int, doc_id:int, current_user=Depends(auth.require_admin), db:Session=Depends(get_db)):
    d = db.query(models.ProjetDocument).filter(
        models.ProjetDocument.id==doc_id,
        models.ProjetDocument.projet_id==projet_id
    ).first()
    if not d: raise HTTPException(404,"Document introuvable")
    db.delete(d); db.commit()
    return {"message":"✅ Lien supprimé"}


@router.post("/{projet_id}/notes")
def add_note(projet_id:int, req:NoteCreate, current_user=Depends(auth.get_current_user), db:Session=Depends(get_db)):
    p = db.query(models.Projet).filter(models.Projet.id==projet_id).first()
    if not p: raise HTTPException(404,"Projet introuvable")
    note = models.ProjetNote(projet_id=projet_id, contenu=req.contenu, auteur_id=current_user.id)
    db.add(note); db.commit()
    return {"message":"✅ Note ajoutée"}


@router.get("/etapes/liste")
def get_etapes_liste(current_user=Depends(auth.get_current_user)):
    return [{"key":k, "label":v, "ordre":ETAPES_ORDRE.get(k,99)} for k,v in ETAPES_LABELS.items()]


@router.get("/types/liste")
def get_types_liste(current_user=Depends(auth.get_current_user)):
    return [{"key":k, "label":v} for k,v in TYPE_PROJET.items()]