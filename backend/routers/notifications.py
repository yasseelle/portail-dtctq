"""
routers/notifications.py
========================
API complète pour le système de notifications.

Dans main.py, ajouter :
  from routers import notifications
  app.include_router(notifications.router)
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

import models, auth
from database import get_db

router = APIRouter(prefix="/notifications", tags=["Notifications"])

# ── Config types ──────────────────────────────────────────────────────────────
VALID_TYPES = {"urgent", "todo", "info"}

TYPE_CONFIG = {
    "urgent": {"label": "🔴 Urgent",         "color": "#ef4444", "bg": "rgba(239,68,68,0.12)"},
    "todo":   {"label": "🟡 Travail à faire", "color": "#f59e0b", "bg": "rgba(245,158,11,0.12)"},
    "info":   {"label": "🟢 Information",     "color": "#10b981", "bg": "rgba(16,185,129,0.12)"},
}


# =============================================================================
# SCHEMAS
# =============================================================================

class CreateNotifRequest(BaseModel):
    titre:      str
    message:    str
    type_notif: str = "info"       # urgent | todo | info
    cible:      str = "all"        # "all" ou "1,3,7" (IDs séparés par virgule)


# =============================================================================
# HELPERS
# =============================================================================

def user_can_see(notif: models.Notification, user_id: int) -> bool:
    """Vérifie si un user doit voir cette notification."""
    if notif.cible == "all":
        return True
    try:
        ids = [int(x.strip()) for x in notif.cible.split(",") if x.strip()]
        return user_id in ids
    except:
        return False


def has_read(db: Session, notif_id: int, user_id: int) -> bool:
    return db.query(models.NotificationRead).filter(
        and_(
            models.NotificationRead.notification_id == notif_id,
            models.NotificationRead.user_id         == user_id,
        )
    ).first() is not None


def format_notif(notif: models.Notification, db: Session, user_id: int) -> dict:
    creator = db.query(models.User).filter(models.User.id == notif.created_by).first()
    return {
        "id":         notif.id,
        "titre":      notif.titre,
        "message":    notif.message,
        "type_notif": notif.type_notif,
        "color":      TYPE_CONFIG.get(notif.type_notif, TYPE_CONFIG["info"])["color"],
        "bg":         TYPE_CONFIG.get(notif.type_notif, TYPE_CONFIG["info"])["bg"],
        "label":      TYPE_CONFIG.get(notif.type_notif, TYPE_CONFIG["info"])["label"],
        "cible":      notif.cible,
        "created_by": creator.nom_prenom if creator else "—",
        "created_at": notif.created_at.strftime("%d/%m/%Y %H:%M") if notif.created_at else "—",
        "is_read":    has_read(db, notif.id, user_id),
    }


# =============================================================================
# ENDPOINTS — AGENT (lecture)
# =============================================================================

@router.get("/mes-notifications")
def get_my_notifications(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Retourne toutes les notifications destinées à cet agent."""
    all_notifs = db.query(models.Notification)\
                   .order_by(models.Notification.created_at.desc())\
                   .all()

    result = []
    for n in all_notifs:
        if user_can_see(n, current_user.id):
            result.append(format_notif(n, db, current_user.id))

    return result


@router.get("/non-lues")
def get_unread_count(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Retourne le nombre de notifications non lues (pour le badge)."""
    all_notifs = db.query(models.Notification).all()
    count = 0
    for n in all_notifs:
        if user_can_see(n, current_user.id) and not has_read(db, n.id, current_user.id):
            count += 1
    return {"count": count}


@router.post("/{notif_id}/lire")
def mark_as_read(
    notif_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """L'agent confirme qu'il a lu la notification."""
    notif = db.query(models.Notification).filter(models.Notification.id == notif_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification introuvable")

    if not user_can_see(notif, current_user.id):
        raise HTTPException(status_code=403, detail="Non autorisé")

    # Already read ?
    if not has_read(db, notif_id, current_user.id):
        db.add(models.NotificationRead(
            notification_id=notif_id,
            user_id=current_user.id,
        ))
        db.commit()

    return {"message": "✅ Notification marquée comme lue"}


@router.post("/tout-lire")
def mark_all_read(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Marque toutes les notifications comme lues."""
    all_notifs = db.query(models.Notification).all()
    for n in all_notifs:
        if user_can_see(n, current_user.id) and not has_read(db, n.id, current_user.id):
            db.add(models.NotificationRead(
                notification_id=n.id,
                user_id=current_user.id,
            ))
    db.commit()
    return {"message": "✅ Toutes les notifications marquées comme lues"}


# =============================================================================
# ENDPOINTS — ADMIN (création / gestion)
# =============================================================================

@router.post("/creer")
def create_notification(
    req: CreateNotifRequest,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    """Crée une nouvelle notification (admin seulement)."""
    if req.type_notif not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"Type invalide. Valeurs: {VALID_TYPES}")

    if not req.titre.strip():
        raise HTTPException(status_code=400, detail="Le titre est obligatoire")

    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Le message est obligatoire")

    # Validate cible
    if req.cible != "all":
        try:
            ids = [int(x.strip()) for x in req.cible.split(",") if x.strip()]
            if not ids:
                raise ValueError
        except:
            raise HTTPException(status_code=400, detail="Format cible invalide (ex: 'all' ou '1,3,7')")

    notif = models.Notification(
        titre      = req.titre.strip(),
        message    = req.message.strip(),
        type_notif = req.type_notif,
        cible      = req.cible,
        created_by = current_user.id,
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)

    # Count targets
    if req.cible == "all":
        target_count = db.query(models.User).count()
        target_label = f"tous les {target_count} utilisateurs"
    else:
        ids = [int(x.strip()) for x in req.cible.split(",") if x.strip()]
        target_label = f"{len(ids)} agent(s) ciblé(s)"

    return {"message": f"✅ Notification envoyée à {target_label}", "id": notif.id}


@router.get("/toutes")
def get_all_notifications(
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    """Liste toutes les notifications (admin)."""
    notifs = db.query(models.Notification)\
               .order_by(models.Notification.created_at.desc())\
               .all()

    result = []
    for n in notifs:
        read_count = db.query(models.NotificationRead)\
                       .filter(models.NotificationRead.notification_id == n.id)\
                       .count()
        creator = db.query(models.User).filter(models.User.id == n.created_by).first()

        if n.cible == "all":
            total_targets = db.query(models.User).count()
        else:
            try:
                total_targets = len([int(x.strip()) for x in n.cible.split(",") if x.strip()])
            except:
                total_targets = 0

        result.append({
            "id":           n.id,
            "titre":        n.titre,
            "message":      n.message,
            "type_notif":   n.type_notif,
            "color":        TYPE_CONFIG.get(n.type_notif, TYPE_CONFIG["info"])["color"],
            "label":        TYPE_CONFIG.get(n.type_notif, TYPE_CONFIG["info"])["label"],
            "cible":        n.cible,
            "created_by":   creator.nom_prenom if creator else "—",
            "created_at":   n.created_at.strftime("%d/%m/%Y %H:%M") if n.created_at else "—",
            "read_count":   read_count,
            "total_targets":total_targets,
        })
    return result


@router.delete("/{notif_id}")
def delete_notification(
    notif_id: int,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    """Supprime une notification et ses confirmations de lecture."""
    notif = db.query(models.Notification).filter(models.Notification.id == notif_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification introuvable")

    db.query(models.NotificationRead)\
      .filter(models.NotificationRead.notification_id == notif_id)\
      .delete()
    db.delete(notif)
    db.commit()
    return {"message": "✅ Notification supprimée"}
