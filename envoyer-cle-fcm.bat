@echo off
chcp 65001 >nul
REM ============================================================
REM  Tunisia Golden League - Envoyer la cle FCM V1 a Expo (notifications Android)
REM ============================================================
cd /d "%~dp0"
REM Le projet n'est pas un depot git : on le dit a EAS
set EAS_NO_VCS=1
echo ------------------------------------------------------------
echo  Dans le menu, choisis dans l'ordre :
echo    1. Android
echo    2. production
echo    3. Google Service Account
echo    4. Manage your Google Service Account Key for Push Notifications (FCM V1)
echo    5. Set up a Google Service Account Key for Push Notifications (FCM V1)
echo    6. Upload a new service account key
echo    7. Chemin du fichier : serviceAccount.json
echo  Puis "Go back" / "Exit" pour quitter.
echo ------------------------------------------------------------
pause
call npx -y eas-cli@latest credentials -p android
if errorlevel 1 goto :error
echo.
echo ============================================================
echo  Cle envoyee. Regenere maintenant l'APK avec generer-apk.bat
echo ============================================================
pause
exit /b 0
:error
echo.
echo Une erreur est survenue. Copie le message ci-dessus et envoie-le moi.
pause
exit /b 1
