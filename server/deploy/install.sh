#!/usr/bin/env bash
# Sets up the Deadstab game server on a fresh Ubuntu 24.04 VPS (see SETUP.md).
# Run as root, from the cloned repo:
#
#   bash /opt/deadstab/server/deploy/install.sh
#
# Safe to run again: it only adds what is missing and never replaces the
# admin token once one exists.
#
# What it does:
#   1. Node 22, pnpm, Caddy (HTTPS), a firewall (SSH, HTTP, HTTPS only),
#      automatic security updates
#   2. a user `deadstab` that runs the server (no login, no sudo)
#   3. /etc/deadstab.env with a random ADMIN_TOKEN (printed once at the end)
#   4. the server's systemd service, Caddy's site for play.deadstab.com, and
#      a timer that pulls updates from GitHub every 2 minutes
# Other people's admin keys: server/deploy/admin.sh (SETUP.md).
set -euo pipefail

REPO_DIR=/opt/deadstab
DOMAIN=${DOMAIN:-play.deadstab.com}
DATA_DIR=/var/lib/deadstab

if [ "$(id -u)" != 0 ]; then echo "Run this as root (sudo bash $0)." >&2; exit 1; fi
if [ ! -f "$REPO_DIR/server/index.js" ]; then echo "Clone the repo into $REPO_DIR first (see SETUP.md)." >&2; exit 1; fi
export DEBIAN_FRONTEND=noninteractive

echo "== Packages"
apt-get update -y
apt-get install -y ca-certificates curl gnupg git ufw unattended-upgrades debian-keyring debian-archive-keyring apt-transport-https openssl

if ! command -v node >/dev/null || ! node -e 'process.exit(+process.versions.node.split(".")[0] >= 22 ? 0 : 1)'; then
  echo "== Node 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if ! command -v pnpm >/dev/null; then npm install -g pnpm@10; fi

if ! command -v caddy >/dev/null; then
  echo "== Caddy"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

# A small VPS (1 GB) gets a swap file so an install never runs out of memory.
if [ ! -f /swapfile ] && [ "$(awk '/MemTotal/{print $2}' /proc/meminfo)" -lt 1600000 ]; then
  echo "== Swap file"
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== Firewall"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
dpkg-reconfigure -f noninteractive unattended-upgrades || true

echo "== The server's user and folders"
id deadstab >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin deadstab
mkdir -p "$DATA_DIR"
chown deadstab:deadstab "$DATA_DIR"
chmod 750 "$DATA_DIR"
git config --global --add safe.directory "$REPO_DIR" || true

echo "== Settings (/etc/deadstab.env)"
NEW_TOKEN=""
if [ ! -f /etc/deadstab.env ]; then
  NEW_TOKEN=$(openssl rand -hex 24)
  cat > /etc/deadstab.env <<EOF
# Deadstab game server settings (server/config.js reads these).
HOST=127.0.0.1
PORT=8787
TRUST_PROXY=1
DATA_DIR=$DATA_DIR
# The admin page's password: https://$DOMAIN/admin
ADMIN_TOKEN=$NEW_TOKEN
EOF
fi
chown root:deadstab /etc/deadstab.env
chmod 640 /etc/deadstab.env

echo "== Installing the game's packages"
cd "$REPO_DIR"
pnpm install --frozen-lockfile --prod

echo "== Services"
install -m 644 "$REPO_DIR/server/deploy/deadstab.service" /etc/systemd/system/deadstab.service
install -m 644 "$REPO_DIR/server/deploy/deadstab-update.service" /etc/systemd/system/deadstab-update.service
install -m 644 "$REPO_DIR/server/deploy/deadstab-update.timer" /etc/systemd/system/deadstab-update.timer
sed "s/play.deadstab.com/$DOMAIN/" "$REPO_DIR/server/deploy/Caddyfile" > /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now deadstab.service
systemctl enable --now deadstab-update.timer
systemctl reload caddy || systemctl restart caddy

sleep 2
echo
if curl -fsS http://127.0.0.1:8787/health >/dev/null; then echo "The game server is running."; else echo "The game server did not answer yet: journalctl -u deadstab -n 50"; fi
echo "Caddy fetches the HTTPS certificate for $DOMAIN the first time someone visits it."
echo "Check: https://$DOMAIN/health"
if [ -n "$NEW_TOKEN" ]; then
  echo
  echo "ADMIN TOKEN (the admin page's password, shown only this once; it is also in /etc/deadstab.env):"
  echo "  $NEW_TOKEN"
fi
