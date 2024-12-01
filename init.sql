-- Define the protocol_type enum
CREATE TYPE protocol_type AS ENUM ('http', 'https', 'ajp');

-- Create the users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the ssl_certificates table after creating the vhosts table
CREATE TABLE ssl_certificates (
    id SERIAL PRIMARY KEY,
    certificate_data TEXT NOT NULL, -- Assuming you need to store some data about the certificate
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the vhosts table which references users and ssl_certificates
CREATE TABLE vhosts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    ssl_certificate_id INT REFERENCES ssl_certificates(id),
    protocol protocol_type DEFAULT 'http',
    stats_enabled BOOLEAN DEFAULT TRUE,
    custom_logs_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the groups table
CREATE TABLE groups (
    id SERIAL PRIMARY KEY,
    group_name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the permissions table
CREATE TABLE permissions (
    id SERIAL PRIMARY KEY,
    permission_name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the roles table
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the user_groups table which references users and groups
CREATE TABLE user_groups (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    group_id INT REFERENCES groups(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the user_permissions table which references users and permissions
CREATE TABLE user_permissions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the group_permissions table which references groups and permissions
CREATE TABLE group_permissions (
    id SERIAL PRIMARY KEY,
    group_id INT REFERENCES groups(id) ON DELETE CASCADE,
    permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the user_roles table which references users and roles
CREATE TABLE user_roles (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    role_id INT REFERENCES roles(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the logs table which references users
CREATE TABLE logs (
    id SERIAL PRIMARY KEY,
    log_message TEXT NOT NULL,
    user_id INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the settings table
CREATE TABLE settings (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the proxy_configs table which references vhosts (if needed)
CREATE TABLE proxy_configs (
    id SERIAL PRIMARY KEY,
    vhost_id INT REFERENCES vhosts(id),
    config_data TEXT NOT NULL, -- Assuming you need to store some data about the configuration
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the proxy_logs table which references vhosts and logs (if needed)
CREATE TABLE proxy_logs (
    id SERIAL PRIMARY KEY,
    vhost_id INT REFERENCES vhosts(id),
    log_message TEXT NOT NULL,
    user_id INT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
