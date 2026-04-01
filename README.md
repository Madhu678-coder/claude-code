# Minfy Claude Workshop

Internal workshop application for Claude Code training with Docker deployment.

## Architecture

- **Frontend**: Single HTML file (minfy-claude-workshop.html)
- **Backend**: Node.js/Express API
- **Database**: PostgreSQL
- **Auth**: JWT tokens
- **Deployment**: Docker Compose

## Quick Start

1. Copy environment file:
```bash
cp .env.example .env
```

2. Start all services:
```bash
docker-compose up -d
```

3. Access the workshop:
```
http://localhost:8080
```

## Services

- Frontend: `http://localhost:8080`
- Backend API: `http://localhost:3002`
- Database: `localhost:5433`

## Configuration

Edit `.env` to customize:
- `JWT_SECRET` - Token signing key
- `ADMIN_PASSWORD` - Admin access password

## Deployment

### Local Development
```bash
docker-compose up
```

### Production
```bash
docker-compose -f docker-compose.yml up -d
```

## Database Schema

```sql
participants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  workshop_code VARCHAR(50),
  total_points INTEGER,
  completed_tasks TEXT[],
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

## API Endpoints

- `POST /api/auth/login` - Participant login
- `POST /api/auth/admin` - Admin login
- `GET /api/participant` - Get current user data
- `POST /api/participant/complete-task` - Mark task complete
- `GET /api/leaderboard/:workshopCode` - Get leaderboard
- `GET /api/admin/stats/:workshopCode` - Admin stats
- `DELETE /api/admin/reset/:workshopCode` - Reset workshop data

## Stopping Services

```bash
docker-compose down
```

To remove data volumes:
```bash
docker-compose down -v
```
