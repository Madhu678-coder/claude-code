# Deployment Guide

## Architecture Overview

```
┌─────────────────┐
│  Nginx (8080)   │  ← Frontend (minfy-claude-workshop.html)
│  Reverse Proxy  │
└────────┬────────┘
         │ /api/* → backend
         ↓
┌─────────────────┐
│ Express (3002)  │  ← REST API + JWT Auth
└────────┬────────┘
         ↓
┌─────────────────┐
│ PostgreSQL      │  ← Participant data
│    (5433)       │
└─────────────────┘
```

## Setup Steps

### 1. Create environment file
```bash
cp .env.example .env
# Edit .env and set secure values for production
```

### 2. Update the HTML file

You need to integrate the API client into `minfy-claude-workshop.html`:

**Option A: Manual integration**
1. Open `minfy-claude-workshop.html`
2. Find the `DB` object (around line 1340)
3. Replace it with the `API` object from `frontend-api-integration.js`
4. Replace the `App.init()`, `App.login()`, `App.adminLogin()`, `App.toggleTask()`, and `App.renderLeaderboard()` methods with the versions in `frontend-api-integration.js`

**Option B: Use Claude Code**
```
Update minfy-claude-workshop.html to use the backend API instead of localStorage.
Reference @frontend-api-integration.js for the implementation.

Changes needed:
1. Replace the DB object with the API client from frontend-api-integration.js
2. Update App.init() to use async/await and API.getParticipant()
3. Update App.login() to call API.login()
4. Update App.adminLogin() to call API.adminLogin()
5. Update App.toggleTask() to call API.completeTask()
6. Update App.renderLeaderboard() to call API.getLeaderboard()
7. Update admin functions to use API methods
8. Keep the same UI/UX, just swap the data layer
```

### 3. Start the services
```bash
docker-compose up -d
```

### 4. Check logs
```bash
docker-compose logs -f
```

### 5. Access the app
```
http://localhost:8080
```

## Testing

### Test participant login
1. Go to http://localhost:8080
2. Enter name: "Test User"
3. Enter code: "MINFY2026"
4. Complete a task
5. Check leaderboard

### Test admin access
1. Click "Admin access"
2. Password: `MINFY2026` (or your custom value from .env)
3. View stats and manage workshop

## Production Deployment

### AWS ECS/Fargate
1. Push images to ECR
2. Create ECS task definitions for backend + nginx
3. Use RDS PostgreSQL for database
4. Set environment variables in ECS task definition

### Docker Swarm
```bash
docker stack deploy -c docker-compose.yml workshop
```

### Kubernetes
Create deployments for:
- `backend` (with DATABASE_URL secret)
- `frontend` (nginx)
- `postgres` (with persistent volume)

## Database Backup

```bash
# Backup
docker-compose exec db pg_dump -U workshop workshop > backup.sql

# Restore
docker-compose exec -T db psql -U workshop workshop < backup.sql
```

## Troubleshooting

### Backend won't start
```bash
docker-compose logs backend
```

### Database connection issues
```bash
docker-compose exec backend sh
# Inside container:
nc -zv db 5432
```

### Reset everything
```bash
docker-compose down -v
docker-compose up -d
```

## Security Notes

- Change `JWT_SECRET` in production
- Change `ADMIN_PASSWORD` in production
- Use HTTPS in production (add SSL termination at nginx or load balancer)
- Consider rate limiting for API endpoints
- Add CORS whitelist for production domains
