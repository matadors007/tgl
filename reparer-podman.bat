@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
REM ============================================================
REM  Tunisia Golden League - Reparer la connexion a Podman
REM  (erreur "unable to connect to Podman socket ... dead network")
REM ============================================================
echo.
echo Connexions actuelles :
podman system connection list
echo.
echo [1/3] Arret de la machine Podman et de WSL...
podman machine stop >nul 2>&1
wsl --shutdown
timeout /t 3 /nobreak >nul

echo [2/3] Passage en mode administrateur (rootful) et redemarrage...
podman machine set --rootful
podman machine start
podman system connection default podman-machine-default-root >nul 2>&1
call :check && goto :ok

echo.
echo [3/3] La connexion ne marche toujours pas : recreation de la machine Podman
echo (elle est vide pour l'instant, rien n'est perdu)...
podman machine stop >nul 2>&1
podman machine rm -f podman-machine-default
wsl --shutdown
timeout /t 3 /nobreak >nul
podman machine init --rootful --cpus 4 --memory 6144 --now
podman system connection default podman-machine-default-root >nul 2>&1
call :check && goto :ok

echo.
echo [ERREUR] Podman ne repond toujours pas. Details :
podman system connection list
podman info
echo Copiez les messages ci-dessus et envoyez-les moi.
if not "%1"=="auto" pause
exit /b 1

:ok
echo.
echo Podman fonctionne.
if not "%1"=="auto" pause
exit /b 0

:check
set /a N=0
:loop
podman info >nul 2>&1 && exit /b 0
set /a N+=1
if !N! GEQ 20 exit /b 1
timeout /t 2 /nobreak >nul
goto :loop
