# 📋 Portail DTC/TQ — Journal de Développement
> **Projet :** Portail interne de gestion — Division Technique Centre, ONEE  
> **Développeur :** JABBARI ILYASS (Matricule: 84488R) — Super Admin  
> **Stack :** Next.js 14 + FastAPI + SQLite  
> **Serveur :** `http://10.23.23.144:3000` (frontend) · `http://10.23.23.144:8000` (backend)  
> **Session :** Avril 2026

---

## 🏗️ Architecture

```
C:\projets\portail-dtctq\
├── frontend\                  # Next.js 14 + TypeScript + Tailwind
│   └── app\
│       ├── page.tsx           # Login (sans sidebar)
│       ├── layout.tsx         # Root layout (fonts + globals.css)
│       ├── globals.css        # Design system light/dark
│       └── (app)\             # Route Group — sidebar partagée
│           ├── layout.tsx     # Sidebar + notifications + thème
│           ├── dashboard\
│           ├── courrier\
│           ├── hr\
│           ├── profile\
│           ├── admin\
│           ├── vehicules\
│           ├── pdf-tools\
│           ├── devis\
│           └── projets\
└── backend\                   # FastAPI + SQLite
    ├── main.py
    ├── models.py
    ├── portail.db
    └── routers\
        ├── hr.py
        ├── courrier.py
        ├── admin.py
        ├── notifications.py
        ├── vehicules.py
        ├── pdf_tools.py
        ├── devis.py
        └── projets.py
```

---

## ✅ Modules Complétés

### 🔐 1. Authentification
- JWT 8h, rôles `admin` / `agent`
- `SUPER_ADMIN_MATRICULE = "84488R"` — intouchable
- Login page redesignée : split screen branding + formulaire
- Show/hide password, focus coloré, toggle thème ☀️/🌙

---

### 📊 2. Dashboard
- KPIs temps réel depuis `/stats/dashboard`
- Auto-refresh 60s + bouton actualiser
- Skeleton loading animé pendant chargement
- Charts : BarChart mensuel, PieChart répartition, AreaChart 30 jours
- Indicateur live pulsant
- Quick access : 6 apps RH + 3 apps Courrier

---

### 📬 3. Gestion du Courrier
**3 onglets :** Arrivée · Bordereau d'Envoi · Départ/Réception

**Fonctionnalités :**
- Recherche full-text + filtre par mois
- Aperçu PDF inline (dominant quand actif : `1fr 1fr`)
- Téléchargement PDF
- Auto-sync Excel→DB toutes les 30s
- Tri par colonne (date, expéditeur, objet) avec ▲/▼

**Nouveau : Groupement par année**
- Plus de pagination
- Toutes les données chargées en batches de 100
- Chaque année = une table séparée avec header sticky
- Pills de navigation rapide (2026, 2025...)
- Collapse/expand par année
- Barre de progression de chargement

**Fix tri :**
```python
# Tri SQL correct sur dates DD/MM/YYYY
def _date_sort_expr(date_col):
    return func.substr(date_col,7,4) + func.substr(date_col,4,2) + func.substr(date_col,1,2)
```

---

### 📄 4. Documents RH
**6 formulaires :** PE · Sortie · Reprise · Maladie · Fin Manquant · RC

**Fonctionnalités :**
- DOCX→PDF via Word COM, streamé au navigateur, zéro stockage
- **Date de création manuelle** sur TOUS les formulaires (calendrier)
  - Par défaut = aujourd'hui, modifiable librement
  - Injectée dans le PDF via `parse_date_creation()`
  - Remplace `date.today()` dans le backend
- Historique avec régénération

**Fix backend hr.py :**
```python
def parse_date_creation(date_creation: Optional[str]) -> str:
    if date_creation:
        try: return date.fromisoformat(date_creation).strftime("%d/%m/%Y")
        except: pass
    return date.today().strftime("%d/%m/%Y")
```

---

### 🔔 5. Notifications
**3 niveaux :** 🔴 Urgent · 🟡 À faire · 🟢 Information

**Pour les agents :**
- Cloche 🔔 dans la topbar avec badge rouge animé
- Panel dropdown avec liste des notifications
- Bouton "✓ Marquer lu" par notification
- Bouton "✓ Tout lire"

**Pour les admins :**
- Bouton "➕ Créer" dans le panel
- Ciblage : tous les agents OU agents spécifiques (checkboxes)
- Bouton 🗑️ supprimer

**Tables DB :** `notifications` + `notification_reads`

---

### 👑 6. Panel Admin
- 3 onglets : Overview · Agents · Historique
- Super admin protégé : `check_target_protection()` bloque modification de 84488R
- Gestion complète des agents

---

### 🚗 7. Parc Véhicules
**7 colonnes :** N° · Matricule · Modèle · Service · Dernière visite · Prochaine visite · Documents

**Alertes visite technique :**
- 🔴 Expirée · 🟡 ≤30 jours · 🟢 Valide

**Documents par véhicule (5 types) :**
- Carte grise · Visite technique · Assurance · Vignette · Autre
- Upload/download/delete
- Panel expandable en cliquant sur une ligne

**Stockage :** `C:\projets\portail-dtctq\backend\vehicules_docs\`

**Fix clé :** `React.Fragment key={v.id}` au lieu de `<>` (bug key prop)

---

### 🛠️ 8. Outils PDF
**4 outils (zéro stockage, zéro historique) :**
- 🗜️ **Compresser** : 3 niveaux (max/équilibré/léger), stats avant/après
- 🔗 **Fusionner** : jusqu'à 20 PDFs, réorganisation ▲▼
- ✂️ **Diviser** : chaque page / pages précises / plage
- 🗑️ **Supprimer pages** : sélection graphique (clic = rouge ✕)

**Aperçu visuel :** PyMuPDF (fitz) rend toutes les pages en thumbnails base64

```bash
pip install pymupdf pikepdf pypdf
```

---

### 📋 9. Registre Devis

**OCR Automation (`C:\devis\devis_automation.py`) :**
```
Claude AI EN PREMIER → si échec → Tesseract fallback
```

**Extraction Claude :** référence · destinataire · objet · montant TTC · date

**Colonne H Excel :** source = `claude` 🔵 / `tesseract+claude` 🟢 / `tesseract` ⚫

**Fix `has_pdf` dans le router :**
```python
def _resolve_pdf(pdf_path: str) -> Optional[Path]:
    # 1. Chemin direct
    # 2. Nom fichier dans STORAGE_DIR
    # 3. Case-insensitive
    # 4. Recherche par date YYYYMMDD dans le nom
```

**Script `fix_devis_pdf_links.py` :** relie les PDFs existants aux enregistrements DB par matching de date

---

### 🏗️ 10. Suivi des Projets

**Fonctionnalités :**
- Création manuelle OU automatique par IA
- Timeline par étapes détectées automatiquement
- Analyse IA de l'état d'avancement (Claude)
- Notes et commentaires
- Progression calculée automatiquement

**11 étapes timeline :**
```
📬 Demande initiale → 🤝 Réunion → 📐 Étude technique
→ 📍 Carnet de piquetage → 📦 Approvisionnement
→ ✅ Bon d'exécution → 🔨 Travaux en cours
→ 💰 Devis de réalisation → 📤 Bon de livraison
→ 🏁 Réception travaux → 🎉 Clôture
```

**Scan IA automatique :**
```python
# Utilise les vrais noms de tables DB
# courrier: expediteur, objet, date_courrier, pdf_path
# bordereau: reference, destinataire, objet, pdf_path
# courrier_depart: reference, date_depart, objet, pdf_depart_path
```

---

## 🤖 Intégration Claude AI

### Configuration `.env`
```env
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-haiku-4-5-20251001
OCR_CONFIDENCE_THRESHOLD=0  # 0 = Claude toujours en premier
USE_CLAUDE=true
```

### Module `ai_extractor.py`
Partagé entre tous les scripts automation :
- `extract_devis_with_claude()` — devis ONEE
- `extract_courrier_with_claude()` — courriers arrivée
- `extract_bordereau_with_claude()` — bordereaux
- `hybrid_extract()` — logique Tesseract → Claude

### Scripts mis à jour avec Claude AI
| Script | Destination |
|--------|-------------|
| `devis_automation.py` | `C:\devis\` |
| `courrier_automation.py` | `C:\courrier\` |
| `bordereau_automation.py` | `C:\bordereau_envoi\` |
| `courrier_depart.py` | `C:\courrier_depart_reception\` |

**Coût estimé :** ~0.002$ par PDF (500 documents pour 1$)

---

## 🌙 Design System

**Thème Light/Dark** avec variables CSS :
```css
--bg, --surface, --surface2, --border, --text, --muted
--accent, --green, --danger, --gold, --info
--font-head (Syne), --font-body (DM Sans)
```

**Animations :**
- `anim-fade-up`, `anim-float`, `anim-spin`
- `cubic-bezier(0.16, 1, 0.3, 1)` — fluide et naturel
- Skeleton loading sur tous les composants

**Fix CSS critique :**
```css
/* @import doit être EN PREMIER dans globals.css */
@import url('https://fonts.googleapis.com/...');
@import "tailwindcss";
```

---

## 🔧 Sidebar & Layout

**Route Groups Next.js :**
```
app/page.tsx          → Login (SANS sidebar)
app/(app)/layout.tsx  → Sidebar partagée pour toutes les pages
```

**Navigation :**
```tsx
const NAV_ITEMS = [
  { section:"main", label:"Dashboard",      icon:"⊞",  href:"/dashboard" },
  { section:"main", label:"Courrier Arrivée",icon:"📬", href:"/courrier"  },
  { section:"main", label:"Registre Devis", icon:"📋", href:"/devis"     },
  { section:"main", label:"Suivi Projets",  icon:"🏗️", href:"/projets"   },
  { section:"rh",   label:"Permission (PE)",icon:"🟢", href:"/hr"        },
  // ... 5 autres formulaires RH
  { section:"sys",  label:"Panel Admin",    icon:"👑", href:"/admin", adminOnly:true },
]
```

---

## ⚙️ Démarrage Automatique Windows

### Fichiers
| Fichier | Rôle |
|---------|------|
| `build_frontend.bat` | Build Next.js production (une fois) |
| `start.bat` | Lance backend + frontend + n8n + OCR |
| `stop.bat` | Arrête tous les services |
| `setup_task_scheduler.bat` | Installe démarrage automatique Windows |

### Fix Task Scheduler
**Problème :** scripts OCR ne fonctionnaient pas en tâche planifiée

**Cause :** mode "Exécuter sans connexion utilisateur" + chemins relatifs

**Fix `run_devis_ocr.bat` :**
```bat
set PYTHON=C:\Users\jabbari\AppData\Local\Python\bin\python.exe
set SCRIPT=C:\devis\devis_automation.py
"%PYTHON%" "%SCRIPT%" >> "%LOG%" 2>&1
```
Avec `/ru jabbari /it` dans Task Scheduler → s'exécute dans la session utilisateur.

---

## 🔗 n8n Automation

**Installation :**
```powershell
npm install -g n8n
```

**5 workflows configurés :**
| # | Workflow | Déclencheur |
|---|----------|-------------|
| 1 | 🚗 Alertes visites véhicules | Chaque matin 8h |
| 2 | 📊 Rapport hebdo direction | Vendredi 17h |
| 3 | 🤖 Analyse IA des devis | Toutes les heures |
| 4 | 💬 Chatbot interne | Webhook instantané |
| 5 | 🔄 Sync Excel→DB auto | Toutes les 30min |

**Accès :** `http://10.23.23.144:5678`

---

## 🐛 Bugs Corrigés

| Bug | Cause | Fix |
|-----|-------|-----|
| `@import` CSS parsing error | `@import` pas en première ligne | Déplacer avant `@import "tailwindcss"` |
| Module not found `globals.css` | `root_layout.tsx` copié dans `dashboard/` | Copier dans `app/layout.tsx` |
| Key prop error véhicules | `<>` fragment sans key | `<React.Fragment key={v.id}>` |
| Runtime error déconnexion | Même cause key prop | Même fix |
| `has_pdf` toujours false | `pdf_path` vide en DB | Script `fix_devis_pdf_links.py` |
| Scan IA retourne 0 liens | `models.Courrier` inexistant | `__tablename__ == "courrier"` |
| Tri dates incohérent entre pages | Tri frontend sur 20 items/page | Tri SQL `substr(date,7,4)+substr(date,4,2)+substr(date,1,2)` |
| Reset page 1 au scroll | `page` dans dépendances `useCallback` | Supprimer pagination → charger tout |
| Claude non utilisé (score=0) | `.env` non relu correctement | Réécrire sans seuil, Claude toujours en premier |
| `production build` manquant | `npm run start` sans build | `npm run build` avant ou utiliser `npm run dev` |

---

## 📊 État Final du Portail

```
Portail DTC/TQ v3.0
├── 🔐 Auth JWT
├── 📊 Dashboard temps réel
├── 📬 Courrier (Arrivée + Bordereau + Départ) — groupé par année
├── 📄 Documents RH (6 formulaires + date création manuelle)
├── 📋 Registre Devis (OCR Claude AI)
├── 🔔 Notifications intelligentes (3 niveaux)
├── 👑 Panel Admin
├── 🚗 Parc Véhicules + documents
├── 🛠️ Outils PDF (compress/merge/split/delete)
├── 🏗️ Suivi Projets (Timeline IA + Analyse Claude)
├── 🤖 n8n — 5 automatisations
└── 🌙 Design Light/Dark complet
```

---

## 📁 Dossiers Automation

```
C:\courrier\                     scan_inbox · storage · texts · logs
C:\bordereau_envoi\              scan_inbox · storage · texts · errors
C:\courrier_depart_reception\    scan_inbox · depart_storage · reception_storage
C:\devis\                        scan_inbox · storage · texts · logs · errors
C:\projets\portail-dtctq\        .env (clé Anthropic)
```

---

## 🔑 Informations Importantes

- **Super Admin :** matricule `84488R` (JABBARI ILYASS) — hardcodé dans `admin.py`, `projets.py`
- **DB :** `backend/portail.db` — SQLite, auto-créée au démarrage
- **Tables DB :** `users`, `documents_rh`, `courrier`, `bordereau`, `courrier_depart`, `notifications`, `notification_reads`, `vehicules`, `vehicule_documents`, `devis`, `projets`, `projet_documents`, `projet_notes`
- **Python :** `C:\Users\jabbari\AppData\Local\Python\bin\python.exe`
- **Coût Claude AI :** ~0.002$ par document PDF analysé

---

*Document généré automatiquement — Session de développement Portail DTC/TQ*
