@echo off
chcp 65001 >nul
REM ============================================================
REM  Tunisia Golden League - Activer les codes OTP par e-mail
REM  A faire UNE SEULE FOIS. Prerequis :
REM   1. Projet Firebase au forfait Blaze (paiement a l'usage, gratuit a ce volume)
REM      Console Firebase > Utilisation et facturation > Modifier le forfait > Blaze
REM   2. Pour Gmail : validation en 2 etapes activee + un "mot de passe d'application"
REM      https://myaccount.google.com/apppasswords
REM ============================================================
cd /d "%~dp0"
if not exist ".env" (
  echo [ERREUR] Fichier .env introuvable : lance d'abord setup-firebase.bat
  pause
  exit /b 1
)
echo Avant de continuer, verifie les 2 prerequis ci-dessus (forfait Blaze + mot de passe d'application).
pause
echo [1/3] Installation des dependances...
call npm install || goto :error
echo.
echo [2/3] Connexion a Firebase (une seule fois)...
echo Adresse du compte Google qui possede le projet Firebase
echo (celui avec lequel tu vois le projet dans https://console.firebase.google.com)
set /p FBEMAIL=Adresse e-mail : 
if "%FBEMAIL%"=="" goto :error
REM Ajoute ce compte s'il n'est pas encore connecte, puis l'utilise par defaut.
REM Les messages "Already signed in" / "Already using" sont normaux : on continue.
call npx -y firebase-tools@latest login:list | findstr /i /c:"%FBEMAIL%" >nul || call npx -y firebase-tools@latest login:add %FBEMAIL%
call npx -y firebase-tools@latest login:use %FBEMAIL% >nul 2>&1
echo Compte Firebase : %FBEMAIL%
echo.
echo [3/3] Configuration de l'adresse d'envoi et deploiement...
call node scripts/setup-otp.mjs || goto :error
pause
exit /b 0
:error
echo.
echo Une erreur est survenue. Copie le message ci-dessus et envoie-le moi.
pause
exit /b 1
