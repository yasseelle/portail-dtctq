"""
routers/vehicules.py
====================
API complète pour la gestion du parc véhicules.

Dans main.py, ajouter :
  from routers import vehicules
  app.include_router(vehicules.router)
"""

import os
import re
import shutil
from pathlib import Path
from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

import models, auth
from database import get_db

router = APIRouter(prefix="/vehicules", tags=["Véhicules"])

# ── Storage ───────────────────────────────────────────────────────────────────
DOCS_DIR = Path(r"C:\projets\portail-dtctq\backend\vehicules_docs")
DOCS_DIR.mkdir(parents=True, exist_ok=True)

# ── Types de documents autorisés ──────────────────────────────────────────────
DOC_TYPES = {
    "carte_grise":       "Carte Grise",
    "visite_technique":  "Visite Technique",
    "assurance":         "Assurance",
    "vignette":          "Vignette",
    "autre":             "Autre Document",
}

ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}


# =============================================================================
# HELPERS
# =============================================================================

def parse_date(date_str: str) -> Optional[date]:
    if not date_str: return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try: return datetime.strptime(date_str.strip(), fmt).date()
        except: pass
    return None

def visite_status(prochaine_visite: str) -> str:
    """
    Retourne le statut de la visite technique :
    - 'expired'  → date passée
    - 'warning'  → dans les 30 prochains jours
    - 'ok'       → plus de 30 jours
    - 'unknown'  → pas de date
    """
    if not prochaine_visite: return "unknown"
    d = parse_date(prochaine_visite)
    if not d: return "unknown"
    today = date.today()
    diff  = (d - today).days
    if diff < 0:  return "expired"
    if diff <= 30: return "warning"
    return "ok"

def format_vehicule(v: models.Vehicule, docs: list) -> dict:
    return {
        "id":               v.id,
        "numero_vehicule":  v.numero_vehicule,
        "matricule":        v.matricule,
        "modele":           v.modele,
        "service":          v.service,
        "derniere_visite":  v.derniere_visite,
        "prochaine_visite": v.prochaine_visite,
        "visite_status":    visite_status(v.prochaine_visite),
        "documents":        docs,
        "created_at":       v.created_at.strftime("%d/%m/%Y") if v.created_at else "—",
    }

def format_doc(d: models.VehiculeDocument) -> dict:
    return {
        "id":          d.id,
        "vehicule_id": d.vehicule_id,
        "type_doc":    d.type_doc,
        "type_label":  DOC_TYPES.get(d.type_doc, d.type_doc),
        "nom_fichier": d.nom_fichier,
        "uploaded_at": d.uploaded_at.strftime("%d/%m/%Y") if d.uploaded_at else "—",
    }


# =============================================================================
# SCHEMAS
# =============================================================================

class VehiculeCreate(BaseModel):
    numero_vehicule:  str
    matricule:        str
    modele:           str
    service:          Optional[str] = ""
    derniere_visite:  Optional[str] = ""
    prochaine_visite: Optional[str] = ""

class VehiculeUpdate(BaseModel):
    numero_vehicule:  Optional[str] = None
    matricule:        Optional[str] = None
    modele:           Optional[str] = None
    service:          Optional[str] = None
    derniere_visite:  Optional[str] = None
    prochaine_visite: Optional[str] = None


# =============================================================================
# ── LISTE & DÉTAIL ─────────────────────────────────────────────────────────────
# =============================================================================

@router.get("/")
def list_vehicules(
    current_user=Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    vehicules = db.query(models.Vehicule).order_by(models.Vehicule.numero_vehicule).all()
    result = []
    for v in vehicules:
        docs = db.query(models.VehiculeDocument)\
                 .filter(models.VehiculeDocument.vehicule_id == v.id).all()
        result.append(format_vehicule(v, [format_doc(d) for d in docs]))
    return result


@router.get("/stats")
def vehicule_stats(
    current_user=Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    all_v = db.query(models.Vehicule).all()
    total   = len(all_v)
    expired = sum(1 for v in all_v if visite_status(v.prochaine_visite) == "expired")
    warning = sum(1 for v in all_v if visite_status(v.prochaine_visite) == "warning")
    ok      = sum(1 for v in all_v if visite_status(v.prochaine_visite) == "ok")
    return { "total":total, "expired":expired, "warning":warning, "ok":ok }


@router.get("/{vehicule_id}")
def get_vehicule(
    vehicule_id: int,
    current_user=Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    v = db.query(models.Vehicule).filter(models.Vehicule.id == vehicule_id).first()
    if not v: raise HTTPException(404, "Véhicule introuvable")
    docs = db.query(models.VehiculeDocument)\
             .filter(models.VehiculeDocument.vehicule_id == vehicule_id).all()
    return format_vehicule(v, [format_doc(d) for d in docs])


# =============================================================================
# ── ADMIN: CRUD VÉHICULE ───────────────────────────────────────────────────────
# =============================================================================

@router.post("/")
def create_vehicule(
    req: VehiculeCreate,
    current_user=Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    # Check duplicate matricule
    existing = db.query(models.Vehicule).filter(
        models.Vehicule.matricule == req.matricule
    ).first()
    if existing:
        raise HTTPException(400, f"Matricule '{req.matricule}' déjà enregistré")

    v = models.Vehicule(
        numero_vehicule  = req.numero_vehicule,
        matricule        = req.matricule,
        modele           = req.modele,
        service          = req.service or "",
        derniere_visite  = req.derniere_visite or "",
        prochaine_visite = req.prochaine_visite or "",
    )
    db.add(v); db.commit(); db.refresh(v)
    return {"message": f"✅ Véhicule {req.matricule} ajouté", "id": v.id}


@router.put("/{vehicule_id}")
def update_vehicule(
    vehicule_id: int,
    req: VehiculeUpdate,
    current_user=Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    v = db.query(models.Vehicule).filter(models.Vehicule.id == vehicule_id).first()
    if not v: raise HTTPException(404, "Véhicule introuvable")

    if req.numero_vehicule  is not None: v.numero_vehicule  = req.numero_vehicule
    if req.matricule        is not None: v.matricule        = req.matricule
    if req.modele           is not None: v.modele           = req.modele
    if req.service          is not None: v.service          = req.service
    if req.derniere_visite  is not None: v.derniere_visite  = req.derniere_visite
    if req.prochaine_visite is not None: v.prochaine_visite = req.prochaine_visite

    db.commit()
    return {"message": "✅ Véhicule mis à jour"}


@router.delete("/{vehicule_id}")
def delete_vehicule(
    vehicule_id: int,
    current_user=Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    v = db.query(models.Vehicule).filter(models.Vehicule.id == vehicule_id).first()
    if not v: raise HTTPException(404, "Véhicule introuvable")

    # Supprimer les fichiers physiques
    docs = db.query(models.VehiculeDocument)\
             .filter(models.VehiculeDocument.vehicule_id == vehicule_id).all()
    for doc in docs:
        try: Path(doc.chemin).unlink(missing_ok=True)
        except: pass
    db.query(models.VehiculeDocument)\
      .filter(models.VehiculeDocument.vehicule_id == vehicule_id).delete()

    db.delete(v); db.commit()
    return {"message": f"✅ Véhicule {v.matricule} supprimé"}


# =============================================================================
# ── ADMIN: DOCUMENTS (upload / download / delete) ─────────────────────────────
# =============================================================================

@router.post("/{vehicule_id}/documents")
async def upload_document(
    vehicule_id: int,
    type_doc:    str = Form(...),
    file:        UploadFile = File(...),
    current_user=Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    v = db.query(models.Vehicule).filter(models.Vehicule.id == vehicule_id).first()
    if not v: raise HTTPException(404, "Véhicule introuvable")

    if type_doc not in DOC_TYPES:
        raise HTTPException(400, f"Type invalide. Valeurs : {list(DOC_TYPES.keys())}")

    # Validate extension
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Extension non autorisée. Autorisées : {ALLOWED_EXTENSIONS}")

    # Build safe filename
    safe_mat  = re.sub(r"[^A-Za-z0-9]+", "_", v.matricule)
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    filename  = f"{safe_mat}_{type_doc}_{timestamp}{ext}"
    dest      = DOCS_DIR / filename

    # Save file
    content = await file.read()
    with open(dest, "wb") as f:
        f.write(content)

    # Save to DB — one doc per type per vehicle (replace if exists)
    existing_doc = db.query(models.VehiculeDocument).filter(
        models.VehiculeDocument.vehicule_id == vehicule_id,
        models.VehiculeDocument.type_doc    == type_doc,
    ).first()

    if existing_doc:
        # Delete old file
        try: Path(existing_doc.chemin).unlink(missing_ok=True)
        except: pass
        existing_doc.nom_fichier = file.filename
        existing_doc.chemin      = str(dest)
        existing_doc.uploaded_at = datetime.now()
    else:
        db.add(models.VehiculeDocument(
            vehicule_id=vehicule_id, type_doc=type_doc,
            nom_fichier=file.filename, chemin=str(dest),
        ))

    db.commit()
    return {"message": f"✅ {DOC_TYPES[type_doc]} uploadé"}


@router.get("/{vehicule_id}/documents/{doc_id}/download")
def download_document(
    vehicule_id: int,
    doc_id:      int,
    current_user=Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    doc = db.query(models.VehiculeDocument).filter(
        models.VehiculeDocument.id          == doc_id,
        models.VehiculeDocument.vehicule_id == vehicule_id,
    ).first()
    if not doc: raise HTTPException(404, "Document introuvable")

    path = Path(doc.chemin)
    if not path.exists(): raise HTTPException(404, "Fichier introuvable sur le serveur")

    return FileResponse(
        path=str(path),
        filename=doc.nom_fichier,
        media_type="application/octet-stream",
    )


@router.delete("/{vehicule_id}/documents/{doc_id}")
def delete_document(
    vehicule_id: int,
    doc_id:      int,
    current_user=Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    doc = db.query(models.VehiculeDocument).filter(
        models.VehiculeDocument.id          == doc_id,
        models.VehiculeDocument.vehicule_id == vehicule_id,
    ).first()
    if not doc: raise HTTPException(404, "Document introuvable")

    try: Path(doc.chemin).unlink(missing_ok=True)
    except: pass

    db.delete(doc); db.commit()
    return {"message": f"✅ {DOC_TYPES.get(doc.type_doc, doc.type_doc)} supprimé"}
