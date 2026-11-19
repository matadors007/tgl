@echo off
chcp 65001 >nul
REM ============================================================
REM  Tunisia Golden League - Activer les notifications push (Android)
REM  A faire UNE SEULE FOIS, puis regenerer l'APK (generer-apk.bat).
REM  Prerequis : serviceAccount.json dans ce dossier + un compte gratuit expo.dev
REM ============================================================
cd /d "%~dp0"
set EAS_NO_VCS=1
if not exist "serviceAccount.json" (
  echo [ERREUR] serviceAccount.json introuvable dans ce dossier.
  pause
  exit /b 1
)

echo.
echo [1/4] Installation des dependances...
call npm install || goto :error

echo.
echo [2/4] Regles de securite + google-services.json...
call node scripts/setup-firebase.mjs --notifications-only || goto :error

echo.
echo [3/4] Liaison du projet a ton compte Expo (identifiant de projet)...
call npx -y eas-cli@latest login || goto :error
call npx -y eas-cli@latest init || goto :error

echo.
echo [4/4] Cle d'envoi des notifications Android (FCM V1)
echo ------------------------------------------------------------
echo  Dans le menu qui va s'ouvrir, choisis dans l'ordre :
echo    1. Android
echo    2. production  (ou n'importe quel profil propose)
echo    3. Google Service Account
echo    4. Manage your Google Service Account Key for Push Notifications (FCM V1)
echo    5. Set up a Google Service Account Key for Push Notifications (FCM V1)
echo    6. Upload a new service account key
echo    7. Chemin du fichier : serviceAccount.json
echo  Puis quitte le menu (Go back / Exit).
echo ------------------------------------------------------------
pause
call npx -y eas-cli@latest credentials -p android
if errorlevel 1 goto :error

echo.
echo ============================================================
echo  Termine ! Regenere maintenant l'APK avec generer-apk.bat
echo  puis installe-le : l'app demandera l'autorisation d'envoyer des notifications.
echo ============================================================
pause
exit /b 0

:error
echo.
echo Une erreur est survenue. Copie le message ci-dessus et envoie-le moi.
pause
exit /b 1
