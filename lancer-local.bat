@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
REM ============================================================
REM  Tunisia Golden League - Lancer tout le systeme sur ce PC avec Podman Desktop
REM   Site / application web : http://localhost:8080
REM   Base de donnees (Adminer) : http://localhost:8081
REM ============================================================
cd /d "%~dp0"
set COMPOSE=podman compose -f deploy\docker-compose.local.yml
REM ===== Preparation automatique de Podman (installation, WSL, machine, Compose) =====
where podman >nul 2>&1 && goto :haspodman
echo.
echo Podman n'est pas installe : installation...
where winget >nul 2>&1 || (
  echo [ERREUR] winget absent. Installez Podman Desktop depuis https://podman-desktop.io puis relancez.
  pause
  exit /b 1
)
winget install -e --id RedHat.Podman --accept-source-agreements --accept-package-agreements || goto :podmanerr
echo.
echo Podman installe. FERMEZ cette fenetre et relancez lancer-local.bat.
pause
exit /b 0
:haspodman

REM --- WSL (sous-systeme Linux de Windows), necessaire a la machine Podman ---
wsl --status >nul 2>&1 && goto :haswsl
echo.
echo WSL n'est pas active : activation (Windows va demander l'autorisation administrateur)...
powershell -NoProfile -Command "Start-Process wsl -ArgumentList '--install','--no-distribution' -Verb RunAs -Wait"
echo.
echo ============================================================
echo  REDEMARREZ le PC, puis relancez lancer-local.bat.
echo ============================================================
pause
exit /b 0
:haswsl

REM --- Machine Podman : creation si besoin, puis demarrage ---
podman info >nul 2>&1 && goto :machineok
podman machine list --format "{{.Name}}" > "%TEMP%\tgl-machines.txt" 2>nul
for %%A in ("%TEMP%\tgl-machines.txt") do if %%~zA==0 (
  echo.
  echo Creation de la machine Podman ^(quelques minutes, une seule fois^)...
  podman machine init --cpus 2 --memory 4096 || goto :podmanerr
)
echo Demarrage de la machine Podman...
podman machine start 2>nul
set /a N=0
:waitpodman
podman info >nul 2>&1 && goto :machineok
set /a N+=1
if !N! GEQ 20 (
  echo Podman ne repond pas : reparation automatique...
  call "%~dp0reparer-podman.bat" auto && goto :machineok
  goto :podmanerr
)
timeout /t 2 /nobreak >nul
goto :waitpodman
:machineok

REM --- Compose : telecharge automatiquement si absent ---
podman compose version >nul 2>&1 && goto :ready
set DC=%LOCALAPPDATA%\tgl\docker-compose.exe
if not exist "%DC%" (
  echo Telechargement de Compose...
  if not exist "%LOCALAPPDATA%\tgl" mkdir "%LOCALAPPDATA%\tgl"
  curl -fL -o "%DC%" https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-windows-x86_64.exe || goto :podmanerr
)
set PODMAN_COMPOSE_PROVIDER=%DC%
setx PODMAN_COMPOSE_PROVIDER "%DC%" >nul
podman compose version >nul 2>&1 && goto :ready

:podmanerr
echo.
echo [ERREUR] Podman ne repond pas. Details :
podman --version
podman machine list
podman info
echo.
echo Copiez les messages ci-dessus et envoyez-les moi.
pause
exit /b 1
:ready
echo Machine Podman prete.

echo.
echo [1/3] Construction et demarrage des conteneurs (10 a 20 minutes la 1re fois)...
%COMPOSE% up -d --build || goto :error

echo.
echo [2/3] Attente du serveur...
set /a N=0
:wait
curl -sf http://localhost:8080/api/health >nul 2>&1 && goto :up
set /a N+=1
if !N! GEQ 90 (
  echo Le serveur ne repond pas. Derniers messages :
  %COMPOSE% logs --tail 30 api
  goto :error
)
timeout /t 2 /nobreak >nul
goto :wait
:up
echo Serveur pret.

echo.
echo [3/3] Donnees
echo  1. Garder les donnees actuelles (rien a faire)
echo  2. Charger les donnees de demonstration (remplace tout)
if exist "export-firebase.json" echo  3. Charger les vraies donnees de export-firebase.json (remplace tout)
set C=1
set /p C=Votre choix (Entree = 1) : 
if "%C%"=="2" %COMPOSE% exec -T api node src/import.js /dev/stdin --replace --password=Test1234 < deploy\demo-data.json || goto :error
if "%C%"=="3" %COMPOSE% exec -T api node src/import.js /dev/stdin --replace --password=Test1234 < export-firebase.json || goto :error
if not "%C%"=="1" (
  echo.
  echo Tous les comptes importes ont le mot de passe : Test1234   ^(essai local uniquement^)
  if "%C%"=="2" echo Comptes : admin@demo.tn  agent@demo.tn  op@demo.tn  company@demo.tn  user@demo.tn
)

start "" http://localhost:8080
start "" http://localhost:8081
echo.
echo ============================================================
echo  Site / application web : http://localhost:8080
echo  Base de donnees (Adminer) : http://localhost:8081
echo     Systeme PostgreSQL - Serveur db - Utilisateur tgl - Mot de passe tgl_local - Base tgl
echo  Journaux de l'API (codes d'activation, liens mot de passe oublie) : journaux-local.bat
echo  Arreter : arreter-local.bat
echo  Podman Desktop : onglet Containers ^> groupe tgl-local
echo ============================================================
pause
exit /b 0
:error
echo.
echo Une erreur est survenue. Copie le message ci-dessus et envoie-le moi.
pause
exit /b 1
