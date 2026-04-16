#!/bin/bash
# Weekly CourtListener scan for new immigration incidents
# Runs courtlistener-add-new.ts and logs output

export PATH="/opt/homebrew/bin:$PATH"
cd /Users/JNeusner/ice

LOG="/Users/JNeusner/ice/scripts/logs/courtlistener-$(date +%Y%m%d).log"
mkdir -p /Users/JNeusner/ice/scripts/logs

echo "=== CourtListener scan started $(date) ===" >> "$LOG"
npx tsx scripts/courtlistener-add-new.ts --limit 50 >> "$LOG" 2>&1
echo "=== Finished $(date) ===" >> "$LOG"
