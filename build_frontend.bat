@echo off
:: ============================================================
:: build_frontend.bat
:: À lancer UNE SEULE FOIS avant le démarrage en production
:: Compile Next.js pour la production (plus rapide que dev)
::
:: C:\projets\portail-dtctq\build_frontend.bat
:: ============================================================

title Build Frontend - Portail DTC/TQ

set FRONTEND=C:\projets\portail-dtctq\frontend

echo.
echo  =============================================
echo    BUILD NEXT.JS - MODE PRODUCTION
echo  =============================================
echo.
echo  Ce build est plus rapide et stable que le
echo  mode developpement (npm run dev).
echo.
echo  Patientez... (peut prendre 1-2 minutes)
echo.

cd /d %FRONTEND%
npm run build

if %errorLevel% equ 0 (
    echo.
    echo  =============================================
    echo   BUILD REUSSI !
    echo  =============================================
    echo.
    echo   Vous pouvez maintenant utiliser start.bat
    echo   qui lancera "npm run start" (mode prod).
    echo.
) else (
    echo.
    echo  ERREUR lors du build !
    echo  Verifiez les erreurs ci-dessus.
    echo.
)
pause
