#!/usr/bin/env bash
# Put a station's web console behind Caddy, with automatic HTTPS (Let's Encrypt).
#
# Run it on the server as the user that runs the stream (it uses sudo when needed):
#   curl -fsSLO https://raw.githubusercontent.com/dustinreeves/live-stream-radio/master/scripts/setup-caddy.sh
#   bash setup-caddy.sh <domain> <project folder>
# e.g.
#   bash setup-caddy.sh radio.example.com ~/my-radio
#
# Before running: point an A record for the domain at this server. On Cloudflare, set it to
# "DNS only" (grey cloud), so Caddy can get its certificate and sees real visitor addresses.
#
# It checks everything and asks before changing anything. It installs Caddy (Debian / Ubuntu)
# if needed, writes /etc/caddy/Caddyfile (backing up the old one), and sets
# "trust_proxy": true in the project's config.json (backing it up too).

set -euo pipefail

say() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mWarning:\033[0m %s\n' "$*"; }
die() {
  printf '\n\033[1;31mError:\033[0m %s\n' "$*" >&2
  exit 1
}

[ $# -eq 2 ] || die "Usage: bash setup-caddy.sh <domain> <project folder>"
DOMAIN="$1"
PROJECT="$(cd "$2" 2> /dev/null && pwd)" || die "Project folder '$2' not found."
CONFIG="$PROJECT/config.json"
[ -f "$CONFIG" ] || die "No config.json in $PROJECT."
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "'$DOMAIN' doesn't look like a domain name."
[ "$(id -u)" -ne 0 ] || die "Run this as the user that runs the stream, not as root. It uses sudo when it needs to."
command -v node > /dev/null || die "node is needed to read config.json."

# --- Checks -------------------------------------------------------------------------------------

API_HOST="$(node -p "String(require('$CONFIG').api.host)")"
API_PORT="$(node -p "String(require('$CONFIG').api.port)")"
TRUST_PROXY="$(node -p "String(require('$CONFIG').api.trust_proxy === true)")"
HAS_LOGIN="$(node -p "const c = require('$CONFIG'); String(!!(c.api.key || (c.console && c.console.users && c.console.users.length)))")"

case "$API_HOST" in
  localhost | 127.0.0.1 | ::1) ;;
  *) warn "api.host is '$API_HOST'. Set it to localhost so the console is only reachable through Caddy." ;;
esac
[ "$HAS_LOGIN" = true ] || warn "No api.key or console user is set: add one with live-stream-radio --set-password first."

SERVER_IP="$(ip -4 route get 1.1.1.1 2> /dev/null | sed -nE 's/.* src ([0-9.]+).*/\1/p')"
DNS_IPS="$(getent ahostsv4 "$DOMAIN" 2> /dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')"
DNS_OK=yes
if [ -z "$DNS_IPS" ]; then
  DNS_OK=no
  warn "$DOMAIN doesn't resolve yet. Add an A record pointing at ${SERVER_IP:-this server} first."
elif [ -n "$SERVER_IP" ] && ! printf '%s' "$DNS_IPS" | grep -qw "$SERVER_IP"; then
  DNS_OK=no
  warn "$DOMAIN points at $DNS_IPS, not this server ($SERVER_IP)."
  warn "If that's Cloudflare, set the record to 'DNS only' (grey cloud), or Caddy can't get a certificate."
fi

PORTS_IN_USE="$(ss -tlnpH 2> /dev/null | awk '$4 ~ /:(80|443)$/' || true)"
if [ -n "$PORTS_IN_USE" ] && ! systemctl is-active --quiet caddy 2> /dev/null; then
  die "Something else is already using port 80 or 443:
$PORTS_IN_USE
Use proxy/nginx.conf instead if that's nginx."
fi

CADDY_INSTALLED=yes
command -v caddy > /dev/null || CADDY_INSTALLED=no

# Only replace a Caddyfile that is the package default, never one with other sites in it
CADDYFILE=/etc/caddy/Caddyfile
if [ -f "$CADDYFILE" ] && ! grep -q 'root \* /usr/share/caddy' "$CADDYFILE" && ! grep -q "live-stream-radio" "$CADDYFILE"; then
  die "$CADDYFILE already has your own sites in it, so this script won't replace it.
Add this block to it by hand instead, then: sudo systemctl reload caddy

$DOMAIN {
	redir / /console
	reverse_proxy localhost:$API_PORT
}"
fi

UFW_ACTIVE=no
if command -v ufw > /dev/null && sudo ufw status 2> /dev/null | grep -q 'Status: active'; then
  UFW_ACTIVE=yes
fi

# --- Plan ---------------------------------------------------------------------------------------

say "Setting up https://$DOMAIN for the console at localhost:$API_PORT"
echo "    project:  $PROJECT"
echo "    DNS:      $DOMAIN -> ${DNS_IPS:-nothing}  (this server: ${SERVER_IP:-unknown})"
echo
echo "This will:"
[ "$CADDY_INSTALLED" = yes ] || echo "  - Install Caddy from its official apt repository"
[ -f "$CADDYFILE" ] && echo "  - Back up $CADDYFILE to $CADDYFILE.bak"
echo "  - Write $CADDYFILE for $DOMAIN, and reload Caddy"
[ "$UFW_ACTIVE" = yes ] && echo "  - Allow ports 80 and 443 in the ufw firewall"
[ "$TRUST_PROXY" = true ] || echo "  - Back up config.json and set api.trust_proxy to true in it"
[ "$DNS_OK" = yes ] || echo "  (The DNS warning above means the certificate will fail until DNS is fixed.)"
echo
read -r -p "Continue? [y/N] " answer
[ "$answer" = "y" ] || [ "$answer" = "Y" ] || die "Cancelled, nothing was changed."

# --- Install Caddy ------------------------------------------------------------------------------

if [ "$CADDY_INSTALLED" = no ]; then
  say "Installing Caddy"
  sudo apt-get update -q
  sudo apt-get install -y -q debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' |
    sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' |
    sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
  sudo apt-get update -q
  sudo apt-get install -y -q caddy
fi

# --- Configure Caddy ----------------------------------------------------------------------------

say "Writing $CADDYFILE"
[ -f "$CADDYFILE" ] && sudo cp -a "$CADDYFILE" "$CADDYFILE.bak"
sudo tee "$CADDYFILE" > /dev/null << EOF
# live-stream-radio web console, written by setup-caddy.sh
$DOMAIN {
	# The console lives at /console
	redir / /console

	# Caddy sets X-Forwarded-For to the real visitor address
	reverse_proxy localhost:$API_PORT

	encode gzip

	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "no-referrer"
		-Server
	}
}
EOF
sudo caddy validate --config "$CADDYFILE" --adapter caddyfile > /dev/null ||
  die "Caddy says the config is invalid. The old one is at $CADDYFILE.bak."

if [ "$UFW_ACTIVE" = yes ]; then
  sudo ufw allow 80/tcp > /dev/null
  sudo ufw allow 443/tcp > /dev/null
fi

sudo systemctl enable --quiet caddy
sudo systemctl reload-or-restart caddy

# --- trust_proxy --------------------------------------------------------------------------------

if [ "$TRUST_PROXY" != true ]; then
  say "Setting api.trust_proxy in config.json"
  cp -a "$CONFIG" "$CONFIG.before-caddy"
  node -e '
    const fs = require("fs");
    const path = process.argv[1];
    const config = JSON.parse(fs.readFileSync(path, "utf8"));
    config.api.trust_proxy = true;
    fs.writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
  ' "$CONFIG"
  echo "    (previous version kept as config.json.before-caddy, takes effect on the next sign in)"
fi

# --- Check it works -----------------------------------------------------------------------------

say "Waiting for the certificate and checking https://$DOMAIN/console"
for attempt in $(seq 1 20); do
  if curl -fsS -o /dev/null --max-time 10 "https://$DOMAIN/console"; then
    say "Done: https://$DOMAIN"
    echo "Caddy renews the certificate by itself. Its log: sudo journalctl -u caddy"
    exit 0
  fi
  sleep 6
done

warn "https://$DOMAIN/console isn't answering yet. Common causes:"
echo "  - DNS doesn't point at this server yet (or Cloudflare proxying is on)"
echo "  - Ports 80 / 443 are blocked by a firewall at your hosting provider"
echo "  - The stream isn't running, so there's nothing on localhost:$API_PORT"
echo "Caddy's log will say which: sudo journalctl -u caddy -n 50 --no-pager"
exit 1
