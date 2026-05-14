"""
routers/database_manager.py
============================
Panel de gestion directe de la base de données.
Accès EXCLUSIF au Super Admin : JABBARI ILYASS (84488R)

Fonctionnalités :
- Lecture paginée + recherche + tri sur toutes les tables
- Suppression simple + suppression en masse (bulk)
- Modification d'enregistrements
- Détection automatique de doublons
- Export CSV

Dans main.py, ajouter :
  from routers import database_manager
  app.include_router(database_manager.router)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect
from pydantic import BaseModel
from typing import Optional, List, Any, Dict
import io
import csv

import models, auth
from database import get_db, engine

router = APIRouter(prefix="/db-manager", tags=["Database Manager"])

SUPER_ADMIN_MATRICULE = "84488R"

# Tables autorisées + colonnes éditables par table
ALLOWED_TABLES: Dict[str, Dict] = {
    "users": {
        "model": models.User,
        "label": "Utilisateurs",
        "editable_cols": ["nom_prenom", "matricule", "unite", "destinataire", "role"],
        "search_cols": ["nom_prenom", "matricule", "unite", "role"],
        "display_cols": ["id", "nom_prenom", "matricule", "unite", "destinataire", "role", "created_at"],
    },
    "courrier": {
        "model": models.Courrier,
        "label": "Courrier Arrivée",
        "editable_cols": ["expediteur", "date_courrier", "objet", "mois"],
        "search_cols": ["expediteur", "objet", "date_courrier", "mois"],
        "display_cols": ["id", "expediteur", "date_courrier", "objet", "mois", "pdf_path", "created_at"],
        "dup_key": "objet",  # colonne pour détecter les doublons
    },
    "bordereau": {
        "model": models.Bordereau,
        "label": "Bordereau d'Envoi",
        "editable_cols": ["reference", "destinataire", "objet"],
        "search_cols": ["reference", "destinataire", "objet"],
        "display_cols": ["id", "reference", "destinataire", "objet", "pdf_path", "created_at"],
        "dup_key": "reference",
    },
    "courrier_depart": {
        "model": models.CourrierDepart,
        "label": "Courrier Départ",
        "editable_cols": ["reference", "date_depart", "destinataire", "objet", "date_reception"],
        "search_cols": ["reference", "destinataire", "objet"],
        "display_cols": ["id", "reference", "date_depart", "destinataire", "objet", "date_reception", "mois"],
        "dup_key": "reference",
    },
    "devis": {
        "model": models.Devis,
        "label": "Registre Devis",
        "editable_cols": ["reference", "destinataire", "objet", "montant_ttc", "date_devis", "mois"],
        "search_cols": ["reference", "destinataire", "objet", "montant_ttc"],
        "display_cols": ["id", "reference", "destinataire", "objet", "montant_ttc", "date_devis", "mois"],
        "dup_key": "reference",
    },
    "vehicules": {
        "model": models.Vehicule,
        "label": "Parc Véhicules",
        "editable_cols": ["numero_vehicule", "matricule", "modele", "service", "derniere_visite", "prochaine_visite"],
        "search_cols": ["matricule", "modele", "service", "numero_vehicule"],
        "display_cols": ["id", "numero_vehicule", "matricule", "modele", "service", "derniere_visite", "prochaine_visite"],
    },
    "notifications": {
        "model": models.Notification,
        "label": "Notifications",
        "editable_cols": ["titre", "message", "type_notif", "cible"],
        "search_cols": ["titre", "message", "type_notif"],
        "display_cols": ["id", "titre", "type_notif", "cible", "created_by", "created_at"],
    },
    "projets": {
        "model": models.Projet,
        "label": "Projets",
        "editable_cols": ["nom", "type_projet", "description", "localisation", "statut", "priorite"],
        "search_cols": ["nom", "localisation", "statut", "type_projet"],
        "display_cols": ["id", "nom", "type_projet", "statut", "priorite", "localisation", "date_debut", "date_fin_prev"],
    },
}


# =============================================================================
# AUTH HELPER
# =============================================================================

def require_super_admin(current_user: models.User = Depends(auth.get_current_user)) -> models.User:
    if current_user.matricule != SUPER_ADMIN_MATRICULE:
        raise HTTPException(
            status_code=403,
            detail="Accès refusé — Réservé au Super Admin uniquement (JABBARI ILYASS)"
        )
    return current_user


def get_model(table: str):
    if table not in ALLOWED_TABLES:
        raise HTTPException(400, f"Table inconnue : {table}")
    return ALLOWED_TABLES[table]


def row_to_dict(row, display_cols: list) -> dict:
    result = {}
    for col in display_cols:
        val = getattr(row, col, None)
        if val is None:
            result[col] = ""
        elif hasattr(val, 'strftime'):
            result[col] = val.strftime("%d/%m/%Y %H:%M")
        else:
            result[col] = str(val)
    result["_id"] = row.id
    return result


# =============================================================================
# SCHEMAS
# =============================================================================

class RowUpdate(BaseModel):
    data: Dict[str, Any]

class BulkDeleteRequest(BaseModel):
    ids: List[int]


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/tables")
def list_tables(current_user=Depends(require_super_admin)):
    """Liste toutes les tables disponibles avec métadonnées."""
    return [
        {
            "key": k,
            "label": v["label"],
            "editable_cols": v["editable_cols"],
            "display_cols": v["display_cols"],
            "has_dup_detection": "dup_key" in v,
        }
        for k, v in ALLOWED_TABLES.items()
    ]


@router.get("/{table}/rows")
def get_rows(
    table: str,
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    sort_col: Optional[str] = Query(None),
    sort_dir: str = Query("desc", regex="^(asc|desc)$"),
    current_user=Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Récupère les lignes d'une table avec pagination, recherche et tri."""
    cfg = get_model(table)
    model = cfg["model"]
    display_cols = cfg["display_cols"]
    search_cols = cfg["search_cols"]

    q = db.query(model)

    # Search
    if search:
        from sqlalchemy import or_
        term = f"%{search}%"
        conditions = []
        for col_name in search_cols:
            col = getattr(model, col_name, None)
            if col is not None:
                conditions.append(col.ilike(term))
        if conditions:
            q = q.filter(or_(*conditions))

    total = q.count()

    # Sort
    if sort_col and hasattr(model, sort_col):
        col_attr = getattr(model, sort_col)
        q = q.order_by(col_attr.desc() if sort_dir == "desc" else col_attr.asc())
    else:
        q = q.order_by(model.id.desc())

    rows = q.offset((page - 1) * limit).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "pages": max(1, (total + limit - 1) // limit),
        "table": table,
        "label": cfg["label"],
        "display_cols": display_cols,
        "editable_cols": cfg["editable_cols"],
        "items": [row_to_dict(r, display_cols) for r in rows],
    }


@router.get("/{table}/duplicates")
def find_duplicates(
    table: str,
    current_user=Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Détecte les doublons dans une table (si dup_key configurée)."""
    cfg = get_model(table)
    if "dup_key" not in cfg:
        return {"duplicates": [], "count": 0, "message": "Pas de détection de doublons configurée pour cette table"}

    model = cfg["model"]
    dup_key = cfg["dup_key"]
    dup_col = getattr(model, dup_key, None)
    if dup_col is None:
        return {"duplicates": [], "count": 0}

    from sqlalchemy import func
    dups = db.query(dup_col, func.count(model.id).label("cnt"))\
             .group_by(dup_col)\
             .having(func.count(model.id) > 1)\
             .all()

    result = []
    for val, cnt in dups:
        rows = db.query(model).filter(dup_col == val).order_by(model.id.asc()).all()
        result.append({
            "key_value":  str(val),
            "count":      cnt,
            "ids":        [r.id for r in rows],
            "id_a_garder": rows[0].id,          # le plus ancien
            "ids_a_supprimer": [r.id for r in rows[1:]],  # tous les autres
            "rows":       [row_to_dict(r, cfg["display_cols"]) for r in rows],
        })

    return {
        "duplicates":          result,
        "count":               len(result),
        "total_duplicate_rows":sum(d["count"] for d in result),
        "total_a_supprimer":   sum(len(d["ids_a_supprimer"]) for d in result),
        "dup_key":             dup_key,
    }


@router.post("/{table}/auto-deduplicate")
def auto_deduplicate(
    table: str,
    current_user=Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """
    Supprime automatiquement tous les doublons.
    Stratégie : garde le plus ancien (ID le plus bas), supprime tous les autres.
    Ne touche pas à Excel — agit uniquement sur la DB SQLite.
    Les doublons ne reviennent pas car la sync Excel vérifie l'existence avant d'insérer.
    """
    cfg = get_model(table)
    if "dup_key" not in cfg:
        raise HTTPException(400, f"Pas de détection de doublons configurée pour {table}")

    model   = cfg["model"]
    dup_key = cfg["dup_key"]
    dup_col = getattr(model, dup_key, None)
    if dup_col is None:
        raise HTTPException(400, f"Colonne {dup_key} introuvable dans {table}")

    from sqlalchemy import func

    # Trouve tous les groupes de doublons
    dups = db.query(dup_col, func.count(model.id).label("cnt"))\
             .group_by(dup_col)\
             .having(func.count(model.id) > 1)\
             .all()

    if not dups:
        return {
            "message":  "✅ Aucun doublon détecté — la table est déjà propre",
            "deleted":  0,
            "kept":     0,
            "details":  [],
        }

    deleted_total = 0
    details       = []

    for val, cnt in dups:
        # Récupère tous les enregistrements en doublon, triés par ID croissant
        rows = db.query(model)\
                 .filter(dup_col == val)\
                 .order_by(model.id.asc())\
                 .all()

        if len(rows) <= 1:
            continue

        # Garde le premier (plus ancien), supprime les suivants
        to_keep   = rows[0]
        to_delete = rows[1:]

        for row in to_delete:
            # ── BLACKLIST avant suppression ──────────────────────────────
            _blacklist_row_if_needed(table, row, db)
            db.delete(row)
            deleted_total += 1

        details.append({
            "valeur":        str(val),
            "id_conservé":   to_keep.id,
            "ids_supprimés": [r.id for r in to_delete],
            "nb_supprimés":  len(to_delete),
        })

    db.commit()

    return {
        "message": f"✅ Déduplication terminée — {deleted_total} doublon(s) supprimé(s), {len(details)} groupe(s) traité(s)",
        "deleted": deleted_total,
        "kept":    len(details),
        "details": details,
    }


@router.get("/{table}/stats")
def get_table_stats(
    table: str,
    current_user=Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Stats rapides sur une table."""
    cfg = get_model(table)
    model = cfg["model"]
    total = db.query(model).count()

    result = {"total": total, "table": table, "label": cfg["label"]}

    # Doublons
    if "dup_key" in cfg:
        from sqlalchemy import func
        dup_col = getattr(model, cfg["dup_key"], None)
        if dup_col is not None:
            dup_count = db.query(dup_col)\
                          .group_by(dup_col)\
                          .having(func.count(model.id) > 1)\
                          .count()
            result["duplicate_groups"] = dup_count

    # Users spécifique
    if table == "users":
        result["admins"] = db.query(model).filter(model.role == "admin").count()
        result["agents"] = db.query(model).filter(model.role == "agent").count()

    return result


@router.put("/{table}/{row_id}")
def update_row(
    table: str,
    row_id: int,
    req: RowUpdate,
    current_user=Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Modifie un enregistrement."""
    cfg = get_model(table)
    model = cfg["model"]
    editable = cfg["editable_cols"]

    row = db.query(model).filter(model.id == row_id).first()
    if not row:
        raise HTTPException(404, f"Enregistrement #{row_id} introuvable dans {table}")

    # Protection super admin sur la table users
    if table == "users":
        if getattr(row, "matricule", None) == SUPER_ADMIN_MATRICULE:
            raise HTTPException(403, "Impossible de modifier le compte Super Admin")

    changed = []
    for col, val in req.data.items():
        if col not in editable:
            continue
        if col == "role" and table == "users":
            if val not in ("agent", "admin"):
                raise HTTPException(400, f"Rôle invalide : {val}")
        old = getattr(row, col, None)
        if str(old) != str(val):
            setattr(row, col, val)
            changed.append(f"{col}: {old} → {val}")

    if not changed:
        return {"message": "Aucun changement détecté"}

    db.commit()
    return {"message": f"✅ Enregistrement #{row_id} mis à jour", "changes": changed}


# Tables concernées par la blacklist sync
SYNC_TABLES = {"courrier", "bordereau", "courrier_depart"}

def _blacklist_row_if_needed(table: str, row, db):
    """
    Si la table est synchronisée depuis Excel, blackliste la ligne
    avant suppression pour qu'elle ne revienne pas à la prochaine sync.
    """
    if table not in SYNC_TABLES:
        return
    try:
        import hashlib
        def make_hash(*parts):
            combined = "|".join(str(p).strip().lower() for p in parts)
            return hashlib.md5(combined.encode("utf-8")).hexdigest()[:16]

        if table == "courrier":
            row_hash = make_hash(
                getattr(row, "expediteur", ""),
                getattr(row, "date_courrier", ""),
                getattr(row, "objet", ""),
                getattr(row, "mois", ""),
            )
        elif table == "bordereau":
            row_hash = make_hash(
                getattr(row, "reference", ""),
                getattr(row, "objet", ""),
                getattr(row, "destinataire", ""),
            )
        elif table == "courrier_depart":
            row_hash = make_hash(
                getattr(row, "reference", ""),
                getattr(row, "date_depart", ""),
                getattr(row, "objet", ""),
            )
        else:
            return

        from sqlalchemy import text
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS sync_blacklist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_name TEXT NOT NULL,
                row_hash TEXT NOT NULL,
                deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(table_name, row_hash)
            )
        """))
        db.execute(
            text("INSERT OR IGNORE INTO sync_blacklist (table_name, row_hash) VALUES (:t, :h)"),
            {"t": table, "h": row_hash}
        )
    except Exception:
        pass  # Ne bloque pas la suppression si blacklist échoue


@router.delete("/{table}/{row_id}")
def delete_row(
    table: str,
    row_id: int,
    current_user=Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Supprime un enregistrement et le blackliste pour éviter la réinsertion par sync."""
    cfg = get_model(table)
    model = cfg["model"]

    row = db.query(model).filter(model.id == row_id).first()
    if not row:
        raise HTTPException(404, f"Enregistrement #{row_id} introuvable dans {table}")

    # Protection super admin
    if table == "users":
        if getattr(row, "matricule", None) == SUPER_ADMIN_MATRICULE:
            raise HTTPException(403, "Impossible de supprimer le compte Super Admin")
        if row.id == current_user.id:
            raise HTTPException(400, "Impossible de supprimer votre propre compte")

    # ── BLACKLIST avant suppression (tables sync Excel uniquement) ──────────
    _blacklist_row_if_needed(table, row, db)

    db.delete(row)
    db.commit()
    return {"message": f"✅ Enregistrement #{row_id} supprimé de {table} — ne reviendra pas à la prochaine sync"}


@router.post("/{table}/bulk-delete")
def bulk_delete(
    table: str,
    req: BulkDeleteRequest,
    current_user=Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Supprime plusieurs enregistrements en une seule opération."""
    cfg = get_model(table)
    model = cfg["model"]

    if not req.ids:
        raise HTTPException(400, "Liste d'IDs vide")

    # Protection super admin
    if table == "users":
        protected = db.query(model).filter(
            model.id.in_(req.ids),
            model.matricule == SUPER_ADMIN_MATRICULE
        ).first()
        if protected:
            raise HTTPException(403, "La liste contient le Super Admin — opération refusée")
        if current_user.id in req.ids:
            raise HTTPException(400, "Impossible de supprimer votre propre compte")

    rows = db.query(model).filter(model.id.in_(req.ids)).all()
    found_ids = [r.id for r in rows]
    not_found = [i for i in req.ids if i not in found_ids]

    for row in rows:
        # ── BLACKLIST avant suppression ──────────────────────────────────────
        _blacklist_row_if_needed(table, row, db)
        db.delete(row)
    db.commit()

    return {
        "message": f"✅ {len(rows)} enregistrement(s) supprimé(s) de {table} — ne reviendront pas à la prochaine sync",
        "deleted": found_ids,
        "not_found": not_found,
    }


# =============================================================================
# ENDPOINT — IDs SANS PDF (pour sélection rapide côté frontend)
# =============================================================================

# Colonnes PDF par table
PDF_COLS: Dict[str, str] = {
    "courrier":        "pdf_path",
    "bordereau":       "pdf_path",
    "courrier_depart": "pdf_depart_path",
    "devis":           "pdf_path",
}

@router.get("/{table}/no-pdf-ids")
def get_no_pdf_ids(
    table: str,
    current_user=Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """
    Retourne tous les IDs des enregistrements sans PDF associé.
    Utilisé pour la sélection rapide "lignes sans PDF" côté frontend.
    Parcourt TOUTES les lignes (pas de pagination) pour une sélection complète.
    """
    cfg = get_model(table)

    # Vérifie que cette table a un champ PDF
    pdf_col_name = PDF_COLS.get(table)
    if not pdf_col_name:
        return {"ids": [], "total": 0, "message": f"Pas de champ PDF pour la table {table}"}

    model = cfg["model"]
    pdf_col = getattr(model, pdf_col_name, None)
    if pdf_col is None:
        return {"ids": [], "total": 0}

    # Récupère tous les IDs où pdf_path est vide, null, ou "None"
    from sqlalchemy import or_, and_
    rows = db.query(model.id).filter(
        or_(
            pdf_col == None,
            pdf_col == "",
            pdf_col == "None",
        )
    ).all()

    ids = [r[0] for r in rows]

    # Statistiques
    total_rows = db.query(model).count()
    with_pdf   = db.query(model).filter(
        and_(pdf_col != None, pdf_col != "", pdf_col != "None")
    ).count()

    return {
        "ids":       ids,
        "count":     len(ids),
        "total":     total_rows,
        "with_pdf":  with_pdf,
        "pct_manquant": round((len(ids) / total_rows * 100) if total_rows else 0, 1),
        "message":   f"{len(ids)} enregistrement(s) sans PDF sur {total_rows} total ({with_pdf} avec PDF)",
    }


@router.get("/{table}/export-csv")
def export_csv(
    table: str,
    search: Optional[str] = Query(None),
    current_user=Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Export CSV de la table (avec filtre optionnel)."""
    cfg = get_model(table)
    model = cfg["model"]
    display_cols = cfg["display_cols"]
    search_cols = cfg["search_cols"]

    q = db.query(model)
    if search:
        from sqlalchemy import or_
        term = f"%{search}%"
        conditions = [getattr(model, c).ilike(term) for c in search_cols if hasattr(model, c)]
        if conditions:
            q = q.filter(or_(*conditions))

    rows = q.order_by(model.id.asc()).all()

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=display_cols + ["_id"])
    writer.writeheader()
    for row in rows:
        writer.writerow(row_to_dict(row, display_cols))

    output.seek(0)
    filename = f"{table}_export.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )