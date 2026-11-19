@echo off
chcp 65001 >nul
REM ============================================================
REM  Tunisia Golden League - Mise a jour apres une nouvelle version
REM  Deploie les regles de securite et met a jour les donnees existantes
REM  (rien n'est efface). Prerequis : serviceAccount.json dans ce dossier.
REM ============================================================
cd /d "%~dp0"
if not exist "serviceAccount.json" (
  echo [ERREUR] serviceAccount.json introuvable dans ce dossier.
  pause
  exit /b 1
)
echo [1/2] Installation des dependances...
call npm install || goto :error
echo.
echo [2/2] Regles de securite + mise a jour des donnees...
call node scripts/setup-firebase.mjs --update || goto :error
echo.
echo Termine. Regenere l'APK avec generer-apk.bat pour avoir la nouvelle version sur le telephone.
pause
exit /b 0
:error
echo.
echo Une erreur est survenue. Copie le message ci-dessus et envoie-le moi.
pause
exit /b 1
