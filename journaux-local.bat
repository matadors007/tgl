@echo off
chcp 65001 >nul
REM Tunisia Golden League - Messages de l'API locale en direct (Ctrl+C pour quitter)
REM Sans e-mail configure, les codes d'activation et liens "mot de passe oublie" s'affichent ici.
cd /d "%~dp0"
podman compose -f deploy\docker-compose.local.yml logs -f --tail 50 api
