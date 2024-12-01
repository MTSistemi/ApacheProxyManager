-- init.sql

-- Tabella per gli utenti
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(256) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL
);

-- Tabella per i vhosts
CREATE TABLE vhosts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    protocol ENUM('http', 'https', 'ajp') NOT NULL DEFAULT 'http',
    port INT NOT NULL,
    user_id INT,
    stats_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    http2_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    hsts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    hsts_subdomains_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    force_ssl BOOLEAN NOT NULL DEFAULT FALSE,
    websocket_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    cache_assets BOOLEAN NOT NULL DEFAULT FALSE,
    block_common_exploits BOOLEAN NOT NULL DEFAULT FALSE,
    custom_location TEXT,
    access_list TEXT[],
    ssl_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ssl_certificate_id INT,
    timeout INT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (ssl_certificate_id) REFERENCES ssl_certificates(id)
);

-- Tabella per i proxy pass
CREATE TABLE proxy_passes (
    id SERIAL PRIMARY KEY,
    vhost_id INT,
    target_host VARCHAR(255) NOT NULL,
    target_port INT NOT NULL,
    path TEXT,
    FOREIGN KEY (vhost_id) REFERENCES vhosts(id)
);

-- Tabella per le regole di rewrite
CREATE TABLE rewrite_rules (
    id SERIAL PRIMARY KEY,
    vhost_id INT,
    from_url_pattern TEXT NOT NULL,
    to_url_pattern TEXT NOT NULL,
    FOREIGN KEY (vhost_id) REFERENCES vhosts(id)
);

-- Tabella per i redirect
CREATE TABLE redirect_rules (
    id SERIAL PRIMARY KEY,
    vhost_id INT,
    from_url_pattern TEXT NOT NULL,
    to_url_pattern TEXT NOT NULL,
    FOREIGN KEY (vhost_id) REFERENCES vhosts(id)
);

-- Tabella per i certificati SSL
CREATE TABLE ssl_certificates (
    id SERIAL PRIMARY KEY,
    vhost_id INT UNIQUE NOT NULL,
    certificate TEXT NOT NULL,
    key TEXT NOT NULL,
    issuer TEXT NOT NULL,
    expiration_date TIMESTAMP WITH TIME ZONE NOT NULL,
    renewal_needed BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (vhost_id) REFERENCES vhosts(id)
);

-- Tabella per i log degli accessi
CREATE TABLE access_logs (
    id SERIAL PRIMARY KEY,
    vhost_id INT,
    client_ip VARCHAR(45),
    request_time TIMESTAMP WITH TIME ZONE,
    method TEXT,
    url TEXT,
    status_code INT,
    response_size BIGINT,
    user_agent TEXT,
    FOREIGN KEY (vhost_id) REFERENCES vhosts(id)
);
