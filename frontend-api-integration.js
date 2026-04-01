// API Integration Layer for minfy-claude-workshop.html
// Replace the DB object and update App methods with these implementations

const API_BASE = window.location.origin.includes('localhost') 
  ? 'http://localhost:3002/api' 
  : '/api';

// Replace the DB object with this API client
const API = {
  token: null,

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  },

  getToken() {
    if (!this.token) {
      this.token = localStorage.getItem('auth_token');
    }
    return this.token;
  },

  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers
    };

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  },

  async login(name, workshopCode) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ name, workshopCode })
    });
    this.setToken(data.token);
    return data.user;
  },

  async adminLogin(password) {
    const data = await this.request('/auth/admin', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
    this.setToken(data.token);
    return data;
  },

  async getParticipant() {
    return this.request('/participant');
  },

  async completeTask(taskId, points) {
    return this.request('/participant/complete-task', {
      method: 'POST',
      body: JSON.stringify({ taskId, points })
    });
  },

  async getLeaderboard(workshopCode) {
    return this.request(`/leaderboard/${workshopCode}`);
  },

  async getAdminStats(workshopCode) {
    return this.request(`/admin/stats/${workshopCode}`);
  },

  async resetWorkshop(workshopCode) {
    return this.request(`/admin/reset/${workshopCode}`, {
      method: 'DELETE'
    });
  }
};

// Updated App.init() method
async init() {
  const token = localStorage.getItem('auth_token');
  const savedSession = localStorage.getItem('session');
  
  if (token && savedSession) {
    try {
      const session = JSON.parse(savedSession);
      this.user = session.user;
      this.workshopCode = session.workshopCode;
      this.isAdmin = session.isAdmin || false;
      
      if (!this.isAdmin) {
        const participant = await API.getParticipant();
        this.completedTasks = new Set(participant.completed_tasks || []);
        this.totalPoints = participant.total_points || 0;
      }
      
      this.showApp(localStorage.getItem('currentView') || 'workshop');
      return;
    } catch (error) {
      console.error('Session restore failed:', error);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('session');
    }
  }
  
  this.showLoginScreen();
  
  // Enter key handlers
  document.getElementById('login-workshop').addEventListener('keydown', e => {
    if (e.key === 'Enter') this.login();
  });
  document.getElementById('login-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') this.login();
  });
  document.getElementById('admin-bootstrap-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') this.adminLogin();
  });
}

// Updated App.login() method
async login() {
  const name = document.getElementById('login-name').value.trim();
  const code = document.getElementById('login-workshop').value.trim().toUpperCase();
  const error = document.getElementById('login-error');

  if (!name) {
    error.textContent = 'Please enter your name.';
    error.classList.add('visible');
    return;
  }
  if (!code) {
    error.textContent = 'Please enter the workshop code.';
    error.classList.add('visible');
    return;
  }

  error.classList.remove('visible');

  try {
    const user = await API.login(name, code);
    
    this.user = { name: user.name };
    this.workshopCode = user.workshopCode;
    this.completedTasks = new Set(user.completedTasks || []);
    this.totalPoints = user.totalPoints || 0;
    this.isAdmin = false;

    localStorage.setItem('session', JSON.stringify({
      user: this.user,
      workshopCode: this.workshopCode,
      isAdmin: false
    }));

    this.showApp('workshop');
  } catch (err) {
    error.textContent = err.message || 'Login failed. Please try again.';
    error.classList.add('visible');
  }
}

// Updated App.adminLogin() method
async adminLogin() {
  const pw = document.getElementById('admin-bootstrap-password').value;
  const error = document.getElementById('admin-bootstrap-error');
  
  try {
    await API.adminLogin(pw);
    
    this.user = { name: 'Admin' };
    this.workshopCode = 'MINFY2026';
    this.isAdmin = true;
    
    localStorage.setItem('session', JSON.stringify({
      user: this.user,
      workshopCode: this.workshopCode,
      isAdmin: true
    }));
    
    this.showApp('admin');
  } catch (err) {
    error.textContent = 'Incorrect password.';
    error.classList.add('visible');
  }
}

// Updated App.toggleTask() method
async toggleTask(taskId) {
  const task = TASKS.find(t => t.id === taskId);
  if (!task) return;
  
  const wasCompleted = this.completedTasks.has(taskId);
  
  if (wasCompleted) {
    // Undo not supported with backend - just refresh
    this.showToast('Cannot undo completed tasks', 'undo');
    return;
  }
  
  try {
    const result = await API.completeTask(taskId, task.points);
    this.completedTasks.add(taskId);
    this.totalPoints = result.total_points;
    this.updatePointsDisplay();
    this.celebrate();
    this.showToast(`+${task.points} XP`, 'success');
    
    // Refresh current view
    const main = document.getElementById('main-content');
    if (this.currentView === 'workshop') this.renderWorkshop(main);
    else if (this.currentView === 'leaderboard') this.renderLeaderboard(main);
  } catch (error) {
    console.error('Task completion error:', error);
    this.showToast(error.message || 'Failed to complete task', 'undo');
  }
}

// Updated App.renderLeaderboard() - replace the leaderboard data fetch
async renderLeaderboard(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1>🏆 Leaderboard</h1>
      <p>Live rankings — see how you stack up against your peers</p>
    </div>
    <div class="page-body">
      <div class="page-loading"><div class="spinner"></div> Loading leaderboard...</div>
    </div>
  `;

  try {
    const participants = await API.getLeaderboard(this.workshopCode);
    const maxPoints = Math.max(...participants.map(p => p.total_points), 1);
    
    const rows = participants.map((p, i) => {
      const isMe = p.name.toLowerCase() === this.user.name.toLowerCase();
      const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : '';
      const rowClass = isMe ? 'leaderboard-row-me' : '';
      const youBadge = isMe ? '<span class="leaderboard-you-badge">YOU</span>' : '';
      const pct = Math.round((p.total_points / maxPoints) * 100);
      
      return `
        <tr class="${rowClass}" style="--row-index:${i}">
          <td><span class="rank-badge ${rankClass}">${i + 1}</span></td>
          <td class="leaderboard-name">${p.name}${youBadge}</td>
          <td class="leaderboard-points">${p.total_points} XP</td>
          <td class="leaderboard-bar-cell">
            <div class="leaderboard-bar">
              <div class="leaderboard-bar-fill" style="width:${pct}%"></div>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="page-header">
        <h1>🏆 Leaderboard <span class="live-badge"><span class="live-dot"></span> Live</span></h1>
        <p>Live rankings — see how you stack up against your peers</p>
      </div>
      <div class="page-body">
        <div class="leaderboard-wrapper">
          <table class="leaderboard-table">
            <thead>
              <tr>
                <th style="width:60px">Rank</th>
                <th>Participant</th>
                <th style="width:100px">Points</th>
                <th style="width:140px">Progress</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="4" class="leaderboard-empty">No participants yet</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;

    // Auto-refresh every 10 seconds
    this._leaderboardTimer = setInterval(() => {
      if (this.currentView === 'leaderboard') this.renderLeaderboard(container);
    }, 10000);
  } catch (error) {
    console.error('Leaderboard error:', error);
    container.innerHTML = `
      <div class="page-header">
        <h1>🏆 Leaderboard</h1>
        <p>Live rankings</p>
      </div>
      <div class="page-body">
        <div class="leaderboard-empty">
          <p>Failed to load leaderboard. Please check your connection.</p>
        </div>
      </div>
    `;
  }
}
