import os
import io
import json
import base64
import re
from pathlib import Path
from typing import Optional

# ── Charger .env ──────────────────────────────────────────────────────────────
def _load_env():
    """Charge le fichier .env depuis plusieurs emplacements possibles."""
    env_locations = [
        Path(r"C:\projets\portail-dtctq\.env"),
        Path(__file__).parent / ".env",
        Path(__file__).parent.parent / ".env",
    ]
    for loc in env_locations:
        if loc.exists():
            with open(loc, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, val = line.split("=", 1)
                        os.environ.setdefault(key.strip(), val.strip())
            return True
    return False

_load_env()

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL      = os.environ.get("CLAUDE_MODEL", "claude-haiku-4-5-20251001")
USE_CLAUDE        = os.environ.get("USE_CLAUDE", "true").lower() == "true"
THRESHOLD         = int(os.environ.get("OCR_CONFIDENCE_THRESHOLD", "60"))


# =============================================================================
# ÉVALUATION QUALITÉ OCR
# =============================================================================

def ocr_quality_score(fields: dict) -> int:
    """
    Évalue la qualité d'une extraction OCR (0-100).
    Compte le % de champs non vides et non "Non spécifié".
    """
    if not fields:
        return 0
    total  = len(fields)
    filled = sum(
        1 for v in fields.values()
        if v and str(v).strip() not in ("", "Non spécifié", "non spécifié", "—", "None", "null")
    )
    return int((filled / total) * 100)


def needs_claude(fields: dict) -> bool:
    """Retourne True si Claude doit prendre le relais."""
    if not USE_CLAUDE or not ANTHROPIC_API_KEY or ANTHROPIC_API_KEY.startswith("sk-ant-REMPLACE"):
        return False
    score = ocr_quality_score(fields)
    return score < THRESHOLD


# =============================================================================
# CONVERSION PDF → IMAGES BASE64
# =============================================================================

def pdf_to_base64_images(pdf_path: str, max_pages: int = 2) -> list:
    """
    Convertit les premières pages d'un PDF en images base64.
    Claude peut lire directement les images.
    """
    try:
        import fitz  # PyMuPDF
        doc    = fitz.open(pdf_path)
        images = []
        for i in range(min(max_pages, len(doc))):
            page = doc[i]
            mat  = fitz.Matrix(2.0, 2.0)  # 200dpi pour bonne qualité
            pix  = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("png")
            b64 = base64.standard_b64encode(img_bytes).decode("utf-8")
            images.append({"page": i+1, "data": b64, "type": "image/png"})
        doc.close()
        return images
    except ImportError:
        # Fallback avec pdf2image
        try:
            from pdf2image import convert_from_path
            pages  = convert_from_path(pdf_path, dpi=200, first_page=1, last_page=max_pages)
            images = []
            for i, page in enumerate(pages):
                buf = io.BytesIO()
                page.save(buf, format="PNG")
                b64 = base64.standard_b64encode(buf.getvalue()).decode("utf-8")
                images.append({"page": i+1, "data": b64, "type": "image/png"})
            return images
        except Exception as e:
            return []
    except Exception as e:
        return []


# =============================================================================
# EXTRACTION CLAUDE — DEVIS
# =============================================================================

DEVIS_PROMPT = """Tu es un expert en lecture de documents administratifs ONEE (Office National de l'Electricité et de l'Eau Potable) au Maroc.

Analyse ce document et extrait EXACTEMENT ces informations en JSON :

{
  "reference": "Le numéro de référence complet du document (ex: 3/DI/CTR/DTC/TQ/SE/666/2024)",
  "destinataire": "Le destinataire (ex: DCM/GC, M. DUPONT, Direction...)",
  "objet": "L'objet complet du document (la phrase après 'Objet :')",
  "montant_ttc": "Le montant total TTC en chiffres uniquement (ex: 1 590 915,17)",
  "date_document": "La date du document au format JJ/MM/AAAA"
}

RÈGLES IMPORTANTES :
- Si une information n'est pas trouvable, mets "" (chaîne vide) PAS "Non spécifié"
- Pour le montant : prends le DERNIER montant total du tableau (DH/TTC)
- Pour la référence : cherche "N°" ou "Réf" en haut du document
- Pour le destinataire : cherche après "À :", ou un pattern comme DCM/GC, DI/CTR, etc.
- Réponds UNIQUEMENT avec le JSON, sans texte avant ou après
- Ne mets pas de backticks ni de markdown"""

def extract_devis_with_claude(pdf_path: str, ocr_result: dict = None) -> Optional[dict]:
    """
    Extrait les données d'un devis avec Claude AI.
    
    Args:
        pdf_path: Chemin vers le PDF
        ocr_result: Résultat OCR Tesseract existant (pour contexte)
    
    Returns:
        dict avec reference, destinataire, objet, montant_ttc, date_document
        ou None si échec
    """
    if not ANTHROPIC_API_KEY or ANTHROPIC_API_KEY.startswith("sk-ant-REMPLACE"):
        return None

    images = pdf_to_base64_images(pdf_path, max_pages=2)
    if not images:
        return None

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

        # Construire le message avec images
        content = []

        # Ajouter les images (max 2 pages)
        for img in images[:2]:
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": img["type"],
                    "data": img["data"],
                }
            })

        # Ajouter le prompt
        prompt = DEVIS_PROMPT
        if ocr_result:
            # Donner le contexte OCR à Claude pour l'aider
            context = "\n\nContexte OCR (peut contenir des erreurs) :\n"
            for k, v in ocr_result.items():
                if v:
                    context += f"  {k}: {v}\n"
            prompt += context

        content.append({"type": "text", "text": prompt})

        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=500,
            messages=[{"role": "user", "content": content}]
        )

        raw = response.content[0].text.strip()

        # Nettoyer si Claude a mis des backticks
        raw = re.sub(r"```json\s*", "", raw)
        raw = re.sub(r"```\s*", "", raw)
        raw = raw.strip()

        result = json.loads(raw)
        return result

    except json.JSONDecodeError as e:
        return None
    except Exception as e:
        return None


# =============================================================================
# EXTRACTION CLAUDE — COURRIER ARRIVÉE
# =============================================================================

COURRIER_PROMPT = """Tu es un expert en lecture de courriers administratifs ONEE au Maroc.

Analyse ce courrier et extrait ces informations en JSON :

{
  "expediteur": "L'expéditeur du courrier (organisation ou personne qui envoie)",
  "objet": "L'objet du courrier (phrase après 'Objet :')",
  "date_courrier": "La date du courrier au format JJ/MM/AAAA",
  "reference": "La référence ou numéro du courrier si présent",
  "mois": "Le mois en français (ex: Janvier, Février...)"
}

RÈGLES :
- Si une information n'est pas trouvable, mets "" PAS "Non spécifié"
- L'expéditeur est souvent en haut à gauche ou après "De :"
- Réponds UNIQUEMENT avec le JSON valide, sans texte autour"""

def extract_courrier_with_claude(pdf_path: str, ocr_result: dict = None) -> Optional[dict]:
    """Extrait les données d'un courrier avec Claude AI."""
    if not ANTHROPIC_API_KEY or ANTHROPIC_API_KEY.startswith("sk-ant-REMPLACE"):
        return None

    images = pdf_to_base64_images(pdf_path, max_pages=1)
    if not images:
        return None

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

        content = []
        for img in images[:1]:
            content.append({
                "type": "image",
                "source": {"type": "base64", "media_type": img["type"], "data": img["data"]}
            })

        prompt = COURRIER_PROMPT
        if ocr_result:
            context = "\n\nContexte OCR :\n" + "\n".join(f"  {k}: {v}" for k,v in ocr_result.items() if v)
            prompt += context

        content.append({"type": "text", "text": prompt})

        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=400,
            messages=[{"role": "user", "content": content}]
        )

        raw = response.content[0].text.strip()
        raw = re.sub(r"```json\s*|```\s*", "", raw).strip()
        return json.loads(raw)

    except Exception:
        return None


# =============================================================================
# EXTRACTION CLAUDE — BORDEREAU D'ENVOI
# =============================================================================

BORDEREAU_PROMPT = """Tu es un expert en lecture de bordereaux d'envoi ONEE au Maroc.

Analyse ce bordereau et extrait ces informations en JSON :

{
  "reference": "Le numéro ou référence du bordereau",
  "destinataire": "Le destinataire du bordereau",
  "objet": "L'objet ou description du contenu",
  "date_envoi": "La date d'envoi au format JJ/MM/AAAA",
  "nombre_pieces": "Le nombre de pièces jointes si mentionné"
}

RÈGLES :
- Si une information n'est pas trouvable, mets "" PAS "Non spécifié"
- Réponds UNIQUEMENT avec le JSON valide"""

def extract_bordereau_with_claude(pdf_path: str, ocr_result: dict = None) -> Optional[dict]:
    """Extrait les données d'un bordereau avec Claude AI."""
    if not ANTHROPIC_API_KEY or ANTHROPIC_API_KEY.startswith("sk-ant-REMPLACE"):
        return None

    images = pdf_to_base64_images(pdf_path, max_pages=1)
    if not images:
        return None

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

        content = []
        for img in images[:1]:
            content.append({
                "type": "image",
                "source": {"type": "base64", "media_type": img["type"], "data": img["data"]}
            })

        prompt = BORDEREAU_PROMPT
        if ocr_result:
            context = "\n\nContexte OCR :\n" + "\n".join(f"  {k}: {v}" for k,v in ocr_result.items() if v)
            prompt += context

        content.append({"type": "text", "text": prompt})

        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=400,
            messages=[{"role": "user", "content": content}]
        )

        raw = response.content[0].text.strip()
        raw = re.sub(r"```json\s*|```\s*", "", raw).strip()
        return json.loads(raw)

    except Exception:
        return None


# =============================================================================
# FONCTION HYBRIDE PRINCIPALE
# =============================================================================

def hybrid_extract(pdf_path: str, doc_type: str, ocr_fields: dict) -> tuple[dict, str]:
    """
    Extraction hybride : Tesseract → évalue → Claude si nécessaire.

    Args:
        pdf_path:   Chemin PDF
        doc_type:   "devis" | "courrier" | "bordereau"
        ocr_fields: Résultat extrait par Tesseract

    Returns:
        (fields_dict, method_used)
        method_used = "tesseract" | "claude" | "tesseract+claude"
    """
    score = ocr_quality_score(ocr_fields)

    # Tesseract suffisant ?
    if score >= THRESHOLD:
        return ocr_fields, "tesseract"

    # Claude prend le relais
    if not USE_CLAUDE or not ANTHROPIC_API_KEY or ANTHROPIC_API_KEY.startswith("sk-ant-REMPLACE"):
        return ocr_fields, "tesseract"  # Pas de clé → garder Tesseract

    extractors = {
        "devis":      extract_devis_with_claude,
        "courrier":   extract_courrier_with_claude,
        "bordereau":  extract_bordereau_with_claude,
    }

    extractor = extractors.get(doc_type)
    if not extractor:
        return ocr_fields, "tesseract"

    claude_result = extractor(pdf_path, ocr_fields)

    if not claude_result:
        return ocr_fields, "tesseract"  # Claude a échoué → garder Tesseract

    # Fusionner : Claude remplace les champs vides/manquants de Tesseract
    merged = dict(ocr_fields)
    for key, val in claude_result.items():
        if val and str(val).strip():
            # Claude a trouvé quelque chose → priorité à Claude
            if not merged.get(key) or merged.get(key) in ("", "Non spécifié", "—"):
                merged[key] = val

    return merged, "tesseract+claude" if score > 0 else "claude"
