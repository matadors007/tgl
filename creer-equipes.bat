@echo off
chcp 65001 >nul
REM ============================================================
REM  Tunisia Golden League - Equipes d'exemple dans les deux championnats
REM  12 entreprises (mixte et +35) : 11 dossiers complets, 1 a completer (Tabarka Agro)
REM  Remplace les equipes, joueurs, pieces et matchs du Championnat mixte et du Championnat +35.
REM  Les autres tournois, les comptes, terrains et reservations sont conserves.
REM ============================================================
cd /d "%~dp0"
if not exist "serviceAccount.json" (
  echo [ERREUR] serviceAccount.json introuvable dans ce dossier.
  pause
  exit /b 1
)
echo ATTENTION : les equipes, joueurs et matchs du Championnat mixte et du Championnat +35 vont etre remplaces.
set /p OK=Tape OUI pour continuer : 
if /I not "%OK%"=="OUI" exit /b 0
call npm install || goto :error
call node scripts/seed-teams.mjs || goto :error
pause
exit /b 0
:error
echo.
echo Une erreur est survenue. Copie le message ci-dessus et envoie-le moi.
pause
exit /b 1
