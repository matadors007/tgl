@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
REM Tunisia Golden League - Outils d'administration du serveur
cd /d "%~dp0"
if not exist "deploy\serveur.txt" (
  echo [ERREUR] Lancez d'abord envoyer-sur-serveur.bat
  pause
  exit /b 1
)
for /f "usebackq tokens=1,2 delims=;" %%a in ("deploy\serveur.txt") do (set IP=%%a& set SSHUSER=%%b)
set TARGET=%SSHUSER%@%IP%
set RUN=cd /opt/tgl/deploy ^&^& sudo docker compose exec -T api node src/admin.js
echo.
echo  1. Liste des utilisateurs (enregistree dans utilisateurs.csv)
echo  2. Creer un compte administrateur
echo  3. Obliger un compte a choisir un nouveau mot de passe
echo  4. Voir les demandes de suppression de compte
echo  5. Supprimer les comptes qui l'ont demande
echo  6. Etat du serveur et derniers messages de l'API
echo  7. Telecharger les sauvegardes de la base (dossier sauvegardes)
echo  8. Supprimer les comptes de test (@tga.tn, @demo.tn)
echo  9. Notifications : enregistrer le jeton d'acces Expo
echo.
set /p C=Votre choix : 
if "%C%"=="1" ssh %TARGET% "%RUN% users --csv" > utilisateurs.csv && start "" utilisateurs.csv
if "%C%"=="2" (
  set /p E=E-mail : 
  set /p N=Nom : 
  echo Le mot de passe sera a choisir via "mot de passe oublie" sur le site.
  ssh %TARGET% "%RUN% create-admin !E! $(openssl rand -hex 16) '!N!'"
)
if "%C%"=="3" (
  set /p E=E-mail du compte : 
  echo Un e-mail "nouveau mot de passe" va lui etre envoye a sa prochaine connexion.
  ssh %TARGET% "%RUN% force-reset !E!"
)
if "%C%"=="4" ssh %TARGET% "%RUN% deletion-requests"
if "%C%"=="5" ssh %TARGET% "%RUN% delete-requested --yes"
if "%C%"=="6" ssh %TARGET% "cd /opt/tgl/deploy && sudo docker compose ps && sudo docker compose logs --tail 40 api"
if "%C%"=="7" (
  if not exist sauvegardes mkdir sauvegardes
  scp "%TARGET%:/opt/tgl/deploy/backups/*.sql.gz" sauvegardes\ && echo Sauvegardes copiees dans le dossier sauvegardes.
)
if "%C%"=="8" (
  ssh %TARGET% "%RUN% delete-test-accounts"
  set /p OK=Supprimer definitivement ces comptes ? ^(O/N^) : 
  if /i "!OK!"=="O" ssh %TARGET% "%RUN% delete-test-accounts --yes"
)
if "%C%"=="9" (
  echo Sur https://expo.dev : Account settings ^> Access tokens ^> Create token. Collez-le ici.
  set /p TOK=Jeton Expo : 
  ssh %TARGET% "cd /opt/tgl/deploy && (sudo grep -q '^EXPO_ACCESS_TOKEN=' .env && sudo sed -i 's|^EXPO_ACCESS_TOKEN=.*|EXPO_ACCESS_TOKEN=!TOK!|' .env || echo 'EXPO_ACCESS_TOKEN=!TOK!' | sudo tee -a .env >/dev/null) && sudo docker compose up -d api && echo Jeton enregistre."
  echo Activez ensuite dans le projet Expo : Credentials ^> Enhanced Security for Push Notifications.
)
pause
