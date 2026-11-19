#!/bin/bash
# Crée deploy/.env au premier envoi (mots de passe générés automatiquement sur le serveur)
# Usage : setup-env.sh <domaine> <email> <gmail-expediteur>
set -e
cd "$(dirname "$0")"
if [ -f .env ]; then echo "• .env déjà présent : conservé"; exit 0; fi
cp .env.example .env
sed -i "s|^DOMAIN=.*|DOMAIN=$1|; s|^ACME_EMAIL=.*|ACME_EMAIL=$2|; s|^SMTP_USER=.*|SMTP_USER=$3|; s|^SMTP_FROM=.*|SMTP_FROM=$3|" .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|; s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
chmod 600 .env
echo "• .env créé (mots de passe générés)."
