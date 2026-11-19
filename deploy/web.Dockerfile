# Site web : compilation de l'application Expo pour le web, puis service par Caddy (HTTPS automatique)
FROM docker.io/library/node:22 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_SITE_URL
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL EXPO_PUBLIC_SITE_URL=$EXPO_PUBLIC_SITE_URL NODE_ENV=production
RUN npx expo export -p web --output-dir /app/dist

FROM docker.io/library/caddy:2-alpine
# Caddyfile (serveur : HTTPS automatique) ou Caddyfile.local (essai sur le PC : http://localhost:8080)
ARG CADDYFILE=deploy/Caddyfile
COPY ${CADDYFILE} /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
