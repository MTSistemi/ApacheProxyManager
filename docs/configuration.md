# Configurazione

## Variabili Ambiente

| Variabile | Default | Descrizione |
| --- | --- | --- |
| `PORT` | `4321` | Porta HTTP del pannello web. |
| `DB_PATH` | `./data/db.json` | Percorso del database JSON. |
| `GENERATED_DIR` | `./generated` | Directory dove vengono scritte le configurazioni esportate. |
| `SECRETS_DIR` | `./data/secrets` | Directory per credenziali temporanee OVH/certbot. |
| `CERTBOT_BIN` | `certbot` | Binario certbot da eseguire. |
| `APACHE_SITES_AVAILABLE` | vuoto | Percorso dove scrivere i file `.conf` reali. |
| `APACHE_SITES_ENABLED` | vuoto | Percorso dove creare link o copie abilitate. |
| `APACHE_TEST_COMMAND` | vuoto | Comando eseguito dopo la scrittura della config. |
| `APACHE_RELOAD_COMMAND` | vuoto | Comando eseguito quando si richiede il reload Apache. |

Esempio:

```bash
export PORT=4321
export DB_PATH=/opt/apache-proxy-manager/data/db.json
export GENERATED_DIR=/opt/apache-proxy-manager/generated
export SECRETS_DIR=/opt/apache-proxy-manager/secrets
export CERTBOT_BIN=certbot
export APACHE_SITES_AVAILABLE=/etc/apache2/sites-available
export APACHE_SITES_ENABLED=/etc/apache2/sites-enabled
export APACHE_TEST_COMMAND="apachectl configtest"
export APACHE_RELOAD_COMMAND="systemctl reload apache2"
```

## Directory

| Directory | Contenuto | Versionata |
| --- | --- | --- |
| `public/` | Frontend statico | Si |
| `lib/` | Moduli backend | Si |
| `scripts/` | Script di supporto | Si |
| `data/` | Database, sessioni e segreti runtime | No |
| `generated/` | Configurazioni Apache generate | No |

## Database JSON

Il database viene creato automaticamente se `DB_PATH` non esiste.

Contiene:

- `hosts`
- `certificates`
- `users`
- `sessions`
- `activity`

Il file puo' contenere hash password, sessioni attive, chiavi TOTP e metadati sensibili. Deve restare fuori dal repository.

## VirtualHost

Ogni host puo' definire:

- `ServerName`
- alias
- `ServerAdmin`
- porte HTTP/HTTPS
- redirect
- regole proxy
- direttive SSL custom
- direttive Apache avanzate
- percorsi log

La preview usa lo stesso renderer dell'export, quindi e' il riferimento corretto prima del deploy.

## Proxy

Protocolli supportati:

- `http`
- `https`
- `ws`
- `wss`
- `ajp`

Per `ajp` Apache richiede `mod_proxy` e `mod_proxy_ajp`.

## Certificati OVH

Il pannello genera file credenziali compatibili con `certbot-dns-ovh`:

```ini
dns_ovh_endpoint = ovh-eu
dns_ovh_application_key = ...
dns_ovh_application_secret = ...
dns_ovh_consumer_key = ...
```

Il file viene scritto in `SECRETS_DIR` e, quando supportato dal sistema operativo, viene protetto con permessi `0600`.

Modalita':

- Comando pronto: genera il comando certbot senza eseguirlo.
- Emissione diretta: esegue certbot dal server/container.

## Docker

Nel container i valori predefiniti sono:

```text
DB_PATH=/app/data/db.json
GENERATED_DIR=/app/generated
SECRETS_DIR=/app/data/secrets
APACHE_SITES_AVAILABLE=/etc/apache2/sites-available
APACHE_SITES_ENABLED=/etc/apache2/sites-enabled
APACHE_TEST_COMMAND=apachectl configtest
APACHE_RELOAD_COMMAND=apachectl graceful
```

Questa configurazione permette all'app di scrivere configurazioni Apache dentro il container e ricaricare Apache senza usare `systemd`.
