from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from routers import hr, profile
from routers import hr, profile, courrier
from routers import admin
from routers import notifications
from routers import vehicules

import models, auth
from database import engine, get_db, Base
from sqlalchemy import func
from datetime import datetime, timedelta

# ── Create all DB tables on startup ──────────────────────────
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Portail DTC/TQ", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://10.23.23.144:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(hr.router)
app.include_router(profile.router)
app.include_router(courrier.router) 
app.include_router(admin.router)
app.include_router(notifications.router)
app.include_router(vehicules.router)


# ── Pydantic schemas ──────────────────────────────────────────
class UserCreate(BaseModel):
    nom_prenom: str
    matricule:  str
    unite:      str
    role:       str = "agent"
    password:   str


# ── ROUTES ────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "✅ Portail DTC/TQ backend is running", "version": "2.0"}


@app.post("/auth/login")
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(
        models.User.matricule == form.username
    ).first()

    if not user or not auth.verify_password(form.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Matricule ou mot de passe incorrect"
        )

    token = auth.create_token({"sub": user.matricule})
    return {
        "access_token": token,
        "token_type":   "bearer",
        "user": {
            "id":         user.id,
            "nom_prenom": user.nom_prenom,
            "matricule":  user.matricule,
            "unite":      user.unite,
            "role":       user.role,
        }
    }


@app.get("/auth/me")
def get_me(current_user: models.User = Depends(auth.get_current_user)):
    return {
        "id":         current_user.id,
        "nom_prenom": current_user.nom_prenom,
        "matricule":  current_user.matricule,
        "unite":      current_user.unite,
        "role":       current_user.role,
    }


@app.post("/admin/users")
def create_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.require_admin)
):
    existing = db.query(models.User).filter(
        models.User.matricule == user_data.matricule
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Matricule déjà existant")

    new_user = models.User(
        nom_prenom = user_data.nom_prenom,
        matricule  = user_data.matricule,
        unite      = user_data.unite,
        role       = user_data.role,
        password   = auth.hash_password(user_data.password),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": f"✅ Utilisateur {new_user.nom_prenom} créé"}


@app.get("/admin/users")
def list_users(
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.require_admin)
):
    users = db.query(models.User).all()
    return [{"id": u.id, "nom_prenom": u.nom_prenom,
             "matricule": u.matricule, "unite": u.unite,
             "role": u.role} for u in users]
"""
Ajoute ces routes dans backend/main.py
APRÈS les imports existants et APRÈS app.include_router(...)
"""

# ── Ajoute cet import en haut de main.py ──────────────────────────────────────
# from sqlalchemy import func
# (si pas déjà importé)

# ── Ajoute ces routes dans main.py ────────────────────────────────────────────

@app.get("/stats/dashboard")
def get_dashboard_stats(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Toutes les stats réelles pour le dashboard."""
    from sqlalchemy import func, extract
    from datetime import datetime, timedelta

    # ── KPIs globaux ──────────────────────────────────────────────────────────
    courrier_total   = db.query(models.Courrier).count()
    bordereau_total  = db.query(models.Bordereau).count()
    docs_rh_total    = db.query(models.DocumentRH).count()
    depart_total     = db.query(models.CourrierDepart).count()

    # ── Ce mois ───────────────────────────────────────────────────────────────
    now        = datetime.now()
    mois_actuel = now.strftime("%Y-%m")

    docs_rh_ce_mois = db.query(models.DocumentRH).filter(
        models.DocumentRH.created_at >= datetime(now.year, now.month, 1)
    ).count()

    docs_rh_semaine = db.query(models.DocumentRH).filter(
        models.DocumentRH.created_at >= datetime.now() - timedelta(days=7)
    ).count()

    # ── Activité mensuelle courrier (par mois) ────────────────────────────────
    monthly_courrier = db.query(
        models.Courrier.mois,
        func.count(models.Courrier.id)
    ).group_by(models.Courrier.mois).all()

    monthly_docs = db.query(
        func.strftime('%m', models.DocumentRH.created_at).label('month'),
        func.count(models.DocumentRH.id)
    ).group_by(func.strftime('%m', models.DocumentRH.created_at)).all()

    # ── Activité 30 derniers jours ────────────────────────────────────────────
    thirty_ago = datetime.now() - timedelta(days=30)

    daily_rh = db.query(
        func.strftime('%d', models.DocumentRH.created_at).label('day'),
        func.count(models.DocumentRH.id)
    ).filter(
        models.DocumentRH.created_at >= thirty_ago
    ).group_by(func.strftime('%d', models.DocumentRH.created_at)).all()

    # ── Activité récente (10 derniers événements) ─────────────────────────────
    recent_rh = db.query(models.DocumentRH).order_by(
        models.DocumentRH.created_at.desc()
    ).limit(5).all()

    recent_courrier = db.query(models.Courrier).order_by(
        models.Courrier.id.desc()
    ).limit(5).all()

    recent_activity = []

    for doc in recent_rh:
        agent = db.query(models.User).filter(models.User.id == doc.user_id).first()
        recent_activity.append({
            "type":  "rh",
            "text":  agent.nom_prenom if agent else "—",
            "sub":   doc.type_doc,
            "time":  doc.created_at.strftime("%d/%m/%Y %H:%M") if doc.created_at else "—",
            "color": "#10b981",
        })

    for c in recent_courrier:
        recent_activity.append({
            "type":  "courrier",
            "text":  c.expediteur,
            "sub":   "courrier reçu",
            "time":  c.date_courrier or "—",
            "color": "#2563eb",
        })

    recent_activity.sort(key=lambda x: x["time"], reverse=True)
    recent_activity = recent_activity[:8]

    # ── Types de documents (pie chart) ────────────────────────────────────────
    type_counts = db.query(
        models.DocumentRH.type_doc,
        func.count(models.DocumentRH.id)
    ).group_by(models.DocumentRH.type_doc).all()

    # ── Scan inbox (PDFs en attente) ──────────────────────────────────────────
    import os
    pending = 0
    for scan_dir in [
        r"C:\courrier\scan_inbox",
        r"C:\bordereau_envoi\scan_inbox",
        r"C:\courrier_depart_reception\scan_inbox",
    ]:
        if os.path.exists(scan_dir):
            pending += sum(1 for f in os.listdir(scan_dir) if f.lower().endswith(".pdf"))

    return {
        # KPIs
        "courrier_total":   courrier_total,
        "bordereau_total":  bordereau_total,
        "docs_rh_total":    docs_rh_total,
        "depart_total":     depart_total,
        "docs_rh_ce_mois":  docs_rh_ce_mois,
        "docs_rh_semaine":  docs_rh_semaine,
        "pending_pdfs":     pending,

        # Charts
        "monthly_courrier": [{"mois": m, "count": c} for m, c in monthly_courrier],
        "monthly_docs":     [{"month": m, "count": c} for m, c in monthly_docs],
        "daily_activity":   [{"day": int(d), "value": c} for d, c in daily_rh],
        "type_counts":      [{"type": t, "count": c} for t, c in type_counts],

        # Activity feed
        "recent_activity": recent_activity,
    }