@echo off
chcp 65001 >nul
REM Tunisia Golden League - Export de toutes les donnees Firebase (lecture seule) vers export-firebase.json
cd /d "%~dp0"
if not exist "serviceAccount.json" (
  echo [ERREUR] serviceAccount.json introuvable dans ce dossier.
  pause
  exit /b 1
)
if not exist "node_modules\firebase-admin" call npm install
call node scripts/export-firebase.mjs || goto :error
pause
exit /b 0
:error
echo.
echo Une erreur est survenue. Copie le message ci-dessus et envoie-le moi.
pause
exit /b 1
