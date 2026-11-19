@echo off
chcp 65001 >nul
REM ============================================================
REM  Tunisia Golden League - Generer l'APK Android avec EAS Build (compilation dans le cloud Expo)
REM  Prerequis : Node.js installe + un compte gratuit sur https://expo.dev/signup
REM  Double-clique sur ce fichier, puis reponds "Y" (oui) aux questions.
REM ============================================================
cd /d "%~dp0"

echo.
echo [1/4] Installation des dependances...
call npm install || goto :error

echo.
echo [2/4] Connexion a ton compte Expo...
call npx -y eas-cli@latest login || goto :error

echo.
echo [3/4] Liaison du projet a ton compte (une seule fois)...
call npx -y eas-cli@latest init || goto :error

echo.
echo [4/4] Compilation de l'APK (10 a 20 minutes)...
call npx -y eas-cli@latest build --platform android --profile preview || goto :error

echo.
echo ============================================================
echo  Termine ! Le lien de telechargement de l'APK est affiche ci-dessus
echo  (aussi disponible sur https://expo.dev, rubrique Builds).
echo  Ouvre ce lien sur ton telephone Android pour installer l'app.
echo ============================================================
pause
exit /b 0

:error
echo.
echo Une erreur est survenue. Copie le message ci-dessus et envoie-le moi.
pause
exit /b 1
