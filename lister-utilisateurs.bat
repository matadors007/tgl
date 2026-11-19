@echo off
chcp 65001 >nul
REM Tunisia Golden League - Liste des utilisateurs (lecture seule)
cd /d "%~dp0"
if not exist "serviceAccount.json" (
  echo [ERREUR] serviceAccount.json introuvable dans ce dossier.
  pause
  exit /b 1
)
if not exist "node_modules\firebase-admin" call npm install
call node scripts/list-users.mjs || goto :error
start "" "utilisateurs.csv"
pause
exit /b 0
:error
echo.
echo Une erreur est survenue. Copie le message ci-dessus et envoie-le moi.
pause
exit /b 1
