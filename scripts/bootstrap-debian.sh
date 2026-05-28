#!/usr/bin/env bash
set -euo pipefail

sudo apt-get update
sudo apt-get install -y apache2 certbot python3-certbot-dns-ovh
sudo a2enmod ssl proxy proxy_ajp proxy_http proxy_wstunnel rewrite headers
sudo apachectl configtest

echo "Apache modules enabled."
echo "Set APACHE_SITES_AVAILABLE, APACHE_SITES_ENABLED, APACHE_TEST_COMMAND and APACHE_RELOAD_COMMAND before deploying live configs."
