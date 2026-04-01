import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import jwt from 'jsonwebtoken';
import pg from 'pg';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'MINFY2026';

app.use(cors());
app.use(express.json());

// Valid workshop codes
const VALID_WORKSHOP_CODES = ['MINFY2026', 'AICOEWORKSHOP', 'MINFY', 'DEMO'];

// Database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// SSE: track connected clients per workshop code
const sseClients = new Map(); // workshopCode -> Set of response objects

function addSSEClient(workshopCode, res) {
  const code = workshopCode.toUpperCase();
  if (!sseClients.has(code)) sseClients.set(code, new Set());
  sseClients.get(code).add(res);
  res.on('close', () => {
    sseClients.get(code)?.delete(res);
    if (sseClients.get(code)?.size === 0) sseClients.delete(code);
  });
}

async function broadcastLeaderboard(workshopCode) {
  const code = workshopCode.toUpperCase();
  const clients = sseClients.get(code);
  if (!clients || clients.size === 0) return;
  try {
    const result = await pool.query(
      `SELECT name, total_points, completed_tasks 
       FROM participants 
       WHERE workshop_code = $1 
       ORDER BY total_points DESC, updated_at ASC`,
      [code]
    );
    const data = JSON.stringify(result.rows);
    for (const client of clients) {
      client.write(`data: ${data}\n\n`);
    }
  } catch (err) {
    console.error('SSE broadcast error:', err);
  }
}

// Initialize database
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS participants (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        workshop_code VARCHAR(50) NOT NULL,
        total_points INTEGER DEFAULT 0,
        completed_tasks TEXT[] DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(name, workshop_code)
      );
      CREATE INDEX IF NOT EXISTS idx_workshop_code ON participants(workshop_code);
    `);
    console.log('✓ Database initialized');
  } finally {
    client.release();
  }
}

// Auth middleware
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Routes
app.post('/api/auth/login', async (req, res) => {
  const { name, workshopCode } = req.body;
  
  if (!name || !workshopCode) {
    return res.status(400).json({ error: 'Name and workshop code required' });
  }

  if (!VALID_WORKSHOP_CODES.includes(workshopCode.toUpperCase())) {
    return res.status(400).json({ error: 'Invalid workshop code. Ask your facilitator.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO participants (name, workshop_code) 
       VALUES ($1, $2) 
       ON CONFLICT (name, workshop_code) 
       DO UPDATE SET updated_at = NOW()
       RETURNING id, name, workshop_code, total_points, completed_tasks`,
      [name, workshopCode.toUpperCase()]
    );

    const participant = result.rows[0];
    const token = jwt.sign(
      { id: participant.id, name: participant.name, workshopCode: participant.workshop_code },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        name: participant.name,
        workshopCode: participant.workshop_code,
        totalPoints: participant.total_points,
        completedTasks: participant.completed_tasks
      }
    });

    // Broadcast — a new participant may have joined
    broadcastLeaderboard(participant.workshop_code);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/admin', (req, res) => {
  const { password } = req.body;
  
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = jwt.sign(
    { isAdmin: true },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token, isAdmin: true });
});

app.get('/api/participant', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT name, workshop_code, total_points, completed_tasks FROM participants WHERE id = $1',
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get participant error:', error);
    res.status(500).json({ error: 'Failed to fetch participant' });
  }
});

app.post('/api/participant/complete-task', authMiddleware, async (req, res) => {
  const { taskId, points } = req.body;
  
  try {
    const result = await pool.query(
      `UPDATE participants 
       SET completed_tasks = array_append(completed_tasks, $1),
           total_points = total_points + $2,
           updated_at = NOW()
       WHERE id = $3 AND NOT ($1 = ANY(completed_tasks))
       RETURNING total_points, completed_tasks`,
      [taskId, points, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Task already completed or user not found' });
    }

    // Broadcast updated leaderboard to all SSE clients
    broadcastLeaderboard(req.user.workshopCode);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({ error: 'Failed to complete task' });
  }
});
app.get('/api/leaderboard/:workshopCode', async (req, res) => {
  const { workshopCode } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT name, total_points, completed_tasks 
       FROM participants 
       WHERE workshop_code = $1 
       ORDER BY total_points DESC, updated_at ASC`,
      [workshopCode.toUpperCase()]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

app.get('/api/admin/stats/:workshopCode', authMiddleware, async (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { workshopCode } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT 
        COUNT(*) as total_participants,
        COALESCE(SUM(total_points), 0) as total_points,
        COALESCE(AVG(total_points), 0) as avg_points
       FROM participants 
       WHERE workshop_code = $1`,
      [workshopCode.toUpperCase()]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.delete('/api/admin/reset/:workshopCode', authMiddleware, async (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { workshopCode } = req.params;
  
  try {
    await pool.query(
      'DELETE FROM participants WHERE workshop_code = $1',
      [workshopCode.toUpperCase()]
    );

    // Broadcast empty leaderboard after reset
    broadcastLeaderboard(workshopCode);

    res.json({ success: true });
  } catch (error) {
    console.error('Reset error:', error);
    res.status(500).json({ error: 'Failed to reset workshop' });
  }
});

// SSE endpoint for real-time leaderboard updates
app.get('/api/leaderboard/:workshopCode/stream', async (req, res) => {
  const { workshopCode } = req.params;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Send initial leaderboard data to this client
  try {
    const result = await pool.query(
      `SELECT name, total_points, completed_tasks 
       FROM participants 
       WHERE workshop_code = $1 
       ORDER BY total_points DESC, updated_at ASC`,
      [workshopCode.toUpperCase()]
    );
    res.write(`data: ${JSON.stringify(result.rows)}\n\n`);
  } catch (err) {
    console.error('SSE initial data error:', err);
  }

  // Register this client for future broadcasts
  addSSEClient(workshopCode, res);

  // Keep-alive every 30s to prevent proxy/browser timeout
  const keepAlive = setInterval(() => res.write(': keepalive\n\n'), 30000);
  res.on('close', () => clearInterval(keepAlive));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Workshop API running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
