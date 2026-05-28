# Sicurezza

## Dati Sensibili

Non devono essere versionati:

- `.env`
- `data/db.json`
- `data/secrets/`
- `generated/`
- certificati e chiavi private
- log applicativi o Apache

Il repository contiene `.gitignore` per ridurre il rischio di commit accidentali.

## Utenti

Le password sono salvate con:

- `crypto.scrypt`
- salt casuale
- hash persistito nel database JSON

La policy password viene validata in backend.

## Sessioni

Le sessioni usano:

- cookie `HttpOnly`
- token casuale
- hash SHA-256 del token nel database

Il database contiene sessioni attive. Proteggi `DB_PATH` come file sensibile.

## 2FA TOTP

La 2FA e' opzionale per utente.

Quando viene abilitata o rigenerata:

1. Il backend genera una nuova chiave TOTP.
2. Il frontend mostra QR code e URI `otpauth://`.
3. Il backend salva la chiave solo dopo verifica di un codice valido.

Le chiavi TOTP sono dati sensibili e sono nel database JSON.

## Certificati

Le credenziali OVH vengono scritte in `SECRETS_DIR` e protette con permessi `0600` quando il sistema operativo lo consente.

I certificati Let's Encrypt vivono normalmente in:

```text
/etc/letsencrypt
```

In Docker questo percorso e' un volume persistente.

## Hardening Produzione

Raccomandazioni minime:

- Pubblica il pannello dietro HTTPS.
- Limita l'accesso al pannello con firewall o VPN.
- Usa password uniche e robuste.
- Abilita 2FA per gli amministratori.
- Fai backup cifrati di `data/` e `/etc/letsencrypt`.
- Non usare credenziali OVH condivise.
- Controlla periodicamente log e utenti attivi.

## Permessi File

Su host Linux:

```bash
chmod 700 data data/secrets
chmod 600 data/db.json
```

Se l'app deve scrivere in `/etc/apache2`, preferisci un utente dedicato e permessi mirati rispetto a esecuzione indiscriminata come `root`.

## GitHub

Prima di ogni push verifica:

```bash
git status --short
git diff --cached --name-only
```

Non devono comparire:

- file sotto `data/`
- file sotto `generated/`
- `.env`
- `*.key`
- `*.pem`
- `*.p12`
