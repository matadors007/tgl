#!/bin/bash
# Préparation d'un VPS Ubuntu 24.04 neuf (à lancer une seule fois, en root ou avec sudo)
set -e
echo "== Mise à jour du système =="
apt-get update && apt-get -y upgrade
echo "== Installation de Docker =="
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh; fi
echo "== Pare-feu : SSH, HTTP, HTTPS seulement =="
apt-get install -y ufw fail2ban unattended-upgrades
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
ufw --force enable
systemctl enable --now fail2ban
echo "== Mémoire d'échange (2 Go) pour la compilation du site =="
if [ ! -f /swapfile ]; then fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi
timedatectl set-timezone Africa/Tunis || true
mkdir -p /opt/tgl
echo "✅ Serveur prêt. Étape suivante : envoyer l'application (envoyer-sur-serveur.bat)."
