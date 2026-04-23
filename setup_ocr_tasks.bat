@echo off
:: ============================================================
:: setup_ocr_tasks.bat
:: Configure les tâches planifiées OCR correctement
:: Clic droit → "Exécuter en tant qu'administrateur"
:: ============================================================

:: Vérifie droits admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERREUR : Executer en tant qu'Administrateur !
    pause
    exit /b 1
)

set USERNAME_VAL=jabbari
set PYTHON=C:\Users\jabbari\AppData\Local\Python\bin\python.exe

echo.
echo  =============================================
echo    CONFIGURATION TACHES PLANIFIEES OCR
echo  =============================================
echo.

:: ── TÂCHE 1 : Devis OCR — tous les jours à 18h00 ──────────
echo [1/5] Tache Devis OCR...
schtasks /delete /tn "PortailDTC-DevisOCR" /f >nul 2>&1

schtasks /create ^
  /tn "PortailDTC-DevisOCR" ^
  /tr "C:\devis\run_devis_ocr.bat" ^
  /sc DAILY ^
  /st 18:00 ^
  /rl HIGHEST ^
  /ru "%USERNAME_VAL%" ^
  /it ^
  /f

if %errorLevel% equ 0 (echo  OK - Devis OCR 18h00 cree) else (echo  ERREUR Devis OCR)

:: ── TÂCHE 2 : Courrier OCR — tous les jours à 17h30 ───────
echo [2/5] Tache Courrier OCR...
schtasks /delete /tn "PortailDTC-CourrierOCR" /f >nul 2>&1

schtasks /create ^
  /tn "PortailDTC-CourrierOCR" ^
  /tr "C:\courrier\run_courrier_ocr.bat" ^
  /sc DAILY ^
  /st 17:30 ^
  /rl HIGHEST ^
  /ru "%USERNAME_VAL%" ^
  /it ^
  /f

if %errorLevel% equ 0 (echo  OK - Courrier OCR 17h30 cree) else (echo  ERREUR Courrier OCR - fichier bat absent?)

:: ── TÂCHE 3 : bordereau_envoi— au démarrage ──────────────────
echo [3/5] Tache demarrage bordereau_envoi...
schtasks /delete /tn "PortailDTC-bordereau_envoi" /f >nul 2>&1

schtasks /create ^
  /tn "PortailDTC-bordereau_envoiOCR" ^
  /tr "C:\bordereau_envoi\run_bordereau_envoi.bat" ^
  /sc ONLOGON ^
  /rl HIGHEST ^
  /ru "%USERNAME_VAL%" ^
  /delay 0001:00 ^
  /it ^
  /f

if %errorLevel% equ 0 (echo  OK -bordereau_envoiOCR) else (echo  ERREUR Portail bordereau_envoiOCR)

:: ── TÂCHE 4 : Courrier_departOCR — au démarrage ──────────────────
echo [4/5] Tache demarrage Portail...
schtasks /delete /tn "CourrierDEPARTOCR" /f >nul 2>&1

schtasks /create ^
  /tn "PortailDTC-courrier_departOCR" ^
  /tr "C:\courrier_depart_reception\run_DEPART.bat" ^
  /sc ONLOGON ^
  /rl HIGHEST ^
  /ru "%USERNAME_VAL%" ^
  /delay 0001:00 ^
  /it ^
  /f

if %errorLevel% equ 0 (echo  OK - Portail demarrage auto cree) else (echo  ERREUR Portail Startup)


:: ── TÂCHE 5 : Portail DTC — au démarrage ──────────────────
echo [5/5] Tache demarrage Portail...
schtasks /delete /tn "PortailDTC-Startup" /f >nul 2>&1

schtasks /create ^
  /tn "PortailDTC-Startup" ^
  /tr "C:\projets\portail-dtctq\start.bat" ^
  /sc ONLOGON ^
  /rl HIGHEST ^
  /ru "%USERNAME_VAL%" ^
  /delay 0001:00 ^
  /it ^
  /f

if %errorLevel% equ 0 (echo  OK - Portail demarrage auto cree) else (echo  ERREUR Portail Startup)


echo.
echo  =============================================
echo   TOUTES LES TACHES CONFIGUREES !
echo  =============================================
echo.
echo  Pour verifier :
echo    schtasks /query /fo TABLE ^| findstr PortailDTC
echo.
echo  Pour tester manuellement :
echo    schtasks /run /tn "PortailDTC-DevisOCR"
echo.
pause
