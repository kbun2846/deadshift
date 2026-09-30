#!/usr/bin/env bash
# Admin page keys (server/admins.js). Run on the VPS as root:
#
#   bash /opt/deadstab/server/deploy/admin.sh add sam       a key for Sam (printed once)
#   bash /opt/deadstab/server/deploy/admin.sh list          who has one
#   bash /opt/deadstab/server/deploy/admin.sh remove sam    Sam's key stops working at once
#
# Your own key is ADMIN_TOKEN in /etc/deadstab.env. The server notices
# changes by itself; no restart needed.
set -euo pipefail
if [ "$(id -u)" != 0 ]; then echo "Run this as root." >&2; exit 1; fi
set -a; . /etc/deadstab.env; set +a
exec runuser -u deadstab -- node /opt/deadstab/server/admins.js "$@"
