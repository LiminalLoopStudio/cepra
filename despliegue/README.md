# Publicar CEPRA en cepra.shadowlimitstudio.com.mx

Ruta: **internet → VPS de Vultr (Caddy, https) → WireGuard → mini PC KAMRUI (Docker, puerto 3000)**.

Datos usados abajo (cámbialos si no coinciden):

| Qué | Valor |
| --- | --- |
| IP pública del VPS | `45.32.195.126` |
| IP del mini PC en WireGuard | `10.10.10.2` |
| Usuario del mini PC | `gomez` |

## 1. DNS (una vez)

Donde administras `shadowlimitstudio.com.mx`, crea un registro **A**:
`cepra` → `45.32.195.126`. Si el dominio está en Cloudflare, déjalo en **DNS only** (nube gris).

## 2. VPS de Vultr (una vez)

```bash
# Caddy (servidor web con https automático)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# Copia el contenido de despliegue/Caddyfile a /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile
sudo systemctl reload caddy

# Abre http y https (Caddy necesita el 80 para sacar el certificado)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

Si en Vultr tienes un firewall en el panel (Firewall Group), abre ahí también 80 y 443.

## 3. Mini PC (una vez)

```bash
# Docker (si no está)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker gomez   # sal y vuelve a entrar por SSH

# Llave de solo lectura para clonar el repo privado
ssh-keygen -t ed25519 -f ~/.ssh/cepra_deploy -N "" -C "cepra-kamrui"
cat ~/.ssh/cepra_deploy.pub
```

Copia esa llave pública en GitHub → repo **cepra** → Settings → Deploy keys → Add deploy key (sin permiso de escritura).

```bash
cat >> ~/.ssh/config <<'CFG'
Host github-cepra
  HostName github.com
  User git
  IdentityFile ~/.ssh/cepra_deploy
CFG

git clone github-cepra:LiminalLoopStudio/cepra.git ~/cepra
cd ~/cepra

# Variables (las mismas de tu .env.local). La secreta NUNCA va a git.
nano .env
chmod 600 .env

docker compose up -d --build
```

Contenido de `.env` en el servidor:

```
NEXT_PUBLIC_SUPABASE_URL=https://krosobanotkrtomsgqns.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
```

## 4. Probar

- Desde el VPS: `curl -I http://10.10.10.2:3000/login` → `HTTP/1.1 200`.
- En el navegador: https://cepra.shadowlimitstudio.com.mx

## Actualizar a una versión nueva

```bash
cd ~/cepra && git pull && docker compose up -d --build
```

## Notas

- La compilación usa ~1.5 GB de RAM unos minutos. Si el servidor de Minecraft está corriendo con mucha memoria asignada, actualiza CEPRA cuando haya poca gente jugando.
- `docker compose logs -f cepra` muestra errores de la app.
- Si se va la luz en casa, la página no carga hasta que el mini PC vuelva; Docker la levanta solo al arrancar.
