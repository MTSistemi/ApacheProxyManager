# API

Le API restituiscono JSON salvo gli endpoint che servono file statici o configurazioni testuali.

## Pubbliche

### Health

```http
GET /api/health
```

Restituisce stato applicativo e percorso di export.

### Bootstrap

```http
GET /api/bootstrap
```

Restituisce nome app, tema e flag `setupRequired`.

### Setup Admin

```http
POST /api/setup/admin
```

Crea il primo amministratore. Disponibile solo se il setup non e' gia' completato.

### Login

```http
POST /api/auth/login
```

Richiede username, password e, se abilitato per l'utente, codice TOTP.

## Autenticate

### Logout

```http
POST /api/auth/logout
```

Invalida la sessione corrente.

### Utente Corrente

```http
GET /api/auth/me
```

Restituisce l'utente autenticato.

### Stato Applicazione

```http
GET /api/state
```

Restituisce host, certificati, utenti sanitizzati, attivita' ed environment applicativo.

### Dashboard

```http
GET /api/dashboard
```

Restituisce metriche sistema e stato TCP dei backend configurati.

### Logs

```http
GET /api/logs
GET /api/logs?kind=access&hostId=...
GET /api/logs?kind=error&hostId=...
```

Restituisce registro attivita' o tail dei log host configurati.

## Host

### Crea Host

```http
POST /api/hosts
```

### Aggiorna Host

```http
PUT /api/hosts/:id
```

### Elimina Host

```http
DELETE /api/hosts/:id
```

### Duplica Host

```http
POST /api/hosts/:id/duplicate
```

### Configurazione Host

```http
GET /api/hosts/:id/config
```

Restituisce la configurazione Apache renderizzata come testo.

### Deploy Host

```http
POST /api/hosts/:id/deploy
```

Scrive la configurazione in `GENERATED_DIR` e, se configurato, nei percorsi Apache reali.

## Preview

```http
POST /api/preview
```

Valida un payload host e restituisce la configurazione Apache renderizzata.

## Certificati

```http
POST /api/certificates/ovh
```

Genera o esegue il comando certbot con challenge DNS OVH.

## Utenti Admin

Richiedono ruolo `admin`.

```http
GET /api/users
POST /api/users
PUT /api/users/:id
DELETE /api/users/:id
POST /api/users/:id/totp/prepare
```

Gli endpoint utente restituiscono sempre utenti sanitizzati, senza password hash e senza chiave TOTP.
