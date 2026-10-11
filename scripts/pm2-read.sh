#!/usr/bin/env bash
# Install root-owned at /usr/local/libexec/system-ops/pm2-read.
set -euo pipefail
[[ $# -ge 2 && $# -le 6 ]] || { echo 'Invalid PM2 helper arguments' >&2; exit 2; }
TASK_USER="$1"; TASK_ACTION="$2"
[[ "$TASK_USER" =~ ^[a-zA-Z0-9_-]{1,64}$ ]] || exit 2
TASK_CONFIG=/etc/system-ops/pm2-monitor.conf
[[ -f "$TASK_CONFIG" && $(stat -c %u "$TASK_CONFIG") == 0 ]] || { echo 'Configure root-owned /etc/system-ops/pm2-monitor.conf' >&2; exit 1; }
TASK_MODE="$(stat -c %a "$TASK_CONFIG")"
(( (8#$TASK_MODE & 8#022) == 0 )) || { echo 'PM2 helper configuration must not be group/world writable' >&2; exit 1; }
TASK_HOME=''; TASK_BINARY=''; TASK_NODE_DIR=''
while IFS='|' read -r TASK_ACCOUNT TASK_ACCOUNT_HOME TASK_ACCOUNT_BINARY TASK_ACCOUNT_NODE; do
  if [[ "$TASK_ACCOUNT" == "$TASK_USER" ]]; then
    TASK_HOME="$TASK_ACCOUNT_HOME"; TASK_BINARY="$TASK_ACCOUNT_BINARY"; TASK_NODE_DIR="$TASK_ACCOUNT_NODE"; break
  fi
done < "$TASK_CONFIG"
[[ "$TASK_HOME" == /* && "$TASK_BINARY" == /* && "$TASK_NODE_DIR" == /* ]] || { echo 'User is not configured in PM2 helper' >&2; exit 1; }
case "$TASK_ACTION" in
  probe) [[ $# == 2 ]]; exec /usr/sbin/runuser -u "$TASK_USER" -- /usr/bin/test -S "$TASK_HOME/rpc.sock" ;;
  binary) [[ $# == 2 ]]; printf '%s\n' "$TASK_BINARY"; exit 0 ;;
  jlist) [[ $# == 2 ]]; set -- jlist ;;
  logs)
    [[ $# == 6 && "$3" =~ ^[0-9]+$ && "$4" == --nostream && "$5" == --lines && "$6" =~ ^[0-9]+$ && "$6" -ge 1 && "$6" -le 1000 ]] || exit 2
    set -- logs "$3" --nostream --lines "$6" ;;
  *) echo 'Unsupported PM2 helper action' >&2; exit 2 ;;
esac
/usr/sbin/runuser -u "$TASK_USER" -- /usr/bin/test -S "$TASK_HOME/rpc.sock" || { echo 'PM2 daemon absent or inaccessible' >&2; exit 1; }
exec /usr/sbin/runuser -u "$TASK_USER" -- /usr/bin/env "PATH=$TASK_NODE_DIR:/usr/bin:/bin" "PM2_HOME=$TASK_HOME" "$TASK_BINARY" "$@"
