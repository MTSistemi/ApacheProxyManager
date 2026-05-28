# Operativita'

## Health Check

Endpoint:

```text
GET /api/health
```

Esempio:

```bash
curl http://localhost:4321/api/health
```

Risposta attesa:

```json
{
  "ok": true,
  "port": 4321,
  "apacheModuleHint": "a2enmod ssl proxy proxy_ajp proxy_http proxy_wstunnel rewrite headers",
  "generatedDir": "/app/generated"
}
```

## Backup

Backup minimo:

- `data/db.json`
- `data/secrets/`
- volume `letsencrypt`

Docker:

```bash
docker run --rm \
  -v apache-proxy-manager_app-data:/data \
  -v "$PWD:/backup" \
  busybox tar czf /backup/app-data.tgz -C /data .
```

Backup certificati:

```bash
docker run --rm \
  -v apache-proxy-manager_letsencrypt:/letsencrypt \
  -v "$PWD:/backup" \
  busybox tar czf /backup/letsencrypt.tgz -C /letsencrypt .
```

## Restore

Ferma il container prima del restore:

```bash
docker compose down
```

Ripristina i volumi e riavvia:

```bash
docker compose up -d
```

Verifica:

```bash
curl http://localhost:4321/api/health
```

## Log

Applicazione:

```bash
docker compose logs -f apache-proxy-manager
```

Apache nel container:

```bash
docker exec -it apache-proxy-manager ls -la /var/log/apache2
```

Log dall'interfaccia:

- Logs generali: registro attivita' applicativo.
- Logs host: legge `CustomLog` o `ErrorLog` configurati nel VirtualHost.

## Test Configurazione Apache

Nel container:

```bash
docker exec -it apache-proxy-manager apachectl configtest
```

Reload:

```bash
docker exec -it apache-proxy-manager apachectl graceful
```

## Troubleshooting

### Il container non diventa healthy

Controlla:

```bash
docker logs apache-proxy-manager
docker exec -it apache-proxy-manager curl -fsS http://127.0.0.1:4321/api/health
```

Cause comuni:

- Porta `4321` gia' occupata sull'host.
- Processo Node non avviato.
- Database JSON non scrivibile.

### Apache non ricarica

Controlla:

```bash
docker exec -it apache-proxy-manager apachectl configtest
```

Cause comuni:

- Certificato referenziato ma non presente.
- Direttiva custom non valida.
- Modulo Apache mancante.

### Certbot OVH fallisce

Controlla:

- Endpoint OVH corretto.
- Application key, application secret e consumer key validi.
- Dominio gestito dall'account OVH indicato.
- Tempo DNS propagation sufficiente.

### Backend proxy offline

La dashboard usa connessioni TCP verso host e porta delle regole proxy. Se un backend e' marcato offline:

- Verifica risoluzione DNS dal container.
- Verifica reachability della porta.
- Verifica firewall tra container e backend.
