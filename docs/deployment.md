# Deploy

## Modalita' Supportate

Apache Proxy Manager puo' essere eseguito in tre modalita':

- Locale con Node.js, utile per sviluppo.
- Docker Compose, utile per test e ambienti piccoli.
- Portainer, utile per LXC o host Docker gestiti da UI.

## Deploy Locale

Requisiti:

- Node.js 20 o superiore.
- Accesso in scrittura a `data/` e `generated/`.

Avvio:

```bash
node server.mjs
```

URL:

```text
http://localhost:4321
```

Per esportare configurazioni Apache reali su host Linux, imposta le variabili:

```bash
export APACHE_SITES_AVAILABLE=/etc/apache2/sites-available
export APACHE_SITES_ENABLED=/etc/apache2/sites-enabled
export APACHE_TEST_COMMAND="apachectl configtest"
export APACHE_RELOAD_COMMAND="systemctl reload apache2"
```

L'utente che avvia Node deve avere permessi adeguati sui percorsi Apache. In produzione e' preferibile usare un servizio dedicato con permessi minimi.

## Deploy Docker Compose

Build e avvio:

```bash
docker compose up -d --build
```

Verifica:

```bash
docker compose ps
curl http://localhost:4321/api/health
```

Log:

```bash
docker compose logs -f apache-proxy-manager
```

Stop:

```bash
docker compose down
```

I dati restano nei volumi Docker anche dopo `down`.

## Deploy Portainer

Il file `compose.portainer.yaml` non contiene la sezione `build`; richiede che l'immagine sia gia' presente sull'endpoint Docker.

Nome immagine atteso:

```text
apache-proxy-manager:dev
```

Procedura:

1. Costruisci o carica l'immagine sull'endpoint Docker.
2. Crea uno stack Portainer usando `compose.portainer.yaml`.
3. Verifica che il container sia `healthy`.
4. Apri `http://IP_HOST:4321`.

Porte pubblicate:

- `4321:4321` pannello web.
- `80:80` Apache HTTP.
- `443:443` Apache HTTPS.

## Deploy Bare Metal Apache

Su Debian o Ubuntu:

```bash
chmod +x scripts/bootstrap-debian.sh
./scripts/bootstrap-debian.sh
```

Lo script installa:

- `apache2`
- `certbot`
- `python3-certbot-dns-ovh`

E abilita moduli Apache:

- `ssl`
- `proxy`
- `proxy_ajp`
- `proxy_http`
- `proxy_wstunnel`
- `rewrite`
- `headers`

## Aggiornamento

Docker Compose:

```bash
docker compose build --no-cache
docker compose up -d
```

Portainer:

1. Ricostruisci l'immagine con lo stesso tag o un tag nuovo.
2. Aggiorna lo stack.
3. Controlla `/api/health`.

## Migrazione Dati

I file da preservare sono:

- `data/db.json`
- `data/secrets/`
- `generated/`
- `/etc/letsencrypt` se gestito dal container
- `/var/log/apache2` se vuoi mantenere lo storico log

Non copiare questi file dentro l'immagine. Devono restare in volumi o backup esterni.
