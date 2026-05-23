#!/usr/bin/env bash
# Runner untuk semua POC #37-#40 — pakai untuk validate di Linux
# Usage: bash scripts/poc/pm/run-all.sh
# Output dibuang ke /tmp/poc-report-<timestamp>.txt + tampil di terminal

set -u

POC_DIR="$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")"
REPORT="/tmp/poc-report-$(date +%Y%m%d-%H%M%S).txt"

exec > >(tee "$REPORT") 2>&1

echo "==================================================================="
echo "envman pm — Phase 0 POC validation"
echo "==================================================================="
echo "Date    : $(date)"
echo "Host    : $(uname -srm)"
echo "Kernel  : $(uname -v 2>/dev/null | head -c 80)"
echo "Bun     : $(bun --version 2>/dev/null || echo NOT_INSTALLED)"
echo "User    : $(id)"
echo "Report  : $REPORT"
echo

# Cleanup
rm -f /tmp/poc37-* /tmp/poc38-* /tmp/poc39-* /tmp/poc40-*

cd "$POC_DIR"

echo "==================================================================="
echo "POC #37 — Bun.spawn detached"
echo "==================================================================="
for MODE in unref detached; do
  rm -f /tmp/poc37-child.pid
  echo "--- mode=$MODE ---"
  POC_MODE=$MODE bun 37-spawn-detached.ts
  sleep 1
  PID=$(cat /tmp/poc37-child.pid 2>/dev/null || echo "")
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    echo "  ✓ child PID=$PID alive after parent exit"
    PARENT=$(ps -o ppid= -p "$PID" 2>/dev/null | tr -d ' ')
    PGID=$(ps -o pgid= -p "$PID" 2>/dev/null | tr -d ' ')
    SID=$(ps -o sess= -p "$PID" 2>/dev/null | tr -d ' ')
    TTY=$(ps -o tty= -p "$PID" 2>/dev/null | tr -d ' ')
    echo "  PARENT=$PARENT PGID=$PGID SID=$SID TTY=$TTY"
    kill "$PID" 2>/dev/null
  else
    echo "  ✗ child DEAD or not found"
  fi
done

echo
echo "==================================================================="
echo "POC #38 — Socket + flock"
echo "==================================================================="
POC_ACTION=bind bun 38-socket-flock.ts
echo
POC_ACTION=alive bun 38-socket-flock.ts
echo
POC_ACTION=concurrent bun 38-socket-flock.ts

echo
echo "==================================================================="
echo "POC #39 — SO_PEERCRED"
echo "==================================================================="
POC_ACTION=bun bun 39-peercred.ts
echo
POC_ACTION=node bun 39-peercred.ts
echo
POC_ACTION=perm bun 39-peercred.ts

echo
echo "==================================================================="
echo "POC #40 — fs.watch reliability"
echo "==================================================================="
POC_ACTION=all bun 40-fs-watch.ts

echo
echo "==================================================================="
echo "DONE — laporan lengkap di $REPORT"
echo "==================================================================="

# Cleanup final
for pid in $(pgrep -f "sleep 60" 2>/dev/null); do
  PARENT=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
  [ "$PARENT" = "1" ] && kill "$pid" 2>/dev/null
done
rm -f /tmp/poc37-* /tmp/poc38-* /tmp/poc39-* /tmp/poc40-*
