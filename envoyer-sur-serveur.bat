@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
REM ============================================================
REM  Tunisia Golden League - Envoyer l'application sur le serveur (VPS) et la (re)demarrer
REM  1re fois : installe Docker, cree la configuration, demarre site + API + base.
REM  Ensuite : a relancer apres chaque modification de l'application.
REM  Le mot de passe du serveur (recu d'OVH) est demande par Windows : tapez-le vous-meme.
REM ============================================================
cd /d "%~dp0"
set CFG=deploy\serveur.txt
if exist "%CFG%" (
  for /f "usebackq tokens=1,2,3,4 delims=;" %%a in ("%CFG%") do (set IP=%%a& set SSHUSER=%%b& set DOMAIN=%%c& set MAIL=%%d)
) else (
  echo.
  set /p IP=Adresse IP du serveur OVH ^(ex. 51.75.12.34^) : 
  set /p SSHUSER=Utilisateur SSH ^(Entree = ubuntu^) : 
  if "!SSHUSER!"=="" set SSHUSER=ubuntu
  set /p DOMAIN=Nom de domaine du site ^(ex. tunisiagoldenleague.tn^) : 
  set /p MAIL=Adresse Gmail qui envoie les e-mails de l'application : 
  > "%CFG%" echo !IP!;!SSHUSER!;!DOMAIN!;!MAIL!
)
set TARGET=%SSHUSER%@%IP%
echo.
echo Serveur : %TARGET%   Site : https://%DOMAIN%
echo.
echo [1/3] Preparation de l'archive...
set ARCH=%TEMP%\tgl-app.tgz
if exist "%ARCH%" del "%ARCH%"
tar -czf "%ARCH%" --exclude=node_modules --exclude=dist --exclude=.expo --exclude=android --exclude=ios --exclude=.git ^
  --exclude=serviceAccount.json --exclude=export-firebase.json --exclude=utilisateurs.csv --exclude=.env ^
  --exclude=backups --exclude=sauvegardes --exclude=_a_supprimer --exclude=seed-data --exclude=serveur.txt --exclude=*.jks --exclude=*.apk --exclude=*.aab . || goto :error

echo [2/3] Envoi vers le serveur (mot de passe du serveur demande)...
scp "%ARCH%" %TARGET%:/tmp/tgl-app.tgz || goto :error

echo [3/3] Installation et demarrage (mot de passe demande ; 5 a 15 minutes la 1re fois)...
ssh -t %TARGET% "sudo mkdir -p /opt/tgl && sudo tar -xzf /tmp/tgl-app.tgz -C /opt/tgl && rm /tmp/tgl-app.tgz && sudo bash /opt/tgl/deploy/setup-env.sh %DOMAIN% %MAIL% %MAIL% && (sudo grep -q '^SMTP_PASS=$' /opt/tgl/deploy/.env && echo && echo '>>> Collez le MOT DE PASSE D APPLICATION Gmail apres SMTP_PASS= puis Ctrl+O, Entree, Ctrl+X' && sleep 4 && sudo nano /opt/tgl/deploy/.env || true) && sudo bash /opt/tgl/deploy/deploy.sh" || goto :error
del "%ARCH%"
echo.
echo ============================================================
echo  Termine ! Site : https://%DOMAIN%
echo  (le certificat HTTPS peut prendre 1 a 2 minutes la 1re fois)
echo ============================================================
pause
exit /b 0
:error
echo.
echo Une erreur est survenue. Copie le message ci-dessus et envoie-le moi (sans aucun mot de passe).
pause
exit /b 1
