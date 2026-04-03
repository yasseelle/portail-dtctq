import sys
import os
import re
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))

from database import SessionLocal, engine, Base
import models

Base.metadata.create_all(bind=engine)
db = SessionLocal()

# ── CONFIG ────────────────────────────────────────────────────────────────────
STORAGE_DIRS = {
    "courrier":   r"C:\courrier\storage",
    "bordereau":  r"C:\bordereau_envoi\storage",
    "depart":     r"C:\courrier_depart_reception\depart_storage",
    "reception":  r"C:\courrier_depart_reception\reception_storage",
}


def normalize(s: str) -> str:
    """Normalize string for fuzzy matching."""
    s = (s or "").strip().upper()
    s = re.sub(r"\s+", " ", s)
    # Remove common punctuation
    s = re.sub(r"[^A-Z0-9 ]", "", s)
    return s.strip()


def get_pdfs_in_dir(directory: str) -> list:
    """Get all PDF files in a directory."""
    p = Path(directory)
    if not p.exists():
        return []
    return [f for f in p.iterdir() if f.is_file() and f.suffix.lower() == ".pdf"]


def find_best_pdf(expediteur: str, date_str: str, pdfs: list) -> Path | None:
    """
    Find the best matching PDF for an expediteur + date.
    PDF naming: EXPEDITEUR_YYYYMMDDHHMMSS.pdf
    Strategy:
      1. Match by expediteur prefix + date (exact)
      2. Match by expediteur prefix only (closest date)
    """
    exp_norm = normalize(expediteur)
    if not exp_norm:
        return None

    # Try to parse date from date_str (DD/MM/YYYY)
    target_date = None
    if date_str:
        for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
            try:
                target_date = datetime.strptime(date_str.strip(), fmt)
                break
            except:
                pass

    candidates = []
    for pdf in pdfs:
        stem = pdf.stem.upper()
        # stem = "EXPEDITEUR_YYYYMMDDHHMMSS" or "EXPEDITEUR NAME_YYYYMMDDHHMMSS"
        # Split on last underscore that looks like a timestamp
        parts = stem.rsplit("_", 1)
        if len(parts) != 2:
            continue

        pdf_exp  = normalize(parts[0])
        pdf_date = parts[1]  # YYYYMMDDHHMMSS

        # Check if expediteur matches (prefix match)
        if not (pdf_exp.startswith(exp_norm[:6]) or exp_norm.startswith(pdf_exp[:6])):
            # Also try word-by-word match
            exp_words = exp_norm.split()
            pdf_words = pdf_exp.split()
            if not any(w in pdf_words for w in exp_words if len(w) >= 4):
                continue

        # Parse pdf date
        pdf_dt = None
        if len(pdf_date) >= 8:
            try:
                pdf_dt = datetime.strptime(pdf_date[:8], "%Y%m%d")
            except:
                pass

        # Compute score: same date = best
        score = 0
        if target_date and pdf_dt:
            diff = abs((target_date - pdf_dt).days)
            score = max(0, 365 - diff)  # closer = higher score

        candidates.append((score, pdf))

    if not candidates:
        return None

    candidates.sort(key=lambda x: x[0], reverse=True)
    best_score, best_pdf = candidates[0]

    # Only accept if score > 0 (at least some date proximity) OR only one candidate
    if best_score > 0 or len(candidates) == 1:
        return best_pdf
    return None


# =============================================================================
# 1. FIX COURRIER ARRIVÉE
# =============================================================================
print("\n" + "="*55)
print("  LIAISON PDFs → BASE DE DONNÉES")
print("="*55)

pdfs_courrier = get_pdfs_in_dir(STORAGE_DIRS["courrier"])
print(f"\n📂 Courrier storage : {len(pdfs_courrier)} PDFs trouvés")

records = db.query(models.Courrier).all()
updated_c = skipped_c = not_found_c = 0

for r in records:
    # Already has a path that exists → skip
    if r.pdf_path and Path(r.pdf_path).exists():
        skipped_c += 1
        continue

    best = find_best_pdf(r.expediteur, r.date_courrier, pdfs_courrier)
    if best:
        r.pdf_path = str(best)
        updated_c += 1
    else:
        not_found_c += 1

db.commit()
print(f"  ✅ Courrier Arrivée  : {updated_c} liés, {skipped_c} déjà liés, {not_found_c} sans PDF")


# =============================================================================
# 2. FIX BORDEREAU
# =============================================================================
pdfs_bordereau = get_pdfs_in_dir(STORAGE_DIRS["bordereau"])
print(f"\n📂 Bordereau storage : {len(pdfs_bordereau)} PDFs trouvés")

records_b = db.query(models.Bordereau).all()
updated_b = skipped_b = not_found_b = 0

for r in records_b:
    if r.pdf_path and Path(r.pdf_path).exists():
        skipped_b += 1
        continue

    # For bordereau, use destinataire as key
    best = find_best_pdf(r.destinataire, "", pdfs_bordereau)
    if best:
        r.pdf_path = str(best)
        updated_b += 1
    else:
        not_found_b += 1

db.commit()
print(f"  ✅ Bordereau Envoi   : {updated_b} liés, {skipped_b} déjà liés, {not_found_b} sans PDF")


# =============================================================================
# 3. FIX COURRIER DÉPART
# =============================================================================
pdfs_depart    = get_pdfs_in_dir(STORAGE_DIRS["depart"])
pdfs_reception = get_pdfs_in_dir(STORAGE_DIRS["reception"])
print(f"\n📂 Départ storage    : {len(pdfs_depart)} PDFs trouvés")
print(f"📂 Réception storage : {len(pdfs_reception)} PDFs trouvés")

records_d = db.query(models.CourrierDepart).all()
updated_d = skipped_d = not_found_d = 0

for r in records_d:
    changed = False

    if not r.pdf_depart_path or not Path(r.pdf_depart_path).exists():
        best = find_best_pdf(r.destinataire, r.date_depart, pdfs_depart)
        if best:
            r.pdf_depart_path = str(best)
            changed = True

    if not r.pdf_reception_path or not Path(r.pdf_reception_path).exists():
        if r.date_reception:
            best_r = find_best_pdf(r.destinataire, r.date_reception, pdfs_reception)
            if best_r:
                r.pdf_reception_path = str(best_r)
                changed = True

    if changed:
        updated_d += 1
    elif r.pdf_depart_path:
        skipped_d += 1
    else:
        not_found_d += 1

db.commit()
print(f"  ✅ Courrier Départ   : {updated_d} liés, {skipped_d} déjà liés, {not_found_d} sans PDF")

print(f"\n  📊 Total mis à jour : {updated_c + updated_b + updated_d}")
print("="*55 + "\n")

db.close()
