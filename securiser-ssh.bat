@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
REM ============================================================
REM  Tunisia Golden League - Connexion au serveur par CLE SSH (au lieu du mot de passe)
REM  1. cree une cle sur ce PC   2. l'installe sur le serveur   3. verifie qu'elle marche
REM  4. (sur confirmation) interdit la connexion par mot de passe : les robots ne peuvent plus essayer.
REM  IMPORTANT : gardez une copie du dossier %USERPROFILE%\.ssh (cle USB...). En cas de perte du PC,
REM  la console KVM de l'espace client OVH permet toujours de reprendre la main.
REM ============================================================
cd /d "%~dp0"
if not exist "deploy\serveur.txt" (
  echo [ERREUR] Lancez d'abord envoyer-sur-serveur.bat
  pause
  exit /b 1
)
for /f "usebackq tokens=1,2 delims=;" %%a in ("deploy\serveur.txt") do (set IP=%%a& set SSHUSER=%%b)
set TARGET=%SSHUSER%@%IP%
set KEY=%USERPROFILE%\.ssh\tgl_vps
if not exist "%USERPROFILE%\.ssh" mkdir "%USERPROFILE%\.ssh"

echo.
echo [1/4] Cle SSH de ce PC...
if exist "%KEY%" (echo Cle deja presente : %KEY%) else (ssh-keygen -t ed25519 -f "%KEY%" -N "" -C "tgl-vps" || goto :error)

echo.
echo [2/4] Installation de la cle sur le serveur (mot de passe du serveur demande une derniere fois)...
type "%KEY%.pub" | ssh %TARGET% "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && sort -u -o ~/.ssh/authorized_keys ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys" || goto :error

echo.
echo [3/4] Verification de la connexion par cle...
ssh -i "%KEY%" -o BatchMode=yes -o PasswordAuthentication=no %TARGET% "echo Connexion par cle : OK" || (
  echo [ERREUR] La cle ne fonctionne pas : la connexion par mot de passe reste active. Envoyez-moi ce message.
  pause
  exit /b 1
)
REM Les autres outils (envoyer-sur-serveur, admin-serveur...) utiliseront la cle automatiquement
findstr /c:"Host %IP%" "%USERPROFILE%\.ssh\config" >nul 2>&1 || (
  >> "%USERPROFILE%\.ssh\config" echo.
  >> "%USERPROFILE%\.ssh\config" echo Host %IP%
  >> "%USERPROFILE%\.ssh\config" echo   User %SSHUSER%
  >> "%USERPROFILE%\.ssh\config" echo   IdentityFile ~/.ssh/tgl_vps
)

echo.
echo [4/4] Interdire la connexion par mot de passe au serveur ?
echo      (recommande : seul ce PC, avec sa cle, pourra se connecter)
set /p OK=Confirmer (O/N) : 
if /i not "%OK%"=="O" (
  echo Rien de change : la connexion par mot de passe reste possible.
  pause
  exit /b 0
)
ssh -i "%KEY%" %TARGET% "printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' | sudo tee /etc/ssh/sshd_config.d/00-tgl.conf >/dev/null && sudo sshd -t && (sudo systemctl reload ssh || sudo systemctl reload sshd) && sudo sshd -T | grep -i '^passwordauthentication'" || goto :error
echo.
echo ============================================================
echo  Termine : "passwordauthentication no" ci-dessus = mot de passe refuse, cle obligatoire.
echo  Sauvegardez le dossier %USERPROFILE%\.ssh sur une cle USB.
echo ============================================================
pause
exit /b 0
:error
echo.
echo Une erreur est survenue. Copie le message ci-dessus et envoie-le moi.
pause
exit /b 1
