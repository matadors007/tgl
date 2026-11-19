@echo off
chcp 65001 >nul
REM Tunisia Golden League - Demandes de suppression de compte
cd /d "%~dp0"
if not exist "serviceAccount.json" (
  echo [ERREUR] serviceAccount.json introuvable dans ce dossier.
  pause
  exit /b 1
)
if not exist "node_modules\firebase-admin" call npm install
call node scripts/delete-accounts.mjs || goto :error
echo.
echo Pour SUPPRIMER DEFINITIVEMENT ces comptes, tape OUI (sinon ferme la fenetre).
set /p OK=Reponse : 
if /I not "%OK%"=="OUI" exit /b 0
call node scripts/delete-accounts.mjs --delete || goto :error
pause
exit /b 0
:error
echo.
echo Une erreur est survenue. Copie le message ci-dessus et envoie-le moi.
pause
exit /b 1
