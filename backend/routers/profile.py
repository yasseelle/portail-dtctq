"""
routers/profile.py — Endpoints profil utilisateur
Changer mot de passe (agent) + réinitialiser (admin)
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

import models, auth
from database import get_db

router = APIRouter(prefix="/profile", tags=["Profil"])


# =============================================================================
# SCHEMAS
# =============================================================================

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password:     str
    confirm_password: str

class AdminResetPasswordRequest(BaseModel):
    user_id:      int
    new_password: str


# =============================================================================
# ROUTES
# =============================================================================

# ── Agent : voir son profil ──────────────────────────────────────────────────
@router.get("/me")
def get_profile(current_user: models.User = Depends(auth.get_current_user)):
    return {
        "id":          current_user.id,
        "nom_prenom":  current_user.nom_prenom,
        "matricule":   current_user.matricule,
        "unite":       current_user.unite,
        "destinataire":current_user.destinataire,
        "role":        current_user.role,
    }


# ── Agent : changer son propre mot de passe ──────────────────────────────────
@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    # 1 — Verify current password
    if not auth.verify_password(req.current_password, current_user.password):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")

    # 2 — Check new passwords match
    if req.new_password != req.confirm_password:
        raise HTTPException(status_code=400, detail="Les nouveaux mots de passe ne correspondent pas")

    # 3 — Check minimum length
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 6 caractères")

    # 4 — Hash and save
    current_user.password = auth.hash_password(req.new_password)
    db.commit()

    return {"message": "✅ Mot de passe modifié avec succès"}


# ── Admin : voir tous les agents ─────────────────────────────────────────────
@router.get("/admin/users")
def list_all_users(
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    users = db.query(models.User).order_by(models.User.nom_prenom).all()
    return [
        {
            "id":         u.id,
            "nom_prenom": u.nom_prenom,
            "matricule":  u.matricule,
            "unite":      u.unite,
            "role":       u.role,
        }
        for u in users
    ]


# ── Admin : réinitialiser le mot de passe d'un agent ────────────────────────
@router.post("/admin/reset-password")
def admin_reset_password(
    req: AdminResetPasswordRequest,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    if len(req.new_password) < 4:
        raise HTTPException(status_code=400, detail="Mot de passe trop court (min 4 caractères)")

    user.password = auth.hash_password(req.new_password)
    db.commit()

    return {"message": f"✅ Mot de passe réinitialisé pour {user.nom_prenom}"}


# ── Admin : changer le rôle d'un agent ──────────────────────────────────────
@router.post("/admin/change-role")
def change_role(
    user_id: int,
    new_role: str,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    if new_role not in ("agent", "admin"):
        raise HTTPException(status_code=400, detail="Rôle invalide (agent ou admin)")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    # Prevent admin from removing their own admin role
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Impossible de modifier votre propre rôle")

    user.role = new_role
    db.commit()

    return {"message": f"✅ Rôle de {user.nom_prenom} changé en {new_role}"}
