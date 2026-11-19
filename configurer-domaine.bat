@echo off
chcp 65001 >nul
REM Tunisia Golden League - Relie l'application mobile au serveur (a faire avant de compiler l'APK / l'AAB / iOS)
cd /d "%~dp0"
set /p DOMAIN=Nom de domaine du serveur (ex. tunisiagoldenleague.tn) : 
call node scripts/set-domain.mjs %DOMAIN% || goto :error
pause
exit /b 0
:error
echo Une erreur est survenue. Copie le message ci-dessus et envoie-le moi.
pause
exit /b 1
