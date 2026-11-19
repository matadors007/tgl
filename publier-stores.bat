@echo off
chcp 65001 >nul
REM ============================================================
REM  Tunisia Golden League - Compilation pour les stores (EAS Build, dans le cloud Expo)
REM   Android : fichier .aab pour Google Play     iOS : pour l'App Store (compte Apple valide requis)
REM ============================================================
cd /d "%~dp0"
findstr /c:"EXPO_PUBLIC_API_URL" eas.json >nul || (
  echo [ERREUR] Lancez d'abord configurer-domaine.bat
  pause
  exit /b 1
)
echo  1. Android - Google Play (.aab)
echo  2. iOS - App Store
echo  3. Android - APK de test (installation directe sur un telephone)
set /p C=Votre choix : 
call npm install || goto :error
call npx -y eas-cli@latest login || goto :error
if "%C%"=="1" call npx -y eas-cli@latest build --platform android --profile production || goto :error
if "%C%"=="2" (
  call npx -y eas-cli@latest build --platform ios --profile production || goto :error
  call npx -y eas-cli@latest submit --platform ios --latest || goto :error
)
if "%C%"=="3" call npx -y eas-cli@latest build --platform android --profile preview || goto :error
echo.
echo Termine ! Le lien du fichier est affiche ci-dessus (et sur https://expo.dev, rubrique Builds).
pause
exit /b 0
:error
echo.
echo Une erreur est survenue. Copie le message ci-dessus et envoie-le moi.
pause
exit /b 1
