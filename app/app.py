from flask import Flask, render_template, request, redirect
import os

app = Flask(__name__)

# Directory where VirtualHost configs are stored
VHOST_DIR = "/etc/apache2/sites-available/"
SSL_DIR = "/etc/apache2/ssl/"

# Home page: list all virtual hosts
@app.route('/')
def index():
    vhosts = os.listdir(VHOST_DIR)
    return render_template('index.html', vhosts=vhosts)

# Page to add a new VirtualHost
@app.route('/add', methods=['GET', 'POST'])
def add_vhost():
    if request.method == 'POST':
        domain = request.form['domain']
        ajp_port = request.form['ajp_port']
        ssl_enabled = 'ssl_enabled' in request.form

        vhost_content = f"""
        <VirtualHost *:80>
            ServerName {domain}
            ProxyRequests Off
            ProxyPass / ajp://localhost:{ajp_port}/
            ProxyPassReverse / ajp://localhost:{ajp_port}/
        </VirtualHost>
        """

        if ssl_enabled:
            vhost_content += f"""
            <VirtualHost *:443>
                ServerName {domain}
                SSLEngine on
                SSLCertificateFile {SSL_DIR}{domain}.crt
                SSLCertificateKeyFile {SSL_DIR}{domain}.key
                ProxyRequests Off
                ProxyPass / ajp://localhost:{ajp_port}/
                ProxyPassReverse / ajp://localhost:{ajp_port}/
            </VirtualHost>
            """

        # Save the virtual host configuration
        vhost_path = os.path.join(VHOST_DIR, f"{domain}.conf")
        with open(vhost_path, 'w') as vhost_file:
            vhost_file.write(vhost_content)

        # Enable the site
        os.system(f"a2ensite {domain}")
        os.system(f"systemctl reload apache2")

        return redirect('/')

    return render_template('add_vhost.html')

# Page to delete a VirtualHost
@app.route('/delete/<vhost>')
def delete_vhost(vhost):
    os.system(f"a2dissite {vhost}")
    os.system(f"rm {VHOST_DIR}{vhost}")
    os.system(f"systemctl reload apache2")
    return redirect('/')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
