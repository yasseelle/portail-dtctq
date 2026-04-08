"""
fix_devis_pdf_links.py
======================
Relie les PDFs du dossier C:\\devis\\storage\\ aux enregistrements DB.

Stratégie de matching :
1. Date extraite du nom de fichier (YYYYMMDD) vs date_devis en DB
2. Si plusieurs fichiers pour la même date → ordre alphabétique vs ordre id DB
3. Les fichiers sans match → enregistrement DB créé automatiquement

Lance :
  C:\\Users\\jabbari\\AppData\\Local\\Python\\bin\\python.exe fix_devis_pdf_links.py
"""

import re
import sys
import os
from pathlib import Path
from datetime import datetime

sys.path.insert(0, r"C:\projets\portail-dtctq\backend")

STORAGE_DIR = Path(r"C:\devis\storage")


def get_file_date(filename: str) -> str:
    """
    Extrait la date du nom de fichier.
    Formats reconnus :
      DEVIE_20250211180952.pdf     → 2025-02-11
      DEVI MEJATIA_20250605130245  → 2025-06-05
      NOM_QUELCONQUE_20260406.pdf  → 2026-04-06
    """
    m = re.search(r"(\d{8})", filename)
    if m:
        raw = m.group(1)
        try:
            d = datetime.strptime(raw, "%Y%m%d")
            return d.strftime("%d/%m/%Y")
        except:
            pass
    return ""


def normalize_date(date_str: str) -> str:
    """Normalise une date au format DD/MM/YYYY."""
    if not date_str:
        return ""
    # Déjà DD/MM/YYYY
    if re.match(r"\d{2}/\d{2}/\d{4}", date_str):
        return date_str
    # YYYY-MM-DD
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", date_str)
    if m:
        return f"{m.group(3)}/{m.group(2)}/{m.group(1)}"
    return date_str


def main():
    from database import SessionLocal, engine, Base
    import models

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    print("=" * 60)
    print("FIX DEVIS PDF LINKS")
    print("=" * 60)

    # ── Lister tous les PDFs du storage ──
    pdf_files = sorted([
        f for f in STORAGE_DIR.iterdir()
        if f.suffix.lower() == ".pdf"
    ])
    print(f"\n📁 Fichiers dans storage ({len(pdf_files)}) :")
    for f in pdf_files:
        print(f"   {f.name}  →  date extraite: {get_file_date(f.name)}")

    # ── Charger tous les devis DB ──
    all_devis = db.query(models.Devis).order_by(models.Devis.id).all()
    print(f"\n📋 Enregistrements DB ({len(all_devis)}) :")
    for d in all_devis:
        print(f"   id={d.id} | ref={d.reference[:40]} | date={d.date_devis} | pdf_path='{d.pdf_path}'")

    print("\n" + "=" * 60)
    print("MATCHING...")
    print("=" * 60)

    updated = 0
    unmatched_files = []

    # ── Grouper fichiers par date ──
    files_by_date: dict = {}
    for f in pdf_files:
        date = get_file_date(f.name)
        if date not in files_by_date:
            files_by_date[date] = []
        files_by_date[date].append(f)

    # ── Grouper devis DB par date ──
    devis_by_date: dict = {}
    for d in all_devis:
        norm = normalize_date(d.date_devis)
        if norm not in devis_by_date:
            devis_by_date[norm] = []
        devis_by_date[norm].append(d)

    print("\nFichiers par date :", {k: [f.name for f in v] for k, v in files_by_date.items()})
    print("Devis DB par date :", {k: [d.id for d in v] for k, v in devis_by_date.items()})

    # ── Matcher par date ──
    matched_devis_ids = set()
    matched_file_names = set()

    for date, files in sorted(files_by_date.items()):
        if not date:
            unmatched_files.extend(files)
            continue

        db_records = devis_by_date.get(date, [])

        # Filtrer ceux déjà matchés
        db_records = [d for d in db_records if d.id not in matched_devis_ids]
        files      = [f for f in files if f.name not in matched_file_names]

        if not db_records:
            print(f"\n⚠️  Date {date} : {len(files)} fichier(s) sans enregistrement DB → sera créé")
            unmatched_files.extend(files)
            continue

        # Match 1-to-1 dans l'ordre
        for i, f in enumerate(files):
            if i < len(db_records):
                record = db_records[i]
                old_path = record.pdf_path
                record.pdf_path = str(f)
                matched_devis_ids.add(record.id)
                matched_file_names.add(f.name)
                print(f"\n✅ MATCH : {f.name}")
                print(f"   → DB id={record.id} | ref={record.reference[:50]}")
                print(f"   → pdf_path: '{old_path}' → '{str(f)}'")
                updated += 1
            else:
                unmatched_files.append(f)

    db.commit()

    # ── Fichiers sans match → créer enregistrement DB ──
    if unmatched_files:
        print(f"\n{'='*60}")
        print(f"FICHIERS SANS MATCH ({len(unmatched_files)}) → Création en DB")
        print(f"{'='*60}")
        for f in unmatched_files:
            if f.name in matched_file_names:
                continue
            date = get_file_date(f.name)
            # Détecter mois
            mois = ""
            if date:
                try:
                    d = datetime.strptime(date, "%d/%m/%Y")
                    MONTHS = {1:"Janvier",2:"Février",3:"Mars",4:"Avril",5:"Mai",
                              6:"Juin",7:"Juillet",8:"Août",9:"Septembre",
                              10:"Octobre",11:"Novembre",12:"Décembre"}
                    mois = MONTHS[d.month]
                except:
                    pass

            new_record = models.Devis(
                reference    = f"FICHIER_{f.stem}",
                destinataire = "",
                objet        = f"Document scanné — {f.name}",
                montant_ttc  = "",
                pdf_path     = str(f),
                date_devis   = date,
                mois         = mois,
            )
            db.add(new_record)
            db.commit()
            db.refresh(new_record)
            print(f"➕ Créé : id={new_record.id} | fichier={f.name} | date={date}")

    # ── Résumé final ──
    print(f"\n{'='*60}")
    print(f"RÉSUMÉ")
    print(f"{'='*60}")
    print(f"✅ Liens mis à jour : {updated}")
    print(f"➕ Nouveaux enregistrements : {len(unmatched_files)}")

    # Vérification finale
    print(f"\n📋 État final de la DB :")
    for d in db.query(models.Devis).order_by(models.Devis.id).all():
        exists = Path(d.pdf_path).exists() if d.pdf_path else False
        status = "✅" if exists else "❌"
        print(f"   id={d.id} | {status} pdf | ref={d.reference[:40]} | path={d.pdf_path}")

    db.close()
    print("\n🎉 Fix terminé !")


if __name__ == "__main__":
    main()
