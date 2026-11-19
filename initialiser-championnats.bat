@echo off
chcp 65001 >nul
REM ============================================================
REM  Tunisia Golden League - Repartir de zero avec deux championnats
REM  « Championnat mixte » et « Championnat +35 » (vides, inscriptions ouvertes)
REM  Supprime tous les championnats existants (equipes, joueurs, pieces, matchs, resultats).
REM  Les comptes, terrains, reservations et parametres sont conserves.
REM ============================================================
cd /d "%~dp0"
if not exist "serviceAccount.json" (
  echo [ERREUR] serviceAccount.json introuvable dans ce dossier.
  pause
  exit /b 1
)
echo ATTENTION : tous les championnats actuels vont etre supprimes (equipes, joueurs, matchs, resultats).
set /p OK=Tape OUI pour continuer : 
if /I not "%OK%"=="OUI" exit /b 0
call npm install || goto :error
call node scripts/init-championships.mjs || goto :error
pause
exit /b 0
:error
echo.
echo Une erreur est survenue. Copie le message ci-dessus et envoie-le moi.
pause
exit /b 1
