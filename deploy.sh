#!/bin/bash
set -e

echo "🚀 Minfy Claude Workshop - Deployment Script"
echo "=============================================="

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from template..."
    cp .env.example .env
    echo "✓ Created .env file"
    echo ""
    echo "⚠️  IMPORTANT: Edit .env and set secure values before deploying to production!"
    echo ""
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

echo "✓ Docker is running"

# Build and start services
echo ""
echo "📦 Building and starting services..."
docker-compose up -d --build

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 5

# Check backend health
echo "🔍 Checking backend health..."
for i in {1..30}; do
    if curl -s http://localhost:3002/health > /dev/null 2>&1; then
        echo "✓ Backend is healthy"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Backend failed to start. Check logs with: docker-compose logs backend"
        exit 1
    fi
    sleep 1
done

# Check frontend
echo "🔍 Checking frontend..."
if curl -s http://localhost:8080 > /dev/null 2>&1; then
    echo "✓ Frontend is accessible"
else
    echo "⚠️  Frontend may not be ready yet"
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📍 Access the workshop at: http://localhost:8080"
echo "📍 Backend API at: http://localhost:3002"
echo ""
echo "📊 View logs: docker-compose logs -f"
echo "🛑 Stop services: docker-compose down"
echo ""
