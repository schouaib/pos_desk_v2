# VPS Setup Guide

One-time setup to get the SaaS POS app running on an LWS VPS with auto-deploy.

## 1. Provision the Server

- Order an **LWS VPS** with at least **2 vCPU, 4GB RAM, 40GB SSD**
- Choose **Ubuntu 22.04** as the OS
- Add your SSH key during creation
- Note the server IP address

## 2. SSH Into the Server

```bash
ssh root@YOUR_SERVER_IP
```

## 3. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
```

## 4. Install Webhook Listener

```bash
apt update && apt install -y webhook git
```

## 5. Clone the Repository

```bash
mkdir -p /opt/deploy
git clone git@github.com:YOUR_USER/saas-pos.git /opt/deploy/saas-pos
```

> If using HTTPS instead of SSH:
> ```bash
> git clone https://github.com/YOUR_USER/saas-pos.git /opt/deploy/saas-pos
> ```

## 6. Create the .env File

```bash
cp /opt/deploy/saas-pos/.env.example /opt/deploy/saas-pos/.env
nano /opt/deploy/saas-pos/.env
```

Fill in real values:

```
APP_PORT=3000
MONGO_URI=mongodb://mongo:27017
MONGO_DB=saas_pos
JWT_SECRET=GENERATE_A_RANDOM_64_CHAR_STRING
JWT_EXPIRES_IN=24h
```

> **No domain yet?** That's fine. Leave `DOMAIN` unset and Caddy will serve on port 80 (HTTP) using your server IP.
> When you buy a domain later, see [Adding a Domain](#adding-a-domain-later) at the bottom.

Generate a random JWT secret:

```bash
openssl rand -hex 32
```

## 7. Setup the Webhook

Generate a webhook secret:

```bash
openssl rand -hex 20
```

Save this secret — you'll need it for both the server config and GitHub.

Copy and configure the webhook files:

```bash
cp /opt/deploy/saas-pos/deploy/hooks.json /opt/deploy/hooks.json
cp /opt/deploy/saas-pos/deploy/deploy.sh /opt/deploy/deploy.sh
chmod +x /opt/deploy/deploy.sh
```

Edit `hooks.json` and replace `YOUR_WEBHOOK_SECRET` with the secret you generated:

```bash
nano /opt/deploy/hooks.json
```

## 8. Enable the Webhook Service

```bash
cp /opt/deploy/saas-pos/deploy/webhook.service /etc/systemd/system/webhook.service
systemctl daemon-reload
systemctl enable --now webhook
```

Verify it's running:

```bash
systemctl status webhook
```

## 9. First Deploy

```bash
cd /opt/deploy/saas-pos
docker compose -f docker-compose.prod.yml up -d
```

This will:
- Pull the Caddy and MongoDB images
- Build the app image (Go binary + both frontends) — takes 3-5 minutes on first run
- Start all three containers

Verify everything is up:

```bash
docker compose -f docker-compose.prod.yml ps
```

Visit `http://YOUR_SERVER_IP` — you should see the app running.

## 10. Configure GitHub Webhook

Go to your GitHub repo → **Settings** → **Webhooks** → **Add webhook**:

| Field | Value |
|-------|-------|
| Payload URL | `http://YOUR_SERVER_IP/hooks/deploy` |
| Content type | `application/json` |
| Secret | The webhook secret from step 7 |
| Events | "Just the push event" |

Click **Add webhook**. GitHub will send a ping — check the webhook delivery tab for a green checkmark.

## 11. Test Auto-Deploy

Push any small change to `main` and verify:

```bash
# On VPS, watch the deploy log
tail -f /opt/deploy/deploy.log
```

You should see "Deploy started" and "Deploy complete" within ~1-2 minutes.

---

## Useful Commands

```bash
# View running containers
docker compose -f docker-compose.prod.yml ps

# View app logs
docker compose -f docker-compose.prod.yml logs -f app

# View deploy history
cat /opt/deploy/deploy.log

# Restart a specific service
docker compose -f docker-compose.prod.yml restart app

# Full restart (all services)
docker compose -f docker-compose.prod.yml down && docker compose -f docker-compose.prod.yml up -d

# MongoDB backup
docker compose -f docker-compose.prod.yml exec mongo mongodump --archive=/data/db/backup.gz --gzip

# Copy backup to local machine (run from your local machine)
scp root@YOUR_SERVER_IP:/var/lib/docker/volumes/saas-pos_mongo_data/_data/backup.gz ./backup.gz
```

## Troubleshooting

**Webhook not triggering:**
- Check webhook service: `systemctl status webhook`
- Check GitHub webhook deliveries tab for errors
- Verify the secret matches in both `hooks.json` and GitHub

**App not starting:**
- Check logs: `docker compose -f docker-compose.prod.yml logs app`
- Verify `.env` file has all required variables
- Ensure MongoDB is running: `docker compose -f docker-compose.prod.yml ps mongo`

**Build failing on VPS (out of memory):**
- Add swap: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`
- Make permanent: `echo '/swapfile none swap sw 0 0' >> /etc/fstab`

**Port 80 not accessible:**
- Open the firewall: `ufw allow 80 && ufw allow 443`
- Check Caddy logs: `docker compose -f docker-compose.prod.yml logs caddy`

---

## Adding a Domain (Later)

When you buy a domain:

1. **Point DNS** — create an A record at your registrar:
   ```
   Type: A
   Name: pos (or @ for root domain)
   Value: YOUR_SERVER_IP
   TTL: 300
   ```

2. **Update .env** on the VPS:
   ```bash
   nano /opt/deploy/saas-pos/.env
   ```
   Add:
   ```
   DOMAIN=pos.yourdomain.com
   ```

3. **Restart Caddy** to pick up the domain and auto-obtain SSL:
   ```bash
   cd /opt/deploy/saas-pos
   docker compose -f docker-compose.prod.yml restart caddy
   ```

4. **Open port 443** if not already:
   ```bash
   ufw allow 443
   ```

5. **Update GitHub webhook URL** to `https://pos.yourdomain.com/hooks/deploy`

Caddy will automatically obtain a Let's Encrypt SSL certificate and redirect HTTP to HTTPS.
