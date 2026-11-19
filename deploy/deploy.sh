#!/bin/bash
# Lancé sur le serveur après chaque envoi : installe Docker si besoin puis (re)démarre tout
set -e
cd /opt/tgl/deploy
command -v docker >/dev/null || bash ./install-serveur.sh
if [ ! -f .env ] || grep -q '^SMTP_PASS=$' .env; then
  echo "⚠ Le mot de passe d'application Gmail (SMTP_PASS) n'est pas encore dans .env : les e-mails ne partiront pas."
fi
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null
docker compose ps
