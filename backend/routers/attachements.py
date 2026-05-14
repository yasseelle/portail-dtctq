"""
routers/attachements.py — API Attachements ONEE
Placé dans : C:\projets\portail-dtctq\backend\routers\attachements.py
"""

import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models import Attachement, AttachementArticle, Projet
from auth import get_current_user
from ai_attachement import extract_attachement_from_pdf, normalize_date
from excel_attachements import sync_to_excel   # voir étape 4

router = APIRouter(prefix="/attachements", tags=["attachements"])

# ── Dossier de stockage ───────────────────────────────────────────────────────
STORAGE_DIR = Path(r"C:\attachements\storage")
STORAGE_DIR.mkdir(parents=True, exist_ok=True)


# ── Pydantic schemas ──────────────────────────────────────────────────────────
class ArticleIn(BaseModel):
    article:       Optional[str]   = None
    quantite:      Optional[float] = None
    unite:         Optional[str]   = None
    prix_unitaire: Optional[float] = None
    montant_total: Optional[float] = None

class AttachementCreate(BaseModel):
    entreprise:    Optional[str]   = None
    date_document: Optional[str]   = None
    marche_numero: Optional[str]   = None
    marche_nom:    Optional[str]   = None
    date_debut:    Optional[str]   = None
    date_fin:      Optional[str]   = None
    att_numero:    Optional[int]   = None
    projet_id:     Optional[int]   = None
    articles:      List[ArticleIn] = []

class AttachementOut(BaseModel):
    id:            int
    entreprise:    Optional[str]
    date_document: Optional[str]
    marche_numero: Optional[str]
    marche_nom:    Optional[str]
    date_debut:    Optional[str]
    date_fin:      Optional[str]
    att_numero:    Optional[int]
    pdf_path:      Optional[str]
    projet_id:     Optional[int]
    source:        Optional[str]
    has_pdf:       bool
    articles:      List[dict]

    class Config:
        from_attributes = True


# ── Helper ────────────────────────────────────────────────────────────────────
def _att_to_dict(att: Attachement) -> dict:
    pdf_exists = bool(att.pdf_path and Path(att.pdf_path).exists())
    return {
        "id":            att.id,
        "entreprise":    att.entreprise,
        "date_document": att.date_document,
        "marche_numero": att.marche_numero,
        "marche_nom":    att.marche_nom,
        "date_debut":    att.date_debut,
        "date_fin":      att.date_fin,
        "att_numero":    att.att_numero,
        "pdf_path":      att.pdf_path,
        "projet_id":     att.projet_id,
        "source":        att.source,
        "has_pdf":       pdf_exists,
        "articles": [
            {
                "id":            a.id,
                "article":       a.article,
                "quantite":      a.quantite,
                "unite":         a.unite,
                "prix_unitaire": a.prix_unitaire,
                "montant_total": a.montant_total,
            }
            for a in att.articles
        ],
    }


def _auto_link_projet(att: Attachement, db: Session):
    """Lie automatiquement l'attachement à un projet via le numéro de marché."""
    if not att.marche_numero:
        return
    # Cherche dans projets un projet dont le titre ou référence contient le numéro de marché
    projets = db.query(Projet).all()
    for p in projets:
        if att.marche_numero.upper() in (p.titre or "").upper():
            att.projet_id = p.id
            return
        # Cherche aussi dans les notes / description si disponible
        if hasattr(p, "description") and att.marche_numero.upper() in (p.description or "").upper():
            att.projet_id = p.id
            return


# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

# ── Liste ─────────────────────────────────────────────────────────────────────
@router.get("")
def list_attachements(
    search:  Optional[str] = None,
    marche:  Optional[str] = None,
    db:      Session       = Depends(get_db),
    _:       dict          = Depends(get_current_user),
):
    q = db.query(Attachement)
    if search:
        like = f"%{search}%"
        q = q.filter(
            Attachement.entreprise.ilike(like)
            | Attachement.marche_numero.ilike(like)
            | Attachement.marche_nom.ilike(like)
        )
    if marche:
        q = q.filter(Attachement.marche_numero.ilike(f"%{marche}%"))

    atts = q.order_by(Attachement.created_at.desc()).all()
    return [_att_to_dict(a) for a in atts]


# ── Détail ─────────────────────────────────────────────────────────────────────
@router.get("/{att_id}")
def get_attachement(
    att_id: int,
    db:     Session = Depends(get_db),
    _:      dict    = Depends(get_current_user),
):
    att = db.query(Attachement).filter(Attachement.id == att_id).first()
    if not att:
        raise HTTPException(404, "Attachement introuvable")
    return _att_to_dict(att)


# ── Scan IA : upload PDF → extraction Claude ──────────────────────────────────
@router.post("/scan")
async def scan_pdf(
    file:    UploadFile = File(...),
    db:      Session    = Depends(get_db),
    _:       dict       = Depends(get_current_user),
):
    """Upload un PDF → Claude extrait toutes les données → retourne le résultat pour review."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Fichier PDF requis")

    # Sauvegarde temporaire
    tmp_path = STORAGE_DIR / f"_tmp_{file.filename}"
    with open(tmp_path, "wb") as f:
        f.write(await file.read())

    try:
        data = extract_attachement_from_pdf(str(tmp_path))
    finally:
        # On garde le fichier tmp pour le lier après confirmation
        pass

    if data.get("source") == "error":
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(500, f"Erreur extraction: {data.get('error')}")

    # Normalise les dates
    data["date_document"] = normalize_date(data.get("date_document"))
    data["date_debut"]    = normalize_date(data.get("date_debut"))
    data["date_fin"]      = normalize_date(data.get("date_fin"))

    # Retourne les données pour review côté frontend (pas encore sauvé en DB)
    return {
        "tmp_filename": tmp_path.name,
        "extracted":    data,
    }


# ── Confirmer après scan (sauve en DB + Excel) ────────────────────────────────
@router.post("/confirm")
async def confirm_attachement(
    payload:      AttachementCreate,
    tmp_filename: Optional[str] = None,
    db:           Session       = Depends(get_db),
    _:            dict          = Depends(get_current_user),
):
    """Confirme les données extraites → sauvegarde DB + Excel + déplace PDF."""
    att = Attachement(
        entreprise    = payload.entreprise,
        date_document = payload.date_document,
        marche_numero = payload.marche_numero,
        marche_nom    = payload.marche_nom,
        date_debut    = payload.date_debut,
        date_fin      = payload.date_fin,
        att_numero    = payload.att_numero,
        projet_id     = payload.projet_id,
        source        = "claude",
    )

    # Déplace le PDF tmp vers storage définitif
    if tmp_filename:
        tmp_path  = STORAGE_DIR / tmp_filename
        safe_name = f"ATT_{payload.marche_numero or 'XX'}_{payload.att_numero or 0}_{datetime.now().strftime('%Y%m%d%H%M%S')}.pdf"
        final_path = STORAGE_DIR / safe_name
        if tmp_path.exists():
            shutil.move(str(tmp_path), str(final_path))
            att.pdf_path = str(final_path)

    # Auto-link projet
    _auto_link_projet(att, db)

    db.add(att)
    db.flush()  # pour avoir att.id

    # Articles
    for art in payload.articles:
        mt = art.montant_total
        if mt is None and art.quantite and art.prix_unitaire:
            mt = art.quantite * art.prix_unitaire
        db.add(AttachementArticle(
            attachement_id = att.id,
            article        = art.article,
            quantite       = art.quantite,
            unite          = art.unite,
            prix_unitaire  = art.prix_unitaire,
            montant_total  = mt,
        ))

    db.commit()
    db.refresh(att)

    # Sync Excel
    try:
        sync_to_excel(db)
    except Exception as e:
        print(f"[EXCEL] Erreur sync: {e}")

    return _att_to_dict(att)


# ── Créer manuellement ────────────────────────────────────────────────────────
@router.post("")
def create_attachement(
    payload: AttachementCreate,
    db:      Session = Depends(get_db),
    _:       dict    = Depends(get_current_user),
):
    att = Attachement(
        entreprise    = payload.entreprise,
        date_document = payload.date_document,
        marche_numero = payload.marche_numero,
        marche_nom    = payload.marche_nom,
        date_debut    = payload.date_debut,
        date_fin      = payload.date_fin,
        att_numero    = payload.att_numero,
        projet_id     = payload.projet_id,
        source        = "manuel",
    )
    _auto_link_projet(att, db)
    db.add(att)
    db.flush()

    for art in payload.articles:
        mt = art.montant_total
        if mt is None and art.quantite and art.prix_unitaire:
            mt = art.quantite * art.prix_unitaire
        db.add(AttachementArticle(
            attachement_id = att.id,
            article        = art.article,
            quantite       = art.quantite,
            unite          = art.unite,
            prix_unitaire  = art.prix_unitaire,
            montant_total  = mt,
        ))

    db.commit()
    db.refresh(att)
    try:
        sync_to_excel(db)
    except Exception as e:
        print(f"[EXCEL] Erreur sync: {e}")
    return _att_to_dict(att)


# ── Modifier ──────────────────────────────────────────────────────────────────
@router.put("/{att_id}")
def update_attachement(
    att_id:  int,
    payload: AttachementCreate,
    db:      Session = Depends(get_db),
    _:       dict    = Depends(get_current_user),
):
    att = db.query(Attachement).filter(Attachement.id == att_id).first()
    if not att:
        raise HTTPException(404, "Attachement introuvable")

    att.entreprise    = payload.entreprise
    att.date_document = payload.date_document
    att.marche_numero = payload.marche_numero
    att.marche_nom    = payload.marche_nom
    att.date_debut    = payload.date_debut
    att.date_fin      = payload.date_fin
    att_numero_old    = att.att_numero
    att.att_numero    = payload.att_numero
    att.projet_id     = payload.projet_id

    # Recréer les articles
    for existing in att.articles:
        db.delete(existing)
    db.flush()

    for art in payload.articles:
        mt = art.montant_total
        if mt is None and art.quantite and art.prix_unitaire:
            mt = art.quantite * art.prix_unitaire
        db.add(AttachementArticle(
            attachement_id = att.id,
            article        = art.article,
            quantite       = art.quantite,
            unite          = art.unite,
            prix_unitaire  = art.prix_unitaire,
            montant_total  = mt,
        ))

    db.commit()
    db.refresh(att)
    try:
        sync_to_excel(db)
    except Exception as e:
        print(f"[EXCEL] Erreur sync: {e}")
    return _att_to_dict(att)


# ── Supprimer ─────────────────────────────────────────────────────────────────
@router.delete("/{att_id}")
def delete_attachement(
    att_id: int,
    db:     Session = Depends(get_db),
    user:   dict    = Depends(get_current_user),
):
    if user.get("role") != "admin":
        raise HTTPException(403, "Admins uniquement")
    att = db.query(Attachement).filter(Attachement.id == att_id).first()
    if not att:
        raise HTTPException(404, "Introuvable")
    if att.pdf_path:
        Path(att.pdf_path).unlink(missing_ok=True)
    db.delete(att)
    db.commit()
    try:
        sync_to_excel(db)
    except Exception as e:
        print(f"[EXCEL] Erreur sync: {e}")
    return {"ok": True}


# ── Télécharger PDF ───────────────────────────────────────────────────────────
@router.get("/{att_id}/pdf")
def download_pdf(
    att_id: int,
    db:     Session = Depends(get_db),
    _:      dict    = Depends(get_current_user),
):
    att = db.query(Attachement).filter(Attachement.id == att_id).first()
    if not att or not att.pdf_path:
        raise HTTPException(404, "PDF introuvable")
    p = Path(att.pdf_path)
    if not p.exists():
        raise HTTPException(404, "Fichier PDF manquant sur le disque")
    return FileResponse(str(p), media_type="application/pdf", filename=p.name)


# ── Upload PDF sur attachement existant ───────────────────────────────────────
@router.post("/{att_id}/upload-pdf")
async def upload_pdf(
    att_id: int,
    file:   UploadFile = File(...),
    db:     Session    = Depends(get_db),
    _:      dict       = Depends(get_current_user),
):
    att = db.query(Attachement).filter(Attachement.id == att_id).first()
    if not att:
        raise HTTPException(404, "Attachement introuvable")

    safe_name  = f"ATT_{att.marche_numero or 'XX'}_{att.att_numero or 0}_{datetime.now().strftime('%Y%m%d%H%M%S')}.pdf"
    final_path = STORAGE_DIR / safe_name
    with open(final_path, "wb") as f:
        f.write(await file.read())

    # Supprime l'ancien si existant
    if att.pdf_path and Path(att.pdf_path).exists():
        Path(att.pdf_path).unlink(missing_ok=True)

    att.pdf_path = str(final_path)
    db.commit()
    return {"ok": True, "pdf_path": str(final_path)}


# ── Stats résumé ─────────────────────────────────────────────────────────────
@router.get("/stats/summary")
def get_stats(
    db: Session = Depends(get_db),
    _:  dict    = Depends(get_current_user),
):
    total      = db.query(func.count(Attachement.id)).scalar()
    entreprises = db.query(Attachement.entreprise, func.count(Attachement.id))\
                    .group_by(Attachement.entreprise).all()
    marches     = db.query(Attachement.marche_numero, func.count(Attachement.id))\
                    .group_by(Attachement.marche_numero).all()
    return {
        "total":       total,
        "entreprises": [{"nom": e, "count": c} for e, c in entreprises if e],
        "marches":     [{"numero": m, "count": c} for m, c in marches if m],
    }
