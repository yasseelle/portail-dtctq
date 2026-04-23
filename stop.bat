@echo off
:: ============================================================
:: stop.bat — Arrêt de tous les services Portail DTC/TQ
:: C:\projets\portail-dtctq\stop.bat
:: ============================================================
title Portail DTC/TQ — Arrêt

echo.
echo  Arret des services Portail DTC/TQ...
echo.

:: Ferme les fenêtres CMD par titre
taskkill /fi "WindowTitle eq DTC-Backend*"  /f >nul 2>&1
taskkill /fi "WindowTitle eq DTC-Frontend*" /f >nul 2>&1
taskkill /fi "WindowTitle eq DTC-Devis*"    /f >nul 2>&1
taskkill /fi "WindowTitle eq DTC-Courrier*" /f >nul 2>&1

:: Tuer les processus node et uvicorn si encore actifs
taskkill /im node.exe /f >nul 2>&1
taskkill /im uvicorn.exe /f >nul 2>&1

echo  OK - Tous les services sont arretes.
echo.
timeout /t 2 /nobreak >nul
