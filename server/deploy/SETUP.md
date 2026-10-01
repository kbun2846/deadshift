# Putting the Deadstab game server online

This guide gets the game server (`server/`) running on a rented Linux machine (a VPS) at **play.deadstab.com**. After this, JOIN and HOST in the game both play there. It takes about 30 minutes, and nearly all of it is copy and paste.

You do every step yourself: the accounts, the payment and the passwords are yours. Nobody else, Claude included, should ever have them.

## What you end up with

- The game page stays where it is (deadstab.com, GitHub Pages).
- The game server runs on the VPS. Caddy sits in front of it and handles HTTPS, and it gets and renews its own certificate.
- Every 2 minutes the VPS checks GitHub for a new version. When one arrives it waits for a moment with nobody playing (at most 20 minutes), then updates and restarts. **Pushing to `main` updates both the page and the server.**
- An admin page at https://play.deadstab.com/admin: server health, every room and who is in it, kicks, bans, announcements and maintenance mode. Only you, and people you give their own key to, can use it.

## 1. Rent the VPS

Any provider works if it offers **Ubuntu 24.04** and lets you log in with an SSH key (DigitalOcean, Vultr, Linode/Akamai, Hetzner and OVH all do). What to pick:

- **Image:** Ubuntu 24.04 LTS (x64).
- **Size:** 1 CPU and 1 to 2 GB RAM is plenty to start (about $5-12 a month). If the admin page's load number often goes above about 10 ms a tick, move up a size (most providers resize in place).
- **Region:** the one closest to most of your players (for the US: a New York, Virginia or Chicago region).
- **Bandwidth:** at least 1 TB a month included (see Costs).
- **Login:** SSH key (below), not a password.
- **Name:** `deadstab-1`.

For example, on DigitalOcean it is **Create → Droplets**, then Basic → Regular → the $6 plan.

**Your SSH key** (the key that lets your PC log in to the VPS). On your PC, open **PowerShell** and run:

```
ssh-keygen -t ed25519 -C "deadstab-vps"
```

Press Enter at every question (a passphrase is optional). Then show the public half:

```
type $env:USERPROFILE\.ssh\id_ed25519.pub
```

Copy the whole line it prints (it starts `ssh-ed25519`) into your provider's **SSH key** box when you create the server. The other file, `id_ed25519` without `.pub`, is the private half. It never leaves your PC.

Create the server and note its **IPv4 address** (four numbers, like `203.0.113.45`).

## 2. Point play.deadstab.com at it

In Cloudflare: **deadstab.com → DNS → Records → Add record**

| Type | Name | IPv4 address | Proxy status |
|---|---|---|---|
| A | `play` | your VPS's IPv4 | **DNS only** (grey cloud) |

Leave your other records (the GitHub Pages ones) alone.

## 3. Log in and install

In PowerShell (use your VPS's address):

```
ssh root@203.0.113.45
```

Answer `yes` the first time. You are now typing on the VPS. Paste these three lines:

```
apt-get update && apt-get install -y git
git clone https://github.com/kbun2846/deadstab.git /opt/deadstab
bash /opt/deadstab/server/deploy/install.sh
```

It runs for a few minutes. At the end it prints:

- "The game server is running."
- **ADMIN TOKEN**: a long string of letters and numbers. **Save it in your password manager now.** It is your key to the admin page. It is also stored on the VPS in `/etc/deadstab.env` if you lose it.

(If the repo is private by then, `git clone` asks for a login. See "If the repo is private" below.)

## 4. Check it

In your browser:

- https://play.deadstab.com/health should show `{"ok":true,...}`. The first visit can take a few seconds while Caddy gets the certificate.
- https://play.deadstab.com/admin: paste your admin token and click **Sign in**. It should say "signed in as owner" (no rooms yet).
- deadstab.com → PLAY → HOST → CREATE GAME should open a lobby with a room code, and you as the host. The room then shows on the admin page.

## Everyday use

Log in with `ssh root@<address>`, then:

| What | Command |
|---|---|
| Is it running? | `systemctl status deadstab` |
| Live log (Ctrl+C to stop) | `journalctl -u deadstab -f` |
| Restart | `systemctl restart deadstab` |
| Update now, even with players on | `bash /opt/deadstab/server/deploy/update.sh --now` |
| What did the updater do? | `journalctl -u deadstab-update -n 30` |
| Change settings | `nano /etc/deadstab.env`, then restart |

## The admin page

https://play.deadstab.com/admin works on a phone and a computer. It refreshes itself every few seconds while you look at it.

- **GAME** (the pink button at the top): opens deadstab.com in a new tab with the developer tools already on. The link it uses works once, for a minute, and the log notes who used it. (Another address for the game: `GAME_URL=...` in `/etc/deadstab.env`.)

- **overview:** players online (and today's peak), rooms, server load (if the average often goes above about 10 ms a tick, move up a VPS size), uptime, memory, the version running, and data sent this month against your 1 TB plan, with an estimate for the whole month. (A different plan size: add `MONTHLY_TRANSFER_GB=2000`, say, to `/etc/deadstab.env` and restart.) Also here: an **announcement** box (a short message, up to 140 characters, shown as a card at the top of every player's screen: in a game, in the lobby or on the death screen) and **maintenance mode** (new games and joins are refused with your message while matches already running carry on; it stays on through restarts until you turn it off).
- **online:** everyone playing right now, across every room: search, sort by name, room, ping, kills or time online. **MESSAGE** sends one player a private card only they see; **STATS** (or a click on the name) opens their sheet.
- **player sheet:** everything the server knows about one player: player id and address (copy buttons), room, map, mode, team, ping (now and average), when they connected; this match (kills, deaths, damage dealt and taken, weapon, health, alive or dead, rank; a dash where the game doesn't count something yet, like assists and accuracy); since they connected (rooms, matches, kills, deaths, damage); and since the server started for that browser (connections, totals, names used, recent rooms, kicks, bans and messages). A private message box, KICK and BAN are at the bottom. These numbers live in memory: a restart clears them.
- **rooms:** every game with players in it, and who is in each. **KICK** removes a player from that room for good (other rooms are fine). **BAN** keeps their browser's player id *and* their internet address off every room, for 1 hour, 1 day, 7 days or for good. **MESSAGE ROOM** shows a card to everyone in one room, a player's **MESSAGE** to just them; **CLOSE ROOM** disconnects everyone in it (an always-open room just starts over).
- **players:** the last 300 people who connected, including ones who already left, so you can still ban someone after they quit.
- **bans:** every ban with who made it, why and when it ends; **UNBAN**; and a box to ban a player id or address by hand.
- **log:** what everyone with a key did, and when.
- **owner** (only with your own admin token): other people's keys, the developer tools code, and **RESTART SERVER**.

There are no accounts yet, so someone determined can get around a ban by clearing their browser and switching networks.

## The developer tools code

The game asks the server whether a developer tools code is right; the code itself is never in the game or the repo. Until you set one, the developer tools can't be unlocked. Set or change it either way:

- on the admin page: **owner → developer tools code**, type it, **SET CODE**; or
- on the VPS: `bash /opt/deadstab/server/deploy/admin.sh devcode` (it asks twice and shows nothing as you type).

Use 4 to 32 letters or digits; longer and with letters is much harder to guess. The server keeps only a scrambled (hashed) form of it, so it can't be shown back: if you forget it, set a new one. Wrong guesses are limited, so guessing takes a very long time.

## Who can use the admin page

Only someone with a key. Yours is the admin token. To let someone else in, give them **their own** key rather than yours, so you can take theirs back without changing your own:

| What | Command (on the VPS) |
|---|---|
| Make a key for Sam (or: owner tab, **ADD KEY**) | `bash /opt/deadstab/server/deploy/admin.sh add sam` |
| Who has a key | `bash /opt/deadstab/server/deploy/admin.sh list` |
| Take Sam's key back (works at once) | `bash /opt/deadstab/server/deploy/admin.sh remove sam` |

- `add` prints the key **once**. Send it to them privately, e.g. a direct message, not a group chat. The VPS only keeps a fingerprint of it, so a lost key can't be looked up; remove it and add a new one.
- They paste it at https://play.deadstab.com/admin and click **Sign in**. The page remembers it only until that browser tab closes, and **Sign out** forgets it straight away.
- Every kick, ban, announcement and so on is recorded with the name of whoever did it: the admin page's **log** tab, and the server's log (`journalctl -u deadstab | grep admin`). Other people's keys can't see or use the owner tab.
- An address that gets a key wrong 10 times in 10 minutes is locked out for 10 minutes.

## If the repo is private

Once the repo is private, the VPS needs read access (a "deploy key"). On the VPS:

```
ssh-keygen -t ed25519 -f /root/.ssh/deadstab_deploy -N ""
cat /root/.ssh/deadstab_deploy.pub
```

On GitHub: **the repo → Settings → Deploy keys → Add deploy key**. Paste that line and leave "Allow write access" **off**. Then on the VPS:

```
cat >> /root/.ssh/config <<'EOF'
Host github.com
  IdentityFile /root/.ssh/deadstab_deploy
EOF
cd /opt/deadstab && git remote set-url origin git@github.com:kbun2846/deadstab.git && git fetch
```

Answer `yes` once. Updates keep working as before.

## Safety notes

- Log in with your SSH key only. Most providers turn password login off when a server is made with a key; if yours didn't, set `PasswordAuthentication no` in `/etc/ssh/sshd_config` and `systemctl restart ssh`.
- The firewall only lets in SSH (22), HTTP (80) and HTTPS (443). The game server itself listens only inside the VPS, behind Caddy.
- Security updates for Ubuntu install themselves (unattended-upgrades).
- **Pushing to `main` puts that code on the VPS within minutes** (the updater runs it). Keep two-factor login on your GitHub account, and only give push access to people you trust with the server.
- Keep the `play` record **grey (DNS only)** in Cloudflare. With the orange proxy on, every player would reach the server from Cloudflare's addresses, and bans by address would stop working.
- Never paste the admin token or any password into a chat, a commit or a screenshot. If yours leaks, make a new one: `openssl rand -hex 24`, put it in `/etc/deadstab.env` as `ADMIN_TOKEN=...`, then `systemctl restart deadstab`. If someone else's leaks, `admin.sh remove` them and `add` them again.

## Costs

- VPS: about $5-12 a month to start.
- Bandwidth: a player in a busy 8-seat match downloads about 400 MB an hour (less in smaller matches), so 1 TB a month covers about 2,500 player-hours. The admin page shows how many are on. If that ever runs short, the server can compress its messages (see AGENTS.md > The game server).
- Domain: already paid (Cloudflare).
