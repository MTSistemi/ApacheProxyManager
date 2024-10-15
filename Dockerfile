FROM python:3.9-slim

# Install dependencies
RUN apt-get update && \
    apt-get install -y apache2 libapache2-mod-jk openssl supervisor && \
    apt-get clean && \
    a2enmod proxy proxy_ajp ssl headers rewrite

# Install Flask
RUN pip install flask

# Copy app files
COPY ./app /app
WORKDIR /app

# Expose HTTP, HTTPS and AJP ports
#EXPOSE 80 443 8009

# Start supervisor to run both Apache and Flask
CMD ["/usr/bin/supervisord", "-c", "/app/supervisord.conf"]
