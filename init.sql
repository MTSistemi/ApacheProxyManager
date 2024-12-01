-- Creazione del tipo ENUM per il protocollo
CREATE TYPE protocol_type AS ENUM ('http', 'https', 'ajp');

-- Tabella per i vhosts
CREATE TABLE vhosts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    protocol protocol_type NOT NULL DEFAULT 'http',
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

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE groups (
  id SERIAL PRIMARY KEY,
  group_name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_groups (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  group_id INT REFERENCES groups(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE permissions (
  id SERIAL PRIMARY KEY,
  permission_name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_permissions (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE group_permissions (
  id SERIAL PRIMARY KEY,
  group_id INT REFERENCES groups(id) ON DELETE CASCADE,
  permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  role_name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_roles (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  role_id INT REFERENCES roles(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE logs (
  id SERIAL PRIMARY KEY,
  log_message TEXT NOT NULL,
  user_id INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE settings (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
