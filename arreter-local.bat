@echo off
chcp 65001 >nul
REM Tunisia Golden League - Arreter les conteneurs locaux (Podman)
cd /d "%~dp0"
echo  1. Arreter (les donnees sont gardees)
echo  2. Arreter et EFFACER la base locale
set C=1
set /p C=Votre choix (Entree = 1) : 
if "%C%"=="2" (podman compose -f deploy\docker-compose.local.yml down -v) else (podman compose -f deploy\docker-compose.local.yml down)
pause
