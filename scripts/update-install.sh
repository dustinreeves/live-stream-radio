#!/usr/bin/env bash
# Update an existing global install of live-stream-radio (npm install -g) to this fork.
#
# Run it on the server as the user that runs the stream (not root, it uses sudo when needed):
#   curl -fsSLO https://raw.githubusercontent.com/dustinreeves/live-stream-radio/master/scripts/update-install.sh
#   bash update-install.sh [systemd service ...]
# e.g.
#   bash update-install.sh cowardradio doomradio
#
# It shows what it found and asks before changing anything, backs up the current install,
# restarts the given services, and prints how to roll back.
# Set LSR_BRANCH to install a different branch (default: master).

set -euo pipefail

REPO="dustinreeves/live-stream-radio"
BRANCH="${LSR_BRANCH:-master}"
SERVICES=("$@")

say() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mWarning:\033[0m %s\n' "$*"; }
die() {
  printf '\n\033[1;31mError:\033[0m %s\n' "$*" >&2
  exit 1
}

[ "$(id -u)" -ne 0 ] || die "Run this as the user that runs the stream, not as root. It uses sudo when it needs to."
for tool in node curl tar readlink; do
  command -v "$tool" > /dev/null || die "'$tool' is required but not installed."
done

# --- Find the current install -------------------------------------------------------------------

BIN="$(command -v live-stream-radio || true)"
[ -n "$BIN" ] || die "live-stream-radio is not on the PATH. Is it installed with npm install -g?"
ENTRY="$(readlink -f "$BIN")" # .../live-stream-radio/src/index.js
INSTALL_DIR="$(cd "$(dirname "$ENTRY")/.." && pwd)"
grep -q '"name": "live-stream-radio"' "$INSTALL_DIR/package.json" 2> /dev/null ||
  die "Found $BIN, but $INSTALL_DIR doesn't look like a live-stream-radio install."
OLD_VERSION="$(node -p "require('$INSTALL_DIR/package.json').version")"
if [ -f "$INSTALL_DIR/src/console/index.html" ]; then
  OLD_KIND="this fork (has the web console)"
else
  OLD_KIND="the original torch2424 release"
fi

SUDO=""
[ -w "$INSTALL_DIR" ] || SUDO="sudo"

# --- Check Node and ffmpeg ----------------------------------------------------------------------

NODE_VERSION="$(node -p 'process.versions.node')"
node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 8 || (a === 8 && b >= 3) ? 0 : 1)' ||
  die "Node $NODE_VERSION is too old, 8.3 or newer is needed."

# fluent-ffmpeg 2.1.2 can't read the format list of newer ffmpeg builds (6+), and then refuses
# to use flv / gif. Ask the installed copy directly rather than guessing from version numbers,
# which nightly builds (e.g. "N-57736-...") don't have.
FFMPEG_LINE="$(ffmpeg -version 2> /dev/null | head -n 1 || true)"
FLUENT_VERSION="$(node -p "require('$INSTALL_DIR/node_modules/fluent-ffmpeg/package.json').version" 2> /dev/null || echo none)"
NEED_FLUENT_UPGRADE=no
if [ -z "$FFMPEG_LINE" ]; then
  warn "ffmpeg isn't on the PATH here. If your config.json sets ffmpeg_path, that's fine."
elif ! (cd "$INSTALL_DIR" && node -e '
  require("fluent-ffmpeg")().getAvailableFormats((err, f) => process.exit(!err && f.flv && f.gif ? 0 : 1));
' 2> /dev/null); then
  NEED_FLUENT_UPGRADE=yes
fi

for service in ${SERVICES[@]+"${SERVICES[@]}"}; do
  systemctl cat "$service" > /dev/null 2>&1 || die "There is no systemd service called '$service'."
done

# --- Show the plan and ask ----------------------------------------------------------------------

BACKUP_DIR="$HOME/live-stream-radio-backup-$(date +%Y%m%d-%H%M%S)"

say "Found live-stream-radio $OLD_VERSION, $OLD_KIND"
echo "    install:  $INSTALL_DIR"
echo "    node:     $NODE_VERSION"
echo "    ffmpeg:   ${FFMPEG_LINE:-not on PATH}"
echo
echo "This will:"
echo "  1. Back up the install to $BACKUP_DIR"
echo "  2. Download $REPO ($BRANCH) from GitHub"
echo "  3. Replace $INSTALL_DIR/src (and README, proxy/, scripts/) with it"
if [ "$NEED_FLUENT_UPGRADE" = yes ]; then
  echo "  4. Update fluent-ffmpeg $FLUENT_VERSION -> 2.1.3, needed for your ffmpeg"
fi
if [ ${#SERVICES[@]} -gt 0 ]; then
  echo "  5. Restart: ${SERVICES[*]}"
else
  echo "  5. Restart nothing (no services given). Restart your stream yourself afterwards."
fi
echo
read -r -p "Continue? [y/N] " answer
[ "$answer" = "y" ] || [ "$answer" = "Y" ] || die "Cancelled, nothing was changed."

# --- Download ---------------------------------------------------------------------------------------

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

say "Downloading $REPO ($BRANCH)"
curl -fsSL "https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz" | tar xz -C "$TMP_DIR"
NEW_DIR="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
[ -f "$NEW_DIR/src/console/index.html" ] || die "The download doesn't look right, nothing was changed."

# Check the new code parses with this Node before touching anything
say "Checking the new code with Node $NODE_VERSION"
while IFS= read -r -d '' file; do
  node --check "$file" || die "$file doesn't run on Node $NODE_VERSION, nothing was changed."
done < <(find "$NEW_DIR/src" -name '*.js' -not -path '*/template/*' -print0)

# --- Back up and install ------------------------------------------------------------------------

say "Backing up to $BACKUP_DIR"
$SUDO cp -a "$INSTALL_DIR" "$BACKUP_DIR"

say "Installing"
$SUDO rm -rf "$INSTALL_DIR/src"
$SUDO cp -a "$NEW_DIR/src" "$INSTALL_DIR/src"
for item in README.md proxy scripts; do
  if [ -e "$NEW_DIR/$item" ]; then
    $SUDO rm -rf "${INSTALL_DIR:?}/$item"
    $SUDO cp -a "$NEW_DIR/$item" "$INSTALL_DIR/$item"
  fi
done
$SUDO chmod +x "$INSTALL_DIR/src/index.js"

if [ "$NEED_FLUENT_UPGRADE" = yes ]; then
  say "Updating fluent-ffmpeg to 2.1.3"
  command -v npm > /dev/null || die "npm is needed to update fluent-ffmpeg. Restore with the rollback steps below."
  # Install it on its own, then put it (with its own dependencies nested) into place,
  # so npm doesn't touch the rest of the install
  npm install --silent --no-save --no-package-lock --prefix "$TMP_DIR/ff" fluent-ffmpeg@2.1.3 > /dev/null
  $SUDO rm -rf "$INSTALL_DIR/node_modules/fluent-ffmpeg"
  $SUDO cp -a "$TMP_DIR/ff/node_modules/fluent-ffmpeg" "$INSTALL_DIR/node_modules/fluent-ffmpeg"
  $SUDO mkdir -p "$INSTALL_DIR/node_modules/fluent-ffmpeg/node_modules"
  for dep in "$TMP_DIR"/ff/node_modules/*; do
    [ "$(basename "$dep")" = "fluent-ffmpeg" ] && continue
    $SUDO cp -a "$dep" "$INSTALL_DIR/node_modules/fluent-ffmpeg/node_modules/"
  done
fi

# Quick check that it loads
live-stream-radio --version > /dev/null || die "The new install doesn't start. Roll back with the steps below."
node -e "require('$INSTALL_DIR/src/api/index.js')" ||
  die "The new install doesn't load. Roll back with the steps below."

# --- Restart ------------------------------------------------------------------------------------

FAILED=no
for service in ${SERVICES[@]+"${SERVICES[@]}"}; do
  say "Restarting $service"
  sudo systemctl restart "$service"
  sleep 8
  if systemctl is-active --quiet "$service"; then
    echo "    $service is running"
  else
    FAILED=yes
    warn "$service is not running. Its last log lines:"
    sudo journalctl -u "$service" -n 25 --no-pager || true
  fi
done

# --- Done ---------------------------------------------------------------------------------------

ROLLBACK="sudo rm -rf '$INSTALL_DIR' && sudo cp -a '$BACKUP_DIR' '$INSTALL_DIR'"
if [ ${#SERVICES[@]} -gt 0 ]; then
  ROLLBACK="$ROLLBACK && sudo systemctl restart ${SERVICES[*]}"
fi

if [ "$FAILED" = yes ]; then
  say "Updated, but a service didn't come back up. To roll back:"
else
  say "Done. To roll back if anything's wrong:"
fi
echo "    $ROLLBACK"
echo
echo "Next steps:"
echo "  - Add a web console user (in the folder you run the stream from):"
echo "      live-stream-radio --set-password <project folder>"
echo "  - Reach the console: see 'Reaching it from another computer' in"
echo "      $INSTALL_DIR/README.md  (SSH tunnel, or HTTPS with $INSTALL_DIR/proxy/)"
echo "  - Watch the stream log:  sudo journalctl -fu <service>"

[ "$FAILED" = no ]
