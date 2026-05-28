# Apache Proxy Manager

MVP di pannello web stile Nginx Proxy Manager, ma pensato per Apache HTTPD, `mod_proxy`, `mod_proxy_ajp` e certificati Let's Encrypt con challenge DNS OVH.

## Funzioni presenti

- Setup iniziale obbligatorio con creazione del primo amministratore.
- Login con password e secondo fattore TOTP opzionale compatibile con Google Authenticator.
- Pannello utenti per creare, modificare, disabilitare ed eliminare utenti.
- Abilitazione 2FA per singolo utente dopo la creazione, con QR code, URI `otpauth://` e verifica obbligatoria del codice prima del salvataggio.
- Dashboard iniziale con stato host online/offline, uso CPU, RAM e disco aggiornati in polling.
- Navigazione principale per Hosts, Utenti, Impostazioni, Certificati e Logs.
- Dark mode persistente nel browser.
- CRUD VirtualHost Apache.
- ProxyPass e ProxyPassReverse per `ajp`, `http`, `https`, `ws`, `wss`.
- Redirect per path, incluso il caso `/ -> https://dominio/MIP`.
- Preview live della configurazione Apache.
- Export config in `generated/` e, su server Linux, deploy in `/etc/apache2/sites-available`.
- Certificati OVH tramite `certbot` e plugin `certbot-dns-ovh`.
- Seed iniziale basato su `cavalli.poloinformatico.it`.

## Avvio locale

```bash
node server.mjs
```

Poi apri:

```text
http://localhost:4321
```

Alla prima apertura l'app mostra la schermata di setup. L'amministratore iniziale viene creato con username e password; la 2FA si puo' abilitare dopo dal pannello `Utenti`.

In questo ambiente Codex puoi usare il Node bundled:

```powershell
& "C:\Users\Mattia\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.mjs
```

## Docker

Build e avvio locale con Docker Compose:

```bash
docker compose up -d --build
```

Poi apri:

```text
http://localhost:4321
```

L'immagine include Node.js, Apache, `certbot` e `python3-certbot-dns-ovh`. I volumi persistenti definiti in `compose.yaml` mantengono database app, configurazioni generate, certificati Let's Encrypt e log Apache:

- `app-data` -> `/app/data`
- `app-generated` -> `/app/generated`
- `letsencrypt` -> `/etc/letsencrypt`
- `apache-logs` -> `/var/log/apache2`

Per Portainer, dopo aver costruito o caricato l'immagine `apache-proxy-manager:dev` sull'endpoint Docker, usa `compose.portainer.yaml`.

## Deploy Apache

Su Debian/Ubuntu:

```bash
chmod +x scripts/bootstrap-debian.sh
./scripts/bootstrap-debian.sh
```

Variabili ambiente principali:

```bash
export APACHE_SITES_AVAILABLE=/etc/apache2/sites-available
export APACHE_SITES_ENABLED=/etc/apache2/sites-enabled
export APACHE_TEST_COMMAND="apachectl configtest"
export APACHE_RELOAD_COMMAND="systemctl reload apache2"
export CERTBOT_BIN=certbot
node server.mjs
```

Il bottone `Esporta` scrive sempre una copia in `generated/`. Se `APACHE_SITES_AVAILABLE` e' configurato, scrive anche la config Apache reale. Se `APACHE_TEST_COMMAND` e' configurato, viene eseguito dopo la scrittura.

## Certificati OVH

Il pannello usa `certbot certonly --dns-ovh`. Il file credenziali generato contiene:

```ini
dns_ovh_endpoint = ovh-eu
dns_ovh_application_key = ...
dns_ovh_application_secret = ...
dns_ovh_consumer_key = ...
```

Le credenziali vengono scritte in `data/secrets/` con permessi `0600` quando il sistema operativo lo supporta. In produzione questa directory deve stare fuori dal web root ed essere leggibile solo dall'utente che avvia certbot.

Documentazione utile:

- Certbot DNS OVH: https://certbot-dns-ovh.readthedocs.io/
- Primo accesso API OVHcloud: https://support.us.ovhcloud.com/hc/en-us/articles/360018130839-First-Steps-with-the-OVHcloud-API

## Utenti e sicurezza

Le password sono salvate con `crypto.scrypt` e salt casuale. Le sessioni usano cookie `HttpOnly` e token salvati come hash SHA-256 nel database JSON. La chiave TOTP e' compatibile con Google Authenticator tramite URI `otpauth://totp/...` e QR code generato nel browser.

Il pannello `Utenti` e' visibile solo agli amministratori. L'app impedisce di eliminare o disabilitare l'ultimo amministratore attivo. La 2FA e' facoltativa e si abilita o disabilita per ogni singolo utente. Quando viene abilitata o rigenerata, il backend salva la nuova chiave solo dopo aver verificato un codice TOTP valido.

La palette UI e' ispirata a https://www.metriks.ai: nero, viola `#6D29F6`, blu `#1F6CF5` e verde `#00B383`.

## Dashboard e logs

La dashboard legge le metriche locali dal sistema operativo e verifica lo stato dei backend con connessioni TCP verso gli host e le porte configurate nei `ProxyPass`. I log generali corrispondono al registro attivita' dell'app; i log per VirtualHost leggono i percorsi `CustomLog` ed `ErrorLog` configurati sull'host, quando disponibili sul server dove gira l'app.

## Verifica renderer

```bash
node scripts/render-sample.mjs
```

Il comando stampa la validazione e la config Apache generata dal seed iniziale.
