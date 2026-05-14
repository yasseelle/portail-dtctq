"""
ai_attachement.py — Extraction Claude AI pour les Attachements ONEE
Placé dans : C:\projets\portail-dtctq\backend\ai_attachement.py
"""

import os
import re
import json
import base64
import anthropic
from pathlib import Path
from typing import Optional

# ── Init client ──────────────────────────────────────────────────────────────
_client: Optional[anthropic.Anthropic] = None

def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY manquant dans .env")
        _client = anthropic.Anthropic(api_key=api_key)
    return _client


# ── Prompt principal ──────────────────────────────────────────────────────────
SYSTEM_PROMPT = """Tu es un assistant spécialisé dans l'extraction de données depuis des documents ONEE (Office National de l'Électricité et de l'Eau Potable) du Maroc.

Un attachement ONEE est un document de décompte de travaux : il liste les articles réalisés avec leurs quantités, unités et prix.

Tu dois extraire les informations EXACTEMENT comme elles apparaissent dans le document, sans inventer.
Réponds UNIQUEMENT en JSON valide, sans texte avant ni après, sans balises markdown.
"""

USER_PROMPT = """Extrait toutes les informations de cet attachement ONEE et retourne ce JSON exact :

{
  "entreprise": "nom de l'entreprise (ex: ELECTRO TADART)",
  "date_document": "date du document format DD/MM/YYYY",
  "marche_numero": "numéro de marché (ex: TC97132 ou SR1234)",
  "marche_nom": "nom/objet du marché",
  "date_debut": "date début des travaux DD/MM/YYYY",
  "date_fin": "date fin des travaux DD/MM/YYYY",
  "att_numero": 9,
  "articles": [
    {
      "article": "libellé de l'article",
      "quantite": 19.0,
      "unite": "Ton",
      "prix_unitaire": 1500.0,
      "montant_total": 28500.0
    }
  ]
}

Règles importantes :
- att_numero : cherche "Attachement N°X", "Att. N°X", "Situation N°X" → retourne le chiffre uniquement
- marche_numero : commence par TC, SR, ou autre code ONEE
- Si montant_total n'est pas dans le tableau, calcule quantite * prix_unitaire
- Si une valeur est absente, mets null
- articles : extrait TOUTES les lignes du tableau, même s'il y en a 30"""


def extract_attachement_from_pdf(pdf_path: str) -> dict:
    """
    Envoie le PDF à Claude et retourne les données extraites.
    Retourne un dict avec les champs + liste articles.
    """
    client = _get_client()
    model  = os.getenv("CLAUDE_MODEL", "claude-haiku-4-5-20251001")

    # Lire le PDF en base64
    pdf_bytes = Path(pdf_path).read_bytes()
    pdf_b64   = base64.standard_b64encode(pdf_bytes).decode("utf-8")

    try:
        response = client.messages.create(
            model=model,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "document",
                            "source": {
                                "type": "base64",
                                "media_type": "application/pdf",
                                "data": pdf_b64,
                            },
                        },
                        {"type": "text", "text": USER_PROMPT},
                    ],
                }
            ],
        )

        raw_text = response.content[0].text.strip()

        # Nettoyer les balises markdown si Claude en met quand même
        raw_text = re.sub(r"^```json\s*", "", raw_text)
        raw_text = re.sub(r"\s*```$",    "", raw_text)

        data = json.loads(raw_text)
        data["source"] = "claude"
        return data

    except json.JSONDecodeError as e:
        print(f"[AI_ATTACHEMENT] JSON parse error: {e}\nRaw: {raw_text[:500]}")
        return {"source": "error", "error": str(e)}
    except Exception as e:
        print(f"[AI_ATTACHEMENT] Erreur Claude: {e}")
        return {"source": "error", "error": str(e)}


def normalize_date(date_str: Optional[str]) -> Optional[str]:
    """Normalise une date en DD/MM/YYYY si possible."""
    if not date_str:
        return None
    date_str = str(date_str).strip()
    # Déjà au bon format
    if re.match(r"^\d{2}/\d{2}/\d{4}$", date_str):
        return date_str
    # Format YYYY-MM-DD → DD/MM/YYYY
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", date_str)
    if m:
        return f"{m.group(3)}/{m.group(2)}/{m.group(1)}"
    return date_str
