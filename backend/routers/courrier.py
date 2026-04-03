"""
routers/courrier.py — API Courrier, Bordereau, Départ/Réception
+ PDF serving + Excel sync
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import Optional
from pathlib import Path
import os
import re

import models, auth
from database import get_db

router = APIRouter(prefix="/courrier", tags=["Courrier"])

STORAGE_DIRS = {
    "arrivee":   r"C:\courrier\storage",
    "bordereau": r"C:\bordereau_envoi\storage",
    "depart":    r"C:\courrier_depart_reception\depart_storage",
    "reception": r"C:\courrier_depart_reception\reception_storage",
}


# =============================================================================
# ── HELPERS ───────────────────────────────────────────────────────────────────
# =============================================================================

def get_pdf_filename(pdf_path: str) -> str:
    """Extract filename from full path."""
    if not pdf_path:
        return ""
    return os.path.basename(pdf_path)


def _parse_date(val):
    if not val: return ""
    s = str(val).strip()
    from datetime import datetime
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try: return datetime.strptime(s, fmt).strftime("%d/%m/%Y")
        except: pass
    return s


def _clean(val):
    if val is None: return ""
    return str(val).strip()


# =============================================================================
# ── PDF SERVING ───────────────────────────────────────────────────────────────
# =============================================================================

@router.get("/pdf/{source}/{filename}")
def serve_pdf(
    source: str,
    filename: str,
    current_user=Depends(auth.get_current_user),
):
    if source not in STORAGE_DIRS:
        raise HTTPException(status_code=400, detail="Source invalide")

    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Nom de fichier invalide")

    pdf_path = Path(STORAGE_DIRS[source]) / filename

    if not pdf_path.exists():
        # Try case-insensitive search
        storage = Path(STORAGE_DIRS[source])
        if storage.exists():
            for f in storage.iterdir():
                if f.name.lower() == filename.lower():
                    pdf_path = f
                    break

    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail=f"PDF introuvable : {filename}")

    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=filename,
    )


# =============================================================================
# ── EXCEL SYNC ────────────────────────────────────────────────────────────────
# =============================================================================

@router.post("/sync/arrivee")
def sync_arrivee(
    current_user=Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    import openpyxl
    excel_path = r"C:\courrier\etat_courrier_2026.xlsx"
    if not Path(excel_path).exists():
        raise HTTPException(status_code=404, detail="Fichier Excel introuvable")

    wb = openpyxl.load_workbook(excel_path, read_only=True)
    created = updated = skipped = 0

    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        rows = list(ws.iter_rows(values_only=True))
        for row in rows[5:]:
            if not any(v for v in row): continue
            expediteur = _clean(row[1]) if len(row) > 1 else ""
            date_val   = _parse_date(row[2]) if len(row) > 2 else ""
            objet      = _clean(row[3]) if len(row) > 3 else ""
            if not expediteur and not objet: continue

            existing = db.query(models.Courrier).filter(
                models.Courrier.expediteur    == expediteur,
                models.Courrier.date_courrier == date_val,
                models.Courrier.mois          == sheet_name,
            ).first()

            if existing:
                if existing.objet != objet:
                    existing.objet = objet; updated += 1
                else:
                    skipped += 1
            else:
                db.add(models.Courrier(
                    expediteur=expediteur, date_courrier=date_val,
                    objet=objet, mois=sheet_name,
                ))
                created += 1

    db.commit(); wb.close()
    return {"created": created, "updated": updated, "skipped": skipped}


@router.post("/sync/bordereau")
def sync_bordereau(
    current_user=Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    import openpyxl
    excel_path = r"C:\bordereau_envoi\etat_bordereaux_envoi_2026.xlsx"
    if not Path(excel_path).exists():
        raise HTTPException(status_code=404, detail="Fichier Excel introuvable")

    wb = openpyxl.load_workbook(excel_path, read_only=True)
    created = updated = skipped = 0

    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        rows = list(ws.iter_rows(values_only=True))
        for row in rows[5:]:
            if not any(v for v in row): continue
            reference    = _clean(row[1]) if len(row) > 1 else ""
            destinataire = _clean(row[3]) if len(row) > 3 else ""
            objet        = _clean(row[4]) if len(row) > 4 else ""
            if not reference and not objet: continue

            existing = db.query(models.Bordereau).filter(
                models.Bordereau.reference == reference,
            ).first()

            if existing:
                if existing.objet != objet or existing.destinataire != destinataire:
                    existing.objet = objet; existing.destinataire = destinataire; updated += 1
                else:
                    skipped += 1
            else:
                db.add(models.Bordereau(reference=reference, destinataire=destinataire, objet=objet))
                created += 1

    db.commit(); wb.close()
    return {"created": created, "updated": updated, "skipped": skipped}


@router.post("/sync/depart")
def sync_depart(
    current_user=Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    import openpyxl
    excel_path = r"C:\courrier_depart_reception\etat_courrier_2026.xlsx"
    if not Path(excel_path).exists():
        raise HTTPException(status_code=404, detail="Fichier Excel introuvable")

    wb = openpyxl.load_workbook(excel_path, read_only=True)
    created = updated = skipped = 0

    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        rows = list(ws.iter_rows(values_only=True))
        for row in rows[5:]:
            if not any(v for v in row): continue
            reference      = _clean(row[1]) if len(row) > 1 else ""
            date_depart    = _parse_date(row[2]) if len(row) > 2 else ""
            destinataire   = _clean(row[3]) if len(row) > 3 else ""
            objet          = _clean(row[4]) if len(row) > 4 else ""
            date_reception = _parse_date(row[7]) if len(row) > 7 else ""
            if not reference and not objet: continue

            existing = db.query(models.CourrierDepart).filter(
                models.CourrierDepart.reference == reference,
            ).first()

            if existing:
                changed = False
                if existing.objet != objet: existing.objet = objet; changed = True
                if existing.date_reception != date_reception: existing.date_reception = date_reception; changed = True
                if changed: updated += 1
                else: skipped += 1
            else:
                db.add(models.CourrierDepart(
                    reference=reference, date_depart=date_depart,
                    destinataire=destinataire, objet=objet,
                    date_reception=date_reception, mois=sheet_name,
                ))
                created += 1

    db.commit(); wb.close()
    return {"created": created, "updated": updated, "skipped": skipped}


@router.post("/sync/all")
def sync_all(
    current_user=Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    results = {}
    for name, fn in [("arrivee", sync_arrivee), ("bordereau", sync_bordereau), ("depart", sync_depart)]:
        try:
            results[name] = fn(current_user=current_user, db=db)
        except Exception as e:
            results[name] = {"error": str(e)}
    return results


# =============================================================================
# ── COURRIER ARRIVÉE ──────────────────────────────────────────────────────────
# =============================================================================

@router.get("/arrivee")
def get_courrier(
    search: Optional[str] = Query(None),
    mois:   Optional[str] = Query(None),
    page:   int = Query(1, ge=1),
    limit:  int = Query(20, ge=1, le=100),
    current_user=Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(models.Courrier)
    if search:
        term = f"%{search}%"
        q = q.filter(or_(
            models.Courrier.expediteur.ilike(term),
            models.Courrier.objet.ilike(term),
            models.Courrier.date_courrier.ilike(term),
        ))
    if mois:
        q = q.filter(models.Courrier.mois.ilike(f"%{mois}%"))

    total = q.count()
    items = q.order_by(models.Courrier.id.desc()).offset((page-1)*limit).limit(limit).all()

    return {
        "total": total, "page": page,
        "pages": (total + limit - 1) // limit,
        "items": [{
            "id":            r.id,
            "expediteur":    r.expediteur,
            "date_courrier": r.date_courrier,
            "objet":         r.objet,
            "mois":          r.mois,
            "pdf_path":      r.pdf_path,
            "pdf_filename":  get_pdf_filename(r.pdf_path),
        } for r in items]
    }


@router.get("/arrivee/stats")
def get_courrier_stats(
    current_user=Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    total   = db.query(models.Courrier).count()
    monthly = db.query(models.Courrier.mois, func.count(models.Courrier.id))\
                .group_by(models.Courrier.mois).all()
    top_exp = db.query(models.Courrier.expediteur, func.count(models.Courrier.id))\
                .group_by(models.Courrier.expediteur)\
                .order_by(func.count(models.Courrier.id).desc()).limit(10).all()
    return {
        "total":   total,
        "monthly": [{"mois": m, "count": c} for m, c in monthly],
        "top_expediteurs": [{"expediteur": e, "count": c} for e, c in top_exp],
    }


# =============================================================================
# ── BORDEREAU ─────────────────────────────────────────────────────────────────
# =============================================================================

@router.get("/bordereau")
def get_bordereau(
    search: Optional[str] = Query(None),
    page:   int = Query(1, ge=1),
    limit:  int = Query(20, ge=1, le=100),
    current_user=Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(models.Bordereau)
    if search:
        term = f"%{search}%"
        q = q.filter(or_(
            models.Bordereau.reference.ilike(term),
            models.Bordereau.destinataire.ilike(term),
            models.Bordereau.objet.ilike(term),
        ))
    total = q.count()
    items = q.order_by(models.Bordereau.id.desc()).offset((page-1)*limit).limit(limit).all()
    return {
        "total": total, "page": page,
        "pages": (total + limit - 1) // limit,
        "items": [{
            "id":           r.id,
            "reference":    r.reference,
            "destinataire": r.destinataire,
            "objet":        r.objet,
            "pdf_path":     r.pdf_path,
            "pdf_filename": get_pdf_filename(r.pdf_path),
            "created_at":   r.created_at.strftime("%d/%m/%Y") if r.created_at else "—",
        } for r in items]
    }


@router.get("/bordereau/stats")
def get_bordereau_stats(
    current_user=Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    total    = db.query(models.Bordereau).count()
    top_dest = db.query(models.Bordereau.destinataire, func.count(models.Bordereau.id))\
                 .group_by(models.Bordereau.destinataire)\
                 .order_by(func.count(models.Bordereau.id).desc()).limit(10).all()
    return {
        "total": total,
        "top_destinataires": [{"destinataire": d, "count": c} for d, c in top_dest],
    }


# =============================================================================
# ── DÉPART / RÉCEPTION ────────────────────────────────────────────────────────
# =============================================================================

@router.get("/depart")
def get_depart(
    search: Optional[str] = Query(None),
    mois:   Optional[str] = Query(None),
    page:   int = Query(1, ge=1),
    limit:  int = Query(20, ge=1, le=100),
    current_user=Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(models.CourrierDepart)
    if search:
        term = f"%{search}%"
        q = q.filter(or_(
            models.CourrierDepart.reference.ilike(term),
            models.CourrierDepart.destinataire.ilike(term),
            models.CourrierDepart.objet.ilike(term),
        ))
    if mois:
        q = q.filter(models.CourrierDepart.mois.ilike(f"%{mois}%"))

    total = q.count()
    items = q.order_by(models.CourrierDepart.id.desc()).offset((page-1)*limit).limit(limit).all()
    return {
        "total": total, "page": page,
        "pages": (total + limit - 1) // limit,
        "items": [{
            "id":               r.id,
            "reference":        r.reference,
            "date_depart":      r.date_depart,
            "destinataire":     r.destinataire,
            "objet":            r.objet,
            "date_reception":   r.date_reception,
            "has_reception":    bool(r.date_reception),
            "mois":             r.mois,
            "pdf_filename":     get_pdf_filename(r.pdf_depart_path),
        } for r in items]
    }


@router.get("/depart/stats")
def get_depart_stats(
    current_user=Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    total      = db.query(models.CourrierDepart).count()
    with_recep = db.query(models.CourrierDepart)\
                   .filter(models.CourrierDepart.date_reception != "").count()
    top_dest   = db.query(models.CourrierDepart.destinataire, func.count(models.CourrierDepart.id))\
                   .group_by(models.CourrierDepart.destinataire)\
                   .order_by(func.count(models.CourrierDepart.id).desc()).limit(8).all()
    return {
        "total": total, "with_recep": with_recep, "pending": total - with_recep,
        "top_destinataires": [{"destinataire": d, "count": c} for d, c in top_dest],
    }


# =============================================================================
# ── STATS GLOBALES ────────────────────────────────────────────────────────────
# =============================================================================

@router.get("/stats/global")
def get_global_stats(
    current_user=Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    return {
        "courrier_total":  db.query(models.Courrier).count(),
        "bordereau_total": db.query(models.Bordereau).count(),
        "depart_total":    db.query(models.CourrierDepart).count(),
        "docs_rh_total":   db.query(models.DocumentRH).count(),
    }