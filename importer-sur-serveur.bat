@echo off
chcp 65001 >nul
REM ============================================================
REM  Tunisia Golden League - Copie export-firebase.json sur le serveur et l'importe dans la base
REM  A faire UNE fois, apres envoyer-sur-serveur.bat. Remplace les donnees du serveur.
REM ============================================================
cd /d "%~dp0"
if not exist "export-firebase.json" (
  echo [ERREUR] export-firebase.json introuvable : lancez d'abord exporter-firebase.bat
  pause
  exit /b 1
)
if not exist "deploy\serveur.txt" (
  echo [ERREUR] Lancez d'abord envoyer-sur-serveur.bat
  pause
  exit /b 1
)
for /f "usebackq tokens=1,2 delims=;" %%a in ("deploy\serveur.txt") do (set IP=%%a& set SSHUSER=%%b)
set TARGET=%SSHUSER%@%IP%
echo ATTENTION : les donnees actuelles du serveur seront remplacees par celles de Firebase.
set /p OK=Continuer ? (O/N) : 
if /i not "%OK%"=="O" exit /b 0
scp export-firebase.json %TARGET%:/tmp/export-firebase.json || goto :error
ssh -t %TARGET% "cd /opt/tgl/deploy && sudo docker compose run --rm -v /tmp/export-firebase.json:/data/export.json:ro api node src/import.js /data/export.json --replace; rm -f /tmp/export-firebase.json" || goto :error
echo.
echo Import termine. Supprimez export-firebase.json de ce PC (donnees personnelles).
pause
exit /b 0
:error
echo.
echo Une erreur est survenue. Copie le message ci-dessus et envoie-le moi (sans aucun mot de passe).
pause
exit /b 1
