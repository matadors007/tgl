@echo off
chcp 65001 >nul
REM ============================================================
REM  Tunisia Golden League - Test de securite automatique (essai local)
REM  Prerequis : lancer-local.bat lance, avec les donnees de demonstration (choix 2).
REM  Le test essaie de contourner les protections comme un pirate ; chaque ligne doit etre "OK".
REM ============================================================
cd /d "%~dp0"
podman compose -f deploy\docker-compose.local.yml exec -T api node test/securite.mjs http://web:80
echo.
pause
