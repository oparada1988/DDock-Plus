#!/usr/bin/env bash
# Helper script to capture gnome-shell and DDock-Plus logs across reboots

LOG_FILE="/home/oscar/DDock-Plus/gnome_shell_crash.log"

echo "=== GNOME Shell / DDock-Plus Crash Log Capture ===" > "$LOG_FILE"
echo "Captured at: $(date)" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

echo "--- Recent Boot (-1) Errors ---" >> "$LOG_FILE"
journalctl -b -1 -u gnome-shell --no-pager 2>/dev/null | grep -i -E "error|crash|exception|ddock|folderstack" >> "$LOG_FILE" || true
journalctl -b -1 --no-pager | grep -C 15 "folderStackBase.js" >> "$LOG_FILE" || true

echo "" >> "$LOG_FILE"
echo "--- Current Boot (0) Errors ---" >> "$LOG_FILE"
journalctl -b 0 --no-pager | grep -C 15 "folderStackBase.js" >> "$LOG_FILE" || true

echo "Log saved to $LOG_FILE"
