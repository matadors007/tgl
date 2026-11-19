#!/bin/sh
# Sauvegarde quotidienne de la base (03:30), 14 jours gardés, dans le dossier deploy/backups du serveur
set -e
mkdir -p /backups
while true; do
  now=$(date +%H%M)
  if [ "$now" = "0330" ] || [ ! -f /backups/.first ]; then
    f="/backups/tgl-$(date +%Y-%m-%d_%H%M).sql.gz"
    if pg_dump -h db -U tgl tgl | gzip > "$f.tmp"; then mv "$f.tmp" "$f"; echo "Sauvegarde : $f"; touch /backups/.first; else rm -f "$f.tmp"; echo "Sauvegarde ÉCHOUÉE"; fi
    find /backups -name 'tgl-*.sql.gz' -mtime +14 -delete
    sleep 61
  fi
  sleep 30
done
