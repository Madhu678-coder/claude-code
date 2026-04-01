#!/bin/bash
# ─────────────────────────────────────────────
# Run this ONCE on your EC2 instance to install the auto-boot service
# After this, everything is automatic on every start/stop cycle
# ─────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing boot startup service..."

# Create log file with proper permissions
sudo touch /var/log/workshop-boot.log
sudo chown ec2-user:ec2-user /var/log/workshop-boot.log

# Copy the boot script
sudo cp "$SCRIPT_DIR/boot-startup.sh" /usr/local/bin/workshop-boot.sh
sudo chmod +x /usr/local/bin/workshop-boot.sh

# Create systemd service
sudo tee /etc/systemd/system/workshop-boot.service > /dev/null <<EOF
[Unit]
Description=Workshop DNS Update + Docker Startup
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/workshop-boot.sh
RemainAfterExit=yes
User=ec2-user

[Install]
WantedBy=multi-user.target
EOF

# Enable the service
sudo systemctl daemon-reload
sudo systemctl enable workshop-boot.service

echo ""
echo "✅ Service installed and enabled!"
echo ""
echo "Before rebooting, make sure you:"
echo "  1. Edit /usr/local/bin/workshop-boot.sh"
echo "     - Set HOSTED_ZONE_ID to your Route53 zone ID"
echo "     - Set APP_DIR to your project directory path"
echo ""
echo "  2. Ensure your EC2 instance has an IAM role with Route53 permissions:"
echo "     - route53:ChangeResourceRecordSets"
echo "     - route53:ListHostedZones"
echo ""
echo "Test it manually:  sudo systemctl start workshop-boot.service"
echo "Check logs:        cat /var/log/workshop-boot.log"
echo "Check status:      sudo systemctl status workshop-boot.service"
