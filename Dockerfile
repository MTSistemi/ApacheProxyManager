FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    apache2 \
    ca-certificates \
    certbot \
    curl \
    python3-certbot-dns-ovh \
  && a2enmod ssl proxy proxy_ajp proxy_http proxy_wstunnel rewrite headers \
  && a2dissite 000-default \
  && printf "ServerName localhost\n" > /etc/apache2/conf-available/servername.conf \
  && a2enconf servername \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .
RUN chmod +x docker-entrypoint.sh \
  && mkdir -p /app/data /app/generated /app/data/secrets /var/log/apache2 /etc/letsencrypt

ENV NODE_ENV=production \
  PORT=4321 \
  DB_PATH=/app/data/db.json \
  GENERATED_DIR=/app/generated \
  SECRETS_DIR=/app/data/secrets \
  CERTBOT_BIN=certbot \
  APACHE_SITES_AVAILABLE=/etc/apache2/sites-available \
  APACHE_SITES_ENABLED=/etc/apache2/sites-enabled \
  APACHE_TEST_COMMAND="apachectl configtest" \
  APACHE_RELOAD_COMMAND="apachectl graceful"

EXPOSE 4321 80 443

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
