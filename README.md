# Apache Proxy Manager

Pannello web per gestire VirtualHost Apache con reverse proxy `http`, `https`, `ws`, `wss` e `ajp`, esportazione configurazioni Apache e richiesta certificati Let's Encrypt tramite challenge DNS OVH.

Il progetto e' pensato come alternativa leggera a Nginx Proxy Manager quando l'infrastruttura deve rimanere su Apache HTTPD e `mod_proxy_ajp`.

## Stato

- Backend Node.js senza framework esterni.
- Frontend statico servito dalla stessa app.
- Persistenza su database JSON locale.
- Immagine Docker con Node.js, Apache, certbot e plugin `certbot-dns-ovh`.
- Stack Portainer supportato tramite `compose.portainer.yaml`.

## Funzioni

- Setup iniziale del primo amministratore.
- Login con password e 2FA TOTP opzionale.
- Gestione utenti con ruoli `admin` e `operator`.
- CRUD VirtualHost Apache.
- Regole `ProxyPass` e `ProxyPassReverse`.
- Redirect per path.
- Preview live della configurazione Apache.
- Export locale in `generated/`.
- Deploy diretto in `/etc/apache2/sites-available` quando configurato.
- Dashboard con stato host, CPU, RAM e disco.
- Lettura log generali e log VirtualHost.
- Certificati Let's Encrypt con OVH DNS.

## Requisiti

- Node.js 20 o superiore per esecuzione locale.
- Docker e Docker Compose per esecuzione containerizzata.
- Apache 2.4, `certbot` e `python3-certbot-dns-ovh` per deploy bare metal.

## Avvio Locale

```bash
node server.mjs
```

Apri:

```text
http://localhost:4321
```

Alla prima apertura l'app richiede la creazione dell'amministratore iniziale.

## Docker

Build e avvio:

```bash
docker compose up -d --build
```

Apri:

```text
http://localhost:4321
```

Volumi persistenti:

- `app-data` per `/app/data`
- `app-generated` per `/app/generated`
- `letsencrypt` per `/etc/letsencrypt`
- `apache-logs` per `/var/log/apache2`

## Portainer

Per Portainer usa `compose.portainer.yaml` dopo aver reso disponibile sull'endpoint Docker l'immagine:

```text
apache-proxy-manager:dev
```

Lo stack espone:

- `4321` per il pannello web
- `80` per Apache HTTP
- `443` per Apache HTTPS

## Configurazione

Le variabili principali sono documentate in `.env.example`.

```bash
PORT=4321
DB_PATH=./data/db.json
GENERATED_DIR=./generated
SECRETS_DIR=./data/secrets
CERTBOT_BIN=certbot
APACHE_SITES_AVAILABLE=/etc/apache2/sites-available
APACHE_SITES_ENABLED=/etc/apache2/sites-enabled
APACHE_TEST_COMMAND="apachectl configtest"
APACHE_RELOAD_COMMAND="systemctl reload apache2"
```

In Docker questi percorsi sono gia' configurati per lavorare dentro il container.

## Documentazione

- [Deploy](docs/deployment.md)
- [Configurazione](docs/configuration.md)
- [Operativita'](docs/operations.md)
- [Sicurezza](docs/security.md)
- [API](docs/api.md)

## Verifica

Verifica del renderer Apache:

```bash
node scripts/render-sample.mjs
```

Health check applicativo:

```bash
curl http://localhost:4321/api/health
```

## Note Di Sicurezza

Non versionare dati runtime, credenziali OVH, database JSON, sessioni o certificati. Il repository esclude `data/`, `generated/`, `.env`, file di log e formati comuni di chiavi/certificati.
