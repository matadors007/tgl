@echo off
chcp 65001 >nul
REM ============================================================
REM  Tunisia Golden League - Installation Firebase + comptes de test
REM  Prerequis : serviceAccount.json dans ce dossier (voir README, section 2)
REM ============================================================
cd /d "%~dp0"
if not exist "serviceAccount.json" (
  echo [ERREUR] serviceAccount.json introuvable dans ce dossier.
  echo Console Firebase ^> Parametres du projet ^> Comptes de service ^> Generer une nouvelle cle privee
  echo puis enregistre le fichier sous le nom serviceAccount.json ici.
  pause
  exit /b 1
)
echo [1/2] Installation des dependances...
call npm install || goto :error
call npm install --save-dev firebase-admin@13.10.0 @google-cloud/firestore@7.11.6 || goto :error
echo.
echo [2/2] Configuration de Firebase...
call node scripts/setup-firebase.mjs %* || goto :error
pause
exit /b 0
:error
echo.
echo Une erreur est survenue. Copie le message ci-dessus et envoie-le moi.
pause
exit /b 1
