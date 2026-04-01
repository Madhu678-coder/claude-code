#!/bin/bash
set -e

# ─────────────────────────────────────────────
# Minfy Workshop — EC2 Deploy Script
# Run this ON the EC2 instance after SSH-ing in
# ─────────────────────────────────────────────

echo "🚀 Minfy Workshop — EC2 Setup"
echo "=============================="

# 1. Install Docker
if ! command -v docker &> /dev/null; then
  echo "📦 Installing Docker..."
  sudo dnf update -y
  sudo dnf install -y docker git
  sudo systemctl start docker
  sudo systemctl enable docker
  sudo usermod -aG docker $USER
  echo "✅ Docker installed. You need to re-login for group changes."
  echo "   Run: exit, SSH back in, then run this script again."
  exit 0
fi

# 2. Install Docker Compose plugin
if ! docker compose version &> /dev/null; then
  echo "📦 Installing Docker Compose..."
  sudo mkdir -p /usr/local/lib/docker/cli-plugins
  sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  echo "✅ Docker Compose installed"
fi

echo "✅ Docker $(docker --version | cut -d' ' -f3)"
echo "✅ $(docker compose version)"

# 3. Create .env if it doesn't exist
if [ ! -f .env ]; then
  JWT_SECRET=$(openssl rand -hex 32)
  cat > .env << EOF
JWT_SECRET=${JWT_SECRET}
ADMIN_PASSWORD=MINFY2026
EOF
  echo "✅ Created .env with secure JWT secret"
else
  echo "✅ .env already exists"
fi

# 4. Build and start
echo ""
echo "📦 Building and starting services..."
docker compose up -d --build

# 5. Wait for health
echo "⏳ Waiting for services..."
for i in $(seq 1 30); do
  if curl -s http://localhost:3002/health > /dev/null 2>&1; then
    echo "✅ Backend is healthy"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "❌ Backend failed to start. Check: docker compose logs backend"
    exit 1
  fi
  sleep 2
done

if curl -s http://localhost > /dev/null 2>&1; then
  echo "✅ Frontend is accessible"
fi

# Get public IP
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "<your-ec2-ip>")

echo ""
echo "════════════════════════════════════════"
echo "✅ Deployment complete!"
echo ""
echo "🌐 Workshop URL: http://${PUBLIC_IP}"
echo "🔧 Backend API:  http://${PUBLIC_IP}/api/health"
echo "🔑 Admin pass:   MINFY2026"
echo ""
echo "📊 Logs:  docker compose logs -f"
echo "🛑 Stop:  docker compose down"
echo "════════════════════════════════════════"
