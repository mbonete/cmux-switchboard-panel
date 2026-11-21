#!/bin/sh
# Switchboard: a Claude Code Stop hook that resends turn-ends cmux lost.
#
# https://github.com/mbonete/cmux-switchboard-panel
#
# cmux now and then loses the end of a turn and keeps showing the agent as working until your next
# prompt, in its own sidebar and in the Switchboard panel. At the end of each turn this hook checks
# that cmux recorded it, and sends it again if not. Outside cmux it does nothing. It usually returns
# in well under a second, and after about 2 seconds when cmux is slow to record the end of a turn.
#
# Install: see "Optional: the Stop hook" in the README.

[ -n "$CMUX_WORKSPACE_ID" ] || exit 0
CMUX=${CMUX_CLAUDE_HOOK_CMUX_BIN:-${CMUX_BUNDLED_CLI_PATH:-cmux}}
command -v "$CMUX" >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)

# cmux keeps its record of each Claude session in this file, and sets turnSettled once it has
# handled the end of the turn. Its own Stop hook runs alongside this one, so give it 2 seconds, then
# send the end of the turn again with the command cmux's hook falls back to. If the file or the field
# isn't there (a different cmux version), do nothing.
SESSIONS="$HOME/.cmuxterm/claude-hook-sessions.json"
session=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)
[ -n "$session" ] && [ -f "$SESSIONS" ] || exit 0

tries=0
while :; do
  settled=$(jq -r --arg s "$session" '.sessions[$s].turnSettled | if . == null then "unknown" end' "$SESSIONS" 2>/dev/null)
  case "$settled" in false | "") ;; *) break ;; esac
  [ "$tries" -lt 8 ] || break
  sleep 0.25
  tries=$((tries + 1))
done
if [ "$settled" = "false" ]; then
  printf '%s' "$input" | CMUXTERM_CLI_RESPONSE_TIMEOUT_SEC=2 "$CMUX" hooks enqueue claude stop >/dev/null 2>&1
fi
exit 0
