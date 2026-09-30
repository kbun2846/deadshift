#!/usr/bin/env bash
# Brings the game server up to date with GitHub's main branch.
# Run every 2 minutes by deadstab-update.timer; safe to run by hand too:
#
#   bash /opt/deadstab/server/deploy/update.sh          (waits for an empty server)
#   bash /opt/deadstab/server/deploy/update.sh --now    (restarts even with players on)
#
# The game's page (GitHub Pages) and this server must run the same version:
# a page newer or older than the server is told to reload. So a new version
# is taken promptly, but a restart disconnects everyone, so it waits for a
# moment with nobody playing, up to 20 minutes, then goes ahead anyway.
set -euo pipefail
# (All in one function, read whole before it runs: `git reset` below rewrites
# this very file, and bash reads a script as it goes.)
main() {
cd /opt/deadstab
STATE=/var/lib/deadstab/update-waiting-since

git fetch --quiet origin main
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then rm -f "$STATE"; exit 0; fi

players=$(curl -fsS --max-time 3 http://127.0.0.1:8787/health 2>/dev/null | sed -n 's/.*"players":\([0-9]*\).*/\1/p' || true)
if [ "${1:-}" != "--now" ] && [ -n "$players" ] && [ "$players" -gt 0 ]; then
  [ -f "$STATE" ] || date +%s > "$STATE"
  waited=$(( $(date +%s) - $(cat "$STATE") ))
  if [ "$waited" -lt 1200 ]; then echo "New version waiting: $players playing (waited ${waited}s)."; exit 0; fi
fi

echo "Updating $(git rev-parse --short HEAD) -> $(git rev-parse --short origin/main)"
git reset --hard --quiet origin/main
pnpm install --frozen-lockfile --prod
# Service files and Caddy's site, if they changed.
for unit in deadstab.service deadstab-update.service deadstab-update.timer; do
  cmp -s "server/deploy/$unit" "/etc/systemd/system/$unit" || install -m 644 "server/deploy/$unit" "/etc/systemd/system/$unit"
done
systemctl daemon-reload
domain=$(sed -n 's/^\([a-z0-9.-]*\) {$/\1/p' /etc/caddy/Caddyfile | head -n 1)
sed "s/play.deadstab.com/${domain:-play.deadstab.com}/" server/deploy/Caddyfile > /tmp/deadstab-caddy
if ! cmp -s /tmp/deadstab-caddy /etc/caddy/Caddyfile; then install -m 644 /tmp/deadstab-caddy /etc/caddy/Caddyfile; systemctl reload caddy; fi
rm -f /tmp/deadstab-caddy
systemctl restart deadstab
rm -f "$STATE"
}
main "$@"
exit
