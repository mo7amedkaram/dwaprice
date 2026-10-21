# Deploying dwaprice.com

Every push to `main` deploys the site automatically:

1. **GitHub Actions, job `check`** runs lint, typecheck and tests.
2. **GitHub Actions, job `deploy`** runs `next build` and packs the standalone server. It uploads the bundle with rsync over SSH to `/www/wwwroot/dwaprice.com/releases/<commit>/` and runs [`scripts/server/deploy.sh`](scripts/server/deploy.sh) on the server.
3. **`deploy.sh`** links the shared `.env` and cache into the new release, then points `current` at it and reloads PM2 (zero downtime). Next it waits until `http://127.0.0.1:3100/api/health` reports the new commit. If that never happens, `current` goes back to the previous release and the deploy fails (red in GitHub).

The server never runs `next build` and never pulls from GitHub. The workflow is [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). You can also start it by hand under **Actions → Deploy → Run workflow**.

```
/www/wwwroot/dwaprice.com/
├── releases/
│   ├── 3f2a…/            one folder per deployed commit (the newest 5 are kept)
│   └── 9bc1…/
├── shared/
│   ├── .env              production settings (you create it once, step 12)
│   ├── cache/            Next.js data cache, survives every deploy
│   └── logs/             PM2 logs (out.log, error.log)
└── current -> releases/9bc1…    the live release

Browser ──HTTPS──> Nginx (aaPanel) ──> 127.0.0.1:3100 ──> PM2 "dwaprice" (current/server.js)
```

The site runs on port **3100**, because port 3000 is used by another app on this server. Local development (`npm run dev`) stays on 3000.

---

## Part 1: server basics (one time)

Run these as **root**: use SSH, or the **Terminal** in aaPanel's left menu. Commands that start with `sudo -u deploy` or `sudo -iu deploy` run as the deploy user.

### 1. Check the server and install basic tools

```bash
uname -m                     # should print x86_64
ss -ltnp | grep ':3100 '     # should print nothing: port 3100 must be free for this site
apt update
apt install -y curl rsync
```

The build runs on an x86_64 GitHub machine and ships native modules (image resizing), so the server must be x86_64 too. If `uname -m` prints `aarch64` (an ARM server), change `runs-on: ubuntu-latest` to `runs-on: ubuntu-24.04-arm` in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

### 2. Add 2 GB of swap

Swap protects the server from running out of memory.

First check whether swap already exists:

```bash
free -h          # look at the "Swap:" line
swapon --show    # no output = no swap
```

If there is no swap:

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab        # keep it after reboots
echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
sysctl -p /etc/sysctl.d/99-swappiness.conf
free -h                                                 # Swap: 2.0Gi
```

### 3. Install Node.js 22 and PM2 (terminal, not the aaPanel App Store)

Use the terminal method below. aaPanel's App Store Node.js/PM2 managers install Node in an aaPanel folder and run PM2 as root. The `deploy` user would not find `node`/`pm2` there, and the app would belong to root.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
bash /tmp/nodesource_setup.sh
apt install -y nodejs
npm install -g pm2
node -v     # v22.x.x
pm2 -v
```

### 4. Create the `deploy` user

GitHub Actions logs in as this user. It is not root and has no sudo.

```bash
adduser --disabled-password --gecos "" deploy
```

### 5. SSH key for GitHub Actions

**On your own computer** (Windows PowerShell, macOS or Linux terminal), create a key pair that is used only for deploys:

```bash
ssh-keygen -t ed25519 -C "github-actions-dwaprice" -f dwaprice_deploy -N ""
```

This creates two files:

- `dwaprice_deploy`: the **private** key. It goes into the GitHub secret `SSH_PRIVATE_KEY`. Never put it on the server or in the repository.
- `dwaprice_deploy.pub`: the **public** key. It goes on the server.

**On the server** (as root), install the public key for `deploy`:

```bash
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
nano /home/deploy/.ssh/authorized_keys      # paste the single line from dwaprice_deploy.pub, save with Ctrl+O, Enter, Ctrl+X
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
```

**Back on your computer**, test the login. Replace `SERVER_IP`, and `22` if your SSH port is different:

```bash
ssh -i dwaprice_deploy -p 22 deploy@SERVER_IP "node -v && pm2 -v"
```

It must print both versions without asking for a password. If it fails, check two things:
- **aaPanel → Security**: the SSH port is open in the firewall, and key login is allowed (SSH settings).
- Your VPS provider's firewall also allows that port.

### 6. Start PM2 at boot

```bash
pm2 startup systemd -u deploy --hp /home/deploy
systemctl start pm2-deploy
```

This creates the `pm2-deploy` service. Every deploy runs `pm2 save`, so after a reboot PM2 brings the site back by itself.

Optional: rotate the PM2 logs so they don't fill the disk:

```bash
sudo -iu deploy pm2 install pm2-logrotate
sudo -iu deploy pm2 set pm2-logrotate:max_size 20M
sudo -iu deploy pm2 set pm2-logrotate:retain 14
```

> **PM2 is per user.** As root, `pm2 ls` shows root's own (empty) list. Always switch to the deploy user first: `sudo -iu deploy`.

---

## Part 2: aaPanel website (Nginx, SSL)

### 7. DNS

At your domain registrar, create **A records** pointing to the server IP for:
- `dwaprice.com`
- `www.dwaprice.com`
- `api.dwaprice.com`: the API's public address (`API_BASE_URL`). The app routes it by host name, so it must reach the same site.

Wait until `ping dwaprice.com` shows your server IP.

### 8. Add the site as a reverse proxy

Menu names differ a little between aaPanel versions.

- **aaPanel 7:** **Website → Proxy Project → Add proxy**.
  - Domain: `dwaprice.com`, then `www.dwaprice.com` and `api.dwaprice.com`, one per line.
  - Target URL: `http://127.0.0.1:3100`
  - Send domain (host): `$host`
- **Older aaPanel:** **Website → Add site**, with the domains one per line and PHP version **Static** (no database, no FTP). Then open the site → **Reverse proxy → Add reverse proxy**.
  - Target URL: `http://127.0.0.1:3100`
  - Send domain: `$host`

Use port **3100**, not 3000: 3000 is the other app on this server.

In both cases, leave the proxy **Cache** option **off**. aaPanel's proxy cache would store HTML pages and break price updates (`/api/revalidate`).

### 9. SSL (Let's Encrypt) and HTTPS

1. Open the site → **SSL → Let's Encrypt**, tick all the domains, and click **Apply**. DNS from step 7 must already point to the server, and port 80 must be open.
2. Turn on **Force HTTPS** on the same SSL page.

aaPanel renews the certificate automatically.

### 10. Nginx settings

Two changes, both in the site's settings in aaPanel.

**a) Real visitor IP.** Open the reverse proxy entry's **configuration file**. Find the `X-Forwarded-For` line and replace it as shown below, and make sure the two other lines are there:

```nginx
    proxy_set_header X-Forwarded-For $remote_addr;     # was: $proxy_add_x_forwarded_for
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
```

Why: the API's rate limits and IP allowlists read the first `X-Forwarded-For` address. With aaPanel's default (`$proxy_add_x_forwarded_for`), a visitor can send a fake address there. `$remote_addr` overwrites it with the real one.

If you later put Cloudflare in front of the site, `$remote_addr` becomes a Cloudflare address. That needs Nginx's `real_ip` setup for Cloudflare.

**b) Long browser cache for build assets.** Open **Config file**: the site's main Nginx file. Inside the `server { … }` block, just above the line that includes the proxy configuration (`include …/proxy/dwaprice.com/*.conf;`), add:

```nginx
    # Hashed build files (/_next/static/...) never change: let browsers keep them for a year.
    location ^~ /_next/static/ {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_hide_header Cache-Control;
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
    }
```

This block needs its own `proxy_pass`: without it Nginx looks for the files on disk and returns 404. Save. aaPanel tests the configuration and reloads Nginx, and it shows an error instead of saving if there's a typo.

---

## Part 3: app folders and production settings

Do this **after** Part 2: adding a site in aaPanel can create or reset the site folder.

### 11. Folder layout

```bash
mkdir -p /www/wwwroot/dwaprice.com
chown deploy:deploy /www/wwwroot/dwaprice.com
sudo -u deploy mkdir -p /www/wwwroot/dwaprice.com/releases /www/wwwroot/dwaprice.com/shared/cache /www/wwwroot/dwaprice.com/shared/logs
```

Leave any files aaPanel put in that folder (`index.html`, `.user.ini`, …). Nginx sends every request to the app, so they are never served.

### 12. The production `.env`

Use the same names as [`.env.example`](.env.example), with production values:

```bash
sudo -u deploy nano /www/wwwroot/dwaprice.com/shared/.env
chmod 600 /www/wwwroot/dwaprice.com/shared/.env
```

Notes for this file:

- **Fill these:** `WEB_DATABASE_URL`, `API_DATABASE_URL`, `SITE_URL=https://dwaprice.com`, `API_BASE_URL=https://api.dwaprice.com/v1`, `REVALIDATE_SECRET`, `API_SECRET`, plus any optional ones you use.
- **Generate secrets** (`REVALIDATE_SECRET`, `API_SECRET`, `CRON_SECRET`) with `openssl rand -hex 32`.
- **Pool sizes are optional:** `WEB_DB_POOL_MAX=5` and `API_DB_POOL_MAX=5` are reasonable. During a reload the old and new process run side by side for a moment, and both database roles allow 20 connections in total.
- **Never set** `API_ALLOW_PRIVATE_WEBHOOKS` or `API_DEV_LOGIN_LINKS` in production.
- **`WEB_DATABASE_CA`** is several lines long. Wrap it in double quotes, keeping the line breaks:
  ```
  WEB_DATABASE_CA="-----BEGIN CERTIFICATE-----
  MIID...
  -----END CERTIFICATE-----"
  ```

---

## Part 4: GitHub

### 13. Repository secrets

Go to **GitHub → mo7amedkaram/dwaprice → Settings → Secrets and variables → Actions → New repository secret**. Add each name below exactly as written.

**SSH (all required):**

| Secret | Value |
|---|---|
| `SSH_HOST` | Server IP (or a host name pointing to it) |
| `SSH_PORT` | SSH port, usually `22` (aaPanel may have changed it: see aaPanel → Security) |
| `SSH_USER` | `deploy` |
| `SSH_PRIVATE_KEY` | The whole content of `dwaprice_deploy`, including the `-----BEGIN…` and `-----END…` lines |
| `SSH_KNOWN_HOSTS` | Output of `ssh-keyscan -p <SSH_PORT> <SSH_HOST>` (see below) |

To get `SSH_KNOWN_HOSTS`, run this on your computer with the **same** host and port as the secrets:

```bash
ssh-keyscan -p 22 SERVER_IP
```

Paste all the lines it prints. To be sure you're talking to your server, compare the fingerprints:
- On the server, `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` shows the real fingerprint.
- On your computer, `ssh-keyscan -p 22 SERVER_IP | ssh-keygen -lf -` shows what you scanned. The ED25519 line must match.

**App settings, used by `next build`.** Prerendered pages (canonical URLs, contact details, the top drug pages) are built on GitHub, so the build needs the production values. Use the **same values as `shared/.env`**:

| Secret | Required? |
|---|---|
| `WEB_DATABASE_URL` | **Yes**: the build reads the database |
| `API_DATABASE_URL` | **Yes** |
| `SITE_URL` | **Yes** (`https://dwaprice.com`) |
| `API_BASE_URL` | **Yes** (`https://api.dwaprice.com/v1`) |
| `API_SECRET` | **Yes** |
| `REVALIDATE_SECRET` | **Yes** |
| `WEB_DATABASE_CA` | Optional |
| `CONTACT_EMAIL` | Optional |
| `UPSTASH_REDIS_REST_URL` | Optional |
| `UPSTASH_REDIS_REST_TOKEN` | Optional |
| `RESEND_API_KEY` | Optional |
| `ADMIN_EMAIL` | Optional |
| `ALERT_FROM_EMAIL` | Optional |
| `CRON_SECRET` | Optional |
| `WHATSAPP_NUMBER` | Optional |

Don't add these as secrets (the workflow ignores them):
- `WEB_DB_POOL_MAX` and `API_DB_POOL_MAX`: server-only, in `shared/.env`.
- `API_ALLOW_PRIVATE_WEBHOOKS` and `API_DEV_LOGIN_LINKS`: local development only.

> When you change a setting, change it in **both** places. Edit `shared/.env` and run `pm2 reload dwaprice` (Part 5). Update the GitHub secret, then redeploy so the prerendered pages use it too.

### 14. First deploy

Push to `main`, or open **Actions → Deploy → Run workflow**. Open the run to watch it.

The `Activate release` step ends with `<sha> is live`. Then check:

```bash
curl -s http://127.0.0.1:3100/api/health      # on the server: {"ok":true,"commit":"<sha>"}
```

Then open https://dwaprice.com/api/health in your browser.

---

## Part 5: day to day

### Logs and status

```bash
sudo -iu deploy                      # become the deploy user first
pm2 status                           # is "dwaprice" online? restarts, memory
pm2 logs dwaprice                    # live logs (Ctrl+C to stop)
pm2 logs dwaprice --lines 200        # last 200 lines
pm2 logs dwaprice --err              # errors only
pm2 monit                            # live CPU/memory dashboard
```

The same logs are in `/www/wwwroot/dwaprice.com/shared/logs/` (`out.log`, `error.log`). Nginx's logs are in aaPanel → site → **Logs**.

### After editing `shared/.env`

```bash
sudo -iu deploy pm2 reload dwaprice
```

This is a zero-downtime reload: the new process reads the `.env` again.

### Manual rollback

A rollback lasts until the next push to `main`, which deploys again.

**Option A (recommended): re-activate an older release with the deploy script.** It also runs the health check:

```bash
sudo -iu deploy
ls -lt /www/wwwroot/dwaprice.com/releases/          # releases, newest first
readlink /www/wwwroot/dwaprice.com/current          # the live one
bash /www/wwwroot/dwaprice.com/releases/<old-sha>/scripts/server/deploy.sh <old-sha>
```

**Option B: by hand.**

```bash
sudo -iu deploy
cd /www/wwwroot/dwaprice.com
ln -sfn /www/wwwroot/dwaprice.com/releases/<old-sha> current.tmp && mv -Tf current.tmp current
pm2 reload dwaprice
curl -s http://127.0.0.1:3100/api/health            # "commit" should now be <old-sha>
```

**Option C: through GitHub.** Revert the bad commit (`git revert <sha>`, push), or re-run an older successful Deploy run under Actions.

### Background jobs (cron)

`/api/v1/internal/jobs` handles webhook delivery, abuse alerts and cache maintenance. It must be called every 15 minutes, which Vercel Cron used to do. Set it up in **aaPanel → Cron → Add task**:
- Type: **Shell Script**
- Name: `dwaprice jobs`
- Period: **N Minutes**, `15`
- Script:

```bash
SECRET="$(grep -E '^API_SECRET=' /www/wwwroot/dwaprice.com/shared/.env | cut -d= -f2- | tr -d '"')"
curl -fsS -m 120 -o /dev/null -H "x-jobs-secret: $SECRET" "http://127.0.0.1:3100/api/v1/internal/jobs?job=all" && echo ok
```

The secret is read from `shared/.env`, so it never appears in the cron task or its log.

### Uptime monitoring

Point any uptime monitor at `https://dwaprice.com/api/health`. It answers `200` only when the app is running and the database responds.

### Changing the port later

1. Edit `APP_PORT=3100` at the top of [`scripts/server/deploy.sh`](scripts/server/deploy.sh). PM2 gets the port from there.
2. In aaPanel, change the reverse proxy target (step 8) and the `/_next/static/` `proxy_pass` (step 10b).
3. Update the port in the cron script above.
4. Push. The deploy restarts the app on the new port and runs the health check on it.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Permission denied (publickey)` in **Upload release** | `SSH_PRIVATE_KEY` doesn't match `/home/deploy/.ssh/authorized_keys`, or that file's permissions are wrong (step 5). |
| `Host key verification failed` | `SSH_KNOWN_HOSTS` was scanned with a different host or port than `SSH_HOST`/`SSH_PORT`. Run `ssh-keyscan` again (step 13). |
| `mkdir: … Permission denied` in **Upload release** | `/www/wwwroot/dwaprice.com` is not owned by `deploy`. Run the `chown` from step 11 again. |
| `pm2 is not on PATH` | Node/PM2 were installed through aaPanel or only for root. Install them as in step 3. |
| `shared/.env is missing` | Create it (step 12). |
| `health check failed …` | The new release did not start or can't reach the database. Look at `pm2 logs dwaprice --lines 100`: usually a wrong or missing value in `shared/.env`. The previous release is back online. |
| 502 Bad Gateway in the browser | The app is not running: run `sudo -iu deploy pm2 status`, then check the logs. Also check that the aaPanel proxy target and the `/_next/static/` `proxy_pass` both use `127.0.0.1:3100`. |
| The other app's pages appear on dwaprice.com | A proxy target still points to `127.0.0.1:3000` (the other app). Change it to `3100` (steps 8 and 10b). |
| `EADDRINUSE` in `pm2 logs dwaprice` | Something else already uses port 3100: `ss -ltnp \| grep ':3100 '` shows what. Free the port, or choose another one ("Changing the port later"). |
| Pages load but some `.png`/`.jpg`/`.js`/`.css` URLs return 404 | aaPanel's site config has `location ~ .*\.(gif\|jpg\|…)$` and `location ~ .*\.(js\|css)?$` blocks that look for files on disk. If the proxy block is `location /` rather than `location ^~ /`, those win: delete the two blocks in **Config file**. |
| GitHub logs show `***` where you expect the word "deploy" | Normal: `SSH_USER` is a secret, so GitHub hides its value (`deploy`) everywhere in the logs, e.g. `[*** 10:15:02] activating …`. |
| `$'\r': command not found` | `deploy.sh` has Windows line endings. `.gitattributes` keeps it LF; re-checkout the file and push. |
