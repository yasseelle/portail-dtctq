"""
routers/admin.py — Panel Admin complet
Super Admin : JABBARI ILYASS (matricule 84488R) — intouchable
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta

import models, auth
from database import get_db

router = APIRouter(prefix="/admin", tags=["Admin"])

# ── Super Admin — INTOUCHABLE ─────────────────────────────────────────────────
SUPER_ADMIN_MATRICULE = "84488R"


def is_super_admin(user: models.User) -> bool:
    return user.matricule == SUPER_ADMIN_MATRICULE


def check_target_protection(target: models.User, current_user: models.User):
    """Empêche toute modification du super admin par un autre admin."""
    if target.matricule == SUPER_ADMIN_MATRICULE and not is_super_admin(current_user):
        raise HTTPException(
            status_code=403,
            detail="❌ JABBARI ILYASS est super admin — aucune modification autorisée"
        )


# =============================================================================
# SCHEMAS
# =============================================================================

class AddAgentRequest(BaseModel):
    nom_prenom:   str
    matricule:    str
    unite:        str
    destinataire: Optional[str] = ""
    role:         str = "agent"
    password:     Optional[str] = None  # default = matricule


class ResetPasswordRequest(BaseModel):
    user_id:      int
    new_password: str


class ChangeRoleRequest(BaseModel):
    user_id: int
    new_role: str


# =============================================================================
# STATS GLOBALES
# =============================================================================

@router.get("/stats")
def get_admin_stats(
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    """Stats complètes pour le panel admin."""

    # ── KPIs ──────────────────────────────────────────────────────────────────
    total_agents  = db.query(models.User).count()
    total_admins  = db.query(models.User).filter(models.User.role == "admin").count()
    total_docs    = db.query(models.DocumentRH).count()
    docs_ce_mois  = db.query(models.DocumentRH).filter(
        models.DocumentRH.created_at >= datetime(datetime.now().year, datetime.now().month, 1)
    ).count()

    # ── Docs par type ──────────────────────────────────────────────────────────
    by_type = db.query(
        models.DocumentRH.type_doc,
        func.count(models.DocumentRH.id)
    ).group_by(models.DocumentRH.type_doc).all()

    # ── Top agents (plus actifs) ───────────────────────────────────────────────
    top_agents = db.query(
        models.DocumentRH.user_id,
        func.count(models.DocumentRH.id).label("count")
    ).group_by(models.DocumentRH.user_id)\
     .order_by(func.count(models.DocumentRH.id).desc())\
     .limit(10).all()

    top_agents_list = []
    for user_id, count in top_agents:
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if user:
            top_agents_list.append({
                "id":        user.id,
                "nom_prenom":user.nom_prenom,
                "matricule": user.matricule,
                "unite":     user.unite,
                "role":      user.role,
                "count":     count,
            })

    # ── Activité 30 derniers jours ─────────────────────────────────────────────
    thirty_ago = datetime.now() - timedelta(days=30)
    daily = db.query(
        func.strftime('%Y-%m-%d', models.DocumentRH.created_at).label('day'),
        func.count(models.DocumentRH.id)
    ).filter(models.DocumentRH.created_at >= thirty_ago)\
     .group_by(func.strftime('%Y-%m-%d', models.DocumentRH.created_at))\
     .order_by(func.strftime('%Y-%m-%d', models.DocumentRH.created_at)).all()

    return {
        "total_agents":  total_agents,
        "total_admins":  total_admins,
        "total_docs":    total_docs,
        "docs_ce_mois":  docs_ce_mois,
        "by_type":       [{"type": t, "count": c} for t, c in by_type],
        "top_agents":    top_agents_list,
        "daily_activity":[{"day": d, "count": c} for d, c in daily],
    }


# =============================================================================
# LISTE AGENTS
# =============================================================================

@router.get("/agents")
def list_agents(
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    users = db.query(models.User).order_by(models.User.nom_prenom).all()
    result = []
    for u in users:
        doc_count = db.query(models.DocumentRH).filter(
            models.DocumentRH.user_id == u.id
        ).count()
        last_doc = db.query(models.DocumentRH).filter(
            models.DocumentRH.user_id == u.id
        ).order_by(models.DocumentRH.created_at.desc()).first()

        result.append({
            "id":          u.id,
            "nom_prenom":  u.nom_prenom,
            "matricule":   u.matricule,
            "unite":       u.unite,
            "destinataire":u.destinataire,
            "role":        u.role,
            "doc_count":   doc_count,
            "last_activity": last_doc.created_at.strftime("%d/%m/%Y %H:%M") if last_doc and last_doc.created_at else "—",
            "is_super_admin": u.matricule == SUPER_ADMIN_MATRICULE,
        })
    return result


# =============================================================================
# AJOUTER UN AGENT
# =============================================================================

@router.post("/agents/add")
def add_agent(
    req: AddAgentRequest,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    existing = db.query(models.User).filter(
        models.User.matricule == req.matricule
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Matricule déjà existant")

    # Seul le super admin peut créer d'autres admins
    if req.role == "admin" and not is_super_admin(current_user):
        raise HTTPException(
            status_code=403,
            detail="Seul le super admin peut créer des comptes admin"
        )

    password = req.password or req.matricule  # default = matricule
    new_user = models.User(
        nom_prenom   = req.nom_prenom,
        matricule    = req.matricule,
        unite        = req.unite,
        destinataire = req.destinataire or "",
        role         = req.role,
        password     = auth.hash_password(password),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": f"✅ Agent {new_user.nom_prenom} créé (mot de passe : {password})"}


# =============================================================================
# SUPPRIMER UN AGENT
# =============================================================================

@router.delete("/agents/{user_id}")
def delete_agent(
    user_id: int,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    target = db.query(models.User).filter(models.User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Agent introuvable")

    # Protection super admin
    check_target_protection(target, current_user)

    # Ne peut pas se supprimer soi-même
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Impossible de supprimer votre propre compte")

    # Supprimer aussi les documents RH de cet agent
    db.query(models.DocumentRH).filter(models.DocumentRH.user_id == user_id).delete()
    db.delete(target)
    db.commit()
    return {"message": f"✅ Agent {target.nom_prenom} supprimé"}


# =============================================================================
# RÉINITIALISER MOT DE PASSE
# =============================================================================

@router.post("/agents/reset-password")
def reset_password(
    req: ResetPasswordRequest,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    target = db.query(models.User).filter(models.User.id == req.user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Agent introuvable")

    # Protection super admin
    check_target_protection(target, current_user)

    if len(req.new_password) < 4:
        raise HTTPException(status_code=400, detail="Mot de passe trop court (min 4 caractères)")

    target.password = auth.hash_password(req.new_password)
    db.commit()
    return {"message": f"✅ Mot de passe réinitialisé pour {target.nom_prenom}"}


# =============================================================================
# CHANGER LE RÔLE
# =============================================================================

@router.post("/agents/change-role")
def change_role(
    req: ChangeRoleRequest,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    if req.new_role not in ("agent", "admin"):
        raise HTTPException(status_code=400, detail="Rôle invalide")

    target = db.query(models.User).filter(models.User.id == req.user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Agent introuvable")

    # Protection super admin
    check_target_protection(target, current_user)

    # Ne peut pas changer son propre rôle
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Impossible de modifier votre propre rôle")

    # Seul le super admin peut promouvoir en admin
    if req.new_role == "admin" and not is_super_admin(current_user):
        raise HTTPException(
            status_code=403,
            detail="Seul le super admin peut promouvoir un agent en admin"
        )

    target.role = req.new_role
    db.commit()
    return {"message": f"✅ Rôle de {target.nom_prenom} changé en {req.new_role}"}


# =============================================================================
# HISTORIQUE COMPLET
# =============================================================================

@router.get("/history")
def get_full_history(
    page:  int = 1,
    limit: int = 30,
    type_doc: Optional[str] = None,
    user_id:  Optional[int] = None,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(models.DocumentRH)
    if type_doc: q = q.filter(models.DocumentRH.type_doc == type_doc)
    if user_id:  q = q.filter(models.DocumentRH.user_id  == user_id)

    total = q.count()
    records = q.order_by(models.DocumentRH.created_at.desc())\
               .offset((page-1)*limit).limit(limit).all()

    result = []
    for r in records:
        agent = db.query(models.User).filter(models.User.id == r.user_id).first()
        result.append({
            "id":         r.id,
            "type_doc":   r.type_doc,
            "created_at": r.created_at.strftime("%d/%m/%Y %H:%M") if r.created_at else "—",
            "agent":      agent.nom_prenom if agent else "—",
            "matricule":  agent.matricule  if agent else "—",
            "unite":      agent.unite      if agent else "—",
            "metadata":   r.metadata_doc,
        })

    return {
        "total": total,
        "pages": (total + limit - 1) // limit,
        "page":  page,
        "items": result,
    }
