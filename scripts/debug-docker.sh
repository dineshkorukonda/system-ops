#!/usr/bin/env bash
#
# Docker connectivity & permission diagnostics for system-ops
# Run: sudo bash /opt/system-ops/scripts/debug-docker.sh
#

set -euo pipefail

INSTALL_DIR="/opt/system-ops"
OPS_USER="ops"
DOCKER_SOCKET="/var/run/docker.sock"
API_URL="http://127.0.0.1:9080"
PASS=0
FAIL=0
WARN=0

ok()   { echo "  [OK]   $1"; PASS=$((PASS + 1)); }
fail() { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }
warn() { echo "  [WARN] $1"; WARN=$((WARN + 1)); }

section() {
  echo ""
  echo "================================================="
  echo "  $1"
  echo "================================================="
}

section "Docker Binary & Socket"

if command -v docker &>/dev/null; then
  ok "docker binary found: $(command -v docker)"
  docker --version 2>/dev/null | sed 's/^/         /' || true
else
  fail "docker binary not found in PATH"
fi

if [ -S "$DOCKER_SOCKET" ]; then
  ok "Docker socket exists: $DOCKER_SOCKET"
  ls -la "$DOCKER_SOCKET" | sed 's/^/         /'
else
  fail "Docker socket not found at $DOCKER_SOCKET"
fi

section "Permission Checks (ops user)"

if id "$OPS_USER" &>/dev/null; then
  ok "ops user exists (uid=$(id -u "$OPS_USER"))"
  GROUPS=$(groups "$OPS_USER" 2>/dev/null || echo "unknown")
  echo "         groups: $GROUPS"
  if echo "$GROUPS" | grep -q docker; then
    ok "ops is in docker group"
  else
    warn "ops is NOT in docker group — docker commands may require sudo"
    echo "         fix: sudo usermod -aG docker $OPS_USER && sudo systemctl restart system-ops.service"
  fi
else
  warn "ops user not found — skipping user-level checks"
fi

section "Docker CLI as root"

if docker ps -a --format '{{.ID}} {{.Names}} {{.State}}' 2>/dev/null | head -5; then
  ok "docker ps -a works as root"
else
  fail "docker ps -a failed as root"
  docker ps -a 2>&1 | head -3 | sed 's/^/         /' || true
fi

CONTAINER_COUNT=$(docker ps -a -q 2>/dev/null | wc -l | tr -d ' ')
ok "containers found: $CONTAINER_COUNT"

section "Docker Networks as root"

if docker network ls --format '{{.ID}} {{.Name}} {{.Driver}}' 2>/dev/null; then
  ok "docker network ls works as root"
else
  fail "docker network ls failed as root"
fi

NETWORK_COUNT=$(docker network ls -q 2>/dev/null | wc -l | tr -d ' ')
ok "networks found: $NETWORK_COUNT"

section "Docker CLI as ops user (no sudo)"

if id "$OPS_USER" &>/dev/null; then
  OPS_PS=$(sudo -u "$OPS_USER" docker ps -q 2>&1 || true)
  if echo "$OPS_PS" | grep -qi "permission denied\|cannot connect"; then
    warn "ops cannot run docker directly (permission denied)"
  elif [ -n "$OPS_PS" ] || docker ps -q &>/dev/null; then
    ok "ops can run docker ps directly"
  else
    ok "ops docker ps returned empty (daemon reachable, no running containers)"
  fi
fi

section "Docker CLI as ops user (with sudo)"

if id "$OPS_USER" &>/dev/null; then
  if sudo -u "$OPS_USER" sudo docker ps -q &>/dev/null; then
    ok "ops can run sudo docker ps (sudoers fallback)"
  else
    fail "ops cannot run sudo docker ps — check /etc/sudoers.d/system-ops"
  fi
fi

section "system-ops API Endpoints"

if curl -sf "$API_URL/health" &>/dev/null; then
  ok "system-ops health endpoint reachable"
else
  fail "system-ops not reachable at $API_URL/health"
  echo "         fix: sudo systemctl status system-ops.service"
fi

# Capabilities endpoint requires auth — test with .env password if available
if [ -f "$INSTALL_DIR/.env" ]; then
  APP_PASS=$(grep '^APP_PASSWORD=' "$INSTALL_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  if [ -n "$APP_PASS" ]; then
    CAPS=$(curl -sf -u ":$APP_PASS" "$API_URL/api/v2/system/capabilities" 2>/dev/null || true)
    if [ -n "$CAPS" ]; then
      DOCKER_AVAIL=$(echo "$CAPS" | grep -o '"docker":{[^}]*}' | head -1 || true)
      echo "         capabilities.docker: $DOCKER_AVAIL"
      if echo "$CAPS" | grep -q '"available":true'; then
        ok "API reports docker capability available"
      else
        warn "API reports docker capability unavailable"
      fi
    else
      warn "Could not fetch /api/v2/system/capabilities (auth may be required)"
    fi

    SNAP=$(curl -sf -u ":$APP_PASS" "$API_URL/api/v2/docker/snapshot" 2>/dev/null || true)
    if [ -n "$SNAP" ]; then
      SNAP_TOTAL=$(echo "$SNAP" | grep -o '"total":[0-9]*' | head -1 || echo '"total":?')
      SNAP_NETS=$(echo "$SNAP" | grep -o '"networkCount":[0-9]*' | head -1 || echo '"networkCount":?')
      echo "         docker/snapshot: $SNAP_TOTAL, $SNAP_NETS"
      if echo "$SNAP" | grep -q '"daemonReachable":true'; then
        ok "API docker snapshot: daemon reachable"
      elif echo "$SNAP" | grep -q '"permissionIssue":true'; then
        warn "API docker snapshot: permission issue detected"
      else
        fail "API docker snapshot: daemon not reachable"
      fi
    else
      warn "Could not fetch /api/v2/docker/snapshot"
    fi
  fi
fi

section "Node.js Collector Test (in-process)"

if [ -f "$INSTALL_DIR/src/collectors/docker.js" ]; then
  SNAP_JSON=$(cd "$INSTALL_DIR" && node -e "
    const { getDockerSnapshot } = require('./src/collectors/docker');
    getDockerSnapshot().then(s => {
      console.log(JSON.stringify({
        available: s.available,
        daemonReachable: s.daemonReachable,
        permissionIssue: s.permissionIssue,
        total: s.total,
        networkCount: s.networkCount,
        error: s.error,
        usedSudo: s.usedSudo
      }));
    }).catch(e => console.log(JSON.stringify({error: e.message})));
  " 2>/dev/null || true)

  if [ -n "$SNAP_JSON" ]; then
    echo "         collector result: $SNAP_JSON"
    if echo "$SNAP_JSON" | grep -q '"daemonReachable":true'; then
      ok "Node collector can reach Docker daemon"
    elif echo "$SNAP_JSON" | grep -q '"permissionIssue":true'; then
      warn "Node collector hit permission issue — add ops to docker group"
    else
      fail "Node collector cannot reach Docker daemon"
    fi
  else
    warn "Could not run in-process collector test"
  fi
fi

section "Summary"
echo ""
echo "  Passed:  $PASS"
echo "  Failed:  $FAIL"
echo "  Warnings:$WARN"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "  ACTION REQUIRED: Fix failed checks above."
  echo ""
  echo "  Common fixes:"
  echo "    sudo usermod -aG docker $OPS_USER"
  echo "    sudo systemctl restart system-ops.service"
  echo "    sudo systemctl restart docker"
  exit 1
fi

if [ "$WARN" -gt 0 ]; then
  echo "  Docker is partially working. Review warnings above."
  exit 0
fi

echo "  All Docker checks passed."
exit 0
