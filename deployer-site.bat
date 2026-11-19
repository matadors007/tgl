@echo off
chcp 65001 >nul
REM ============================================================
REM  Tunisia Golden League - Publier le site web (Firebase Hosting, gratuit)
REM  Adresse : https://<ton-projet>.web.app  (meme application que sur le telephone)
REM  La premiere fois, une fenetre du navigateur s'ouvre pour te connecter a Google.
REM ============================================================
cd /d "%~dp0"
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
echo [3/3] Construction et publication du site...
call node scripts/deploy-site.mjs || goto :error
pause
exit /b 0
:error
echo.
echo Une erreur est survenue. Copie le message ci-dessus et envoie-le moi.
pause
exit /b 1
