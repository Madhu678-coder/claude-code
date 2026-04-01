#!/bin/bash
# ─────────────────────────────────────────────
# Auto-startup script: Updates DNS + starts containers on every boot
# No SSH needed — runs automatically via systemd
# ─────────────────────────────────────────────

LOG_FILE="/var/log/workshop-boot.log"
touch "$LOG_FILE" 2>/dev/null || { LOG_FILE="/tmp/workshop-boot.log"; touch "$LOG_FILE"; }
exec >> "$LOG_FILE" 2>&1
echo "=========================================="
echo "Boot startup: $(date)"
echo "=========================================="

# ── Config ──
HOSTED_ZONE_ID="Z00865952G1GD0PSDTVCN"       # <-- Replace with your Route53 Hosted Zone ID
RECORD_NAME="claude-workshop.coebuilds.swayam.ai"
APP_DIR="/home/ec2-user/workshop"

# ── Wait for network ──
echo "Waiting for network..."
for i in $(seq 1 30); do
  # IMDSv2 requires a token first
  TOKEN=$(curl -s --max-time 2 -X PUT "http://169.254.169.254/latest/api/token" \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 300" 2>/dev/null)
  if [ -n "$TOKEN" ]; then
    PUBLIC_IP=$(curl -s --max-time 5 -H "X-aws-ec2-metadata-token: $TOKEN" \
      http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null)
  else
    # Fallback to IMDSv1
    PUBLIC_IP=$(curl -s --max-time 5 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null)
  fi
  if [ -n "$PUBLIC_IP" ] && [[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Got public IP: $PUBLIC_IP"
    break
  fi
  echo "Retry $i/30..."
  sleep 2
done

if [ -z "$PUBLIC_IP" ]; then
  echo "ERROR: Could not get public IP after 60s"
  exit 1
fi

# ── Update Route53 DNS ──
echo "Updating DNS: $RECORD_NAME -> $PUBLIC_IP"
aws route53 change-resource-record-sets \
  --hosted-zone-id "$HOSTED_ZONE_ID" \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "'"$RECORD_NAME"'",
        "Type": "A",
        "TTL": 60,
        "ResourceRecords": [{"Value": "'"$PUBLIC_IP"'"}]
      }
    }]
  }'

if [ $? -eq 0 ]; then
  echo "DNS updated successfully"
else
  echo "WARNING: DNS update failed — check IAM permissions"
fi

# ── Start Docker containers ──
echo "Starting Docker containers..."
cd "$APP_DIR"
docker compose up -d --build

# ── Wait for backend health ──
echo "Waiting for backend..."
for i in $(seq 1 30); do
  if curl -s http://localhost:3002/health > /dev/null 2>&1; then
    echo "Backend is healthy"
    break
  fi
  sleep 2
done

echo "Boot startup complete at $(date)"
