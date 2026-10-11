#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(pwd)"
TASK_DIR="$(mktemp -d -t system-ops-pm2-XXXXXX)"
TASK_USER="$(id -un)"
TASK_NODE_DIR="$(dirname "$(command -v node)")"
cleanup() {
  PM2_HOME="$TASK_DIR/own" "$TASK_DIR/node_modules/.bin/pm2" kill >/dev/null 2>&1 || true
  sudo env "PATH=$TASK_NODE_DIR:/usr/bin:/bin" "PM2_HOME=$TASK_DIR/root" "$TASK_DIR/node_modules/.bin/pm2" kill >/dev/null 2>&1 || true
}
trap cleanup EXIT
npm install --prefix "$TASK_DIR" --no-package-lock pm2@7.0.4
printf 'console.log("fixture-one"); setInterval(()=>{},1000);\n' > "$TASK_DIR/one.js"
printf 'console.log("fixture-two"); setInterval(()=>{},1000);\n' > "$TASK_DIR/two.js"
printf 'console.log("fixture-root"); setInterval(()=>{},1000);\n' > "$TASK_DIR/root.js"
PM2_HOME="$TASK_DIR/own" "$TASK_DIR/node_modules/.bin/pm2" start "$TASK_DIR/one.js" --name duplicate
PM2_HOME="$TASK_DIR/own" "$TASK_DIR/node_modules/.bin/pm2" start "$TASK_DIR/two.js" --name duplicate
sudo env "PATH=$TASK_NODE_DIR:/usr/bin:/bin" "PM2_HOME=$TASK_DIR/root" "$TASK_DIR/node_modules/.bin/pm2" start "$TASK_DIR/root.js" --name root-app
sudo install -d -m 755 /usr/local/libexec/system-ops /etc/system-ops
sudo install -o root -g root -m 755 scripts/pm2-read.sh /usr/local/libexec/system-ops/pm2-read
printf 'root|%s/root|%s/node_modules/.bin/pm2|%s\n' "$TASK_DIR" "$TASK_DIR" "$TASK_NODE_DIR" | sudo tee /etc/system-ops/pm2-monitor.conf >/dev/null
sudo chmod 644 /etc/system-ops/pm2-monitor.conf
# A path lookup must exit after printing the path, without invoking the CLI.
TASK_RESOLVED="$(sudo /usr/local/libexec/system-ops/pm2-read root binary)"
[[ "$TASK_RESOLVED" == "$TASK_DIR/node_modules/.bin/pm2" ]]
PM2_HOME="$TASK_DIR/own" PM2_USERS="$TASK_USER,root,missing-fixture-user" PM2_PATH="$TASK_DIR/node_modules/.bin/pm2" \
  PM2_HOME_ROOT="$TASK_DIR/root" PM2_FIXTURE_PATH="$TASK_DIR/node_modules/.bin/pm2" node scripts/pm2-fixture.js
# The privileged helper must reject mutations and caller-selected paths.
if sudo /usr/local/libexec/system-ops/pm2-read root delete all; then echo 'Mutation unexpectedly allowed'; exit 1; fi
