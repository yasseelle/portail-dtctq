@echo off
:: ============================================================
:: start.bat — Portail DTC/TQ — Lancement complet
:: C:\projets\portail-dtctq\start.bat
:: ============================================================
title Portail DTC/TQ — Démarrage

set PYTHON=C:\Users\jabbari\AppData\Local\Python\bin\python.exe
set PROJECT=C:\projets\portail-dtctq
set BACKEND=%PROJECT%\backend
set FRONTEND=%PROJECT%\frontend

echo.
echo  =============================================
echo    PORTAIL DTC/TQ  ^|  ONEE  ^|  DEMARRAGE
echo  =============================================
echo.

:: ── Backend FastAPI ──────────────────────────────────────────
echo [1/2] Backend FastAPI sur le port 8000...
start "DTC-Backend" cmd /k "title DTC-Backend && cd /d %BACKEND% && %PYTHON% -m uvicorn main:app --host 0.0.0.0 --port 8000"
timeout /t 4 /nobreak >nul

:: ── Frontend Next.js ─────────────────────────────────────────
echo [2/2] Frontend Next.js sur le port 3000...
start "DTC-Frontend" cmd /k "title DTC-Frontend && cd /d %FRONTEND% && npm run dev -- --hostname 0.0.0.0"
timeout /t 3 /nobreak >nul



echo.
echo  ============================================
echo   OK - Tous les services sont demarres !
echo  ============================================
echo.
echo   Backend  : http://10.23.23.144:8000
echo   Frontend : http://10.23.23.144:3000
echo   API Docs : http://10.23.23.144:8000/docs
echo.
pause
