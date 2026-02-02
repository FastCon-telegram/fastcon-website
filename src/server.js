const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ping = require('ping');
const net = require('net');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const DATA_FILE = process.env.DATA_FILE || '/data/stats.json';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '0402036';

// Default data structure
const defaultData = {
    visits: {
        total: 0,
        unique: [],
        daily: {}
    },
    clicks: {
        connect: 0,
        key: 0,
        channel: 0,
        donate: 0,
        support: 0
    },
    servers: [
        { id: 1, name: 'Frankfurt', host: '185.244.21.156', country: 'DE' }
    ],
    buttons: [
        { id: 'connect', label: 'Подключиться', url: 'https://t.me/obhod_mobilniy_bot?start=ref_8274479300', icon: '🚀' },
        { id: 'key', label: 'Разблокировать доступ в Telegram (триал-ключ)', url: 'https://sub.harknmav.fun/mendc2yGo4ELy19a', icon: '🔐' },
        { id: 'channel', label: 'Новости проекта', url: 'https://t.me/fastconnews', icon: '📢' },
        { id: 'donate', label: 'Поддержать проект', url: 'https://yookassa.ru/my/i/aXJhGJi1ece4/l', icon: '💎' },
        { id: 'support', label: 'Служба поддержки', url: 'https://t.me/obhod_support', icon: '💬' }
    ],
    pingSettings: {
        level4: 50,
        level3: 100,
        level2: 200,
        level1: 500,
        mode: 'icmp',  // 'icmp' or 'tcp'
        tcpPort: 443,
        retryCount: 3,    // Number of retry attempts
        retryDelay: 1000  // Delay between retries in ms
    },
    lastReset: new Date().toISOString()
};

// Load or initialize data
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            const data = JSON.parse(raw);
            
            // Migrate old object-based buttons to array
            let buttons = data.buttons;
            if (buttons && !Array.isArray(buttons)) {
                buttons = Object.entries(buttons).map(([id, btn]) => ({
                    id,
                    ...btn
                }));
            } else if (!buttons) {
                buttons = defaultData.buttons;
            }
            
            return { 
                ...defaultData, 
                ...data,
                buttons,
                pingSettings: { ...defaultData.pingSettings, ...data.pingSettings }
            };
        }
    } catch (e) {
        console.error('Error loading data:', e);
    }
    return { ...defaultData };
}

// Save data
function saveData(data) {
    try {
        const dir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error saving data:', e);
    }
}

let statsData = loadData();

// Generate visitor fingerprint from request data
function getFingerprint(req, clientFingerprint) {
    // If client sends a fingerprint, use it combined with server data
    const ua = req.headers['user-agent'] || '';
    const lang = req.headers['accept-language'] || '';
    const encoding = req.headers['accept-encoding'] || '';
    const connection = req.headers['connection'] || '';
    
    // Create a combined fingerprint from multiple sources
    const serverData = `${ua}|${lang}|${encoding}|${connection}`;
    const combined = clientFingerprint ? `${clientFingerprint}|${serverData}` : serverData;
    
    // Create a hash
    return crypto.createHash('md5').update(combined).digest('hex').slice(0, 24);
}

// Get today's date key
function getTodayKey() {
    return new Date().toISOString().split('T')[0];
}

// ============ API ROUTES ============

// Track page visit
app.post('/api/visit', (req, res) => {
    const clientFp = req.body.fingerprint || '';
    const fp = getFingerprint(req, clientFp);
    const today = getTodayKey();
    
    statsData.visits.total++;
    
    if (!statsData.visits.unique.includes(fp)) {
        statsData.visits.unique.push(fp);
    }
    
    if (!statsData.visits.daily[today]) {
        statsData.visits.daily[today] = { total: 0, unique: [] };
    }
    statsData.visits.daily[today].total++;
    if (!statsData.visits.daily[today].unique.includes(fp)) {
        statsData.visits.daily[today].unique.push(fp);
    }
    
    saveData(statsData);
    res.json({ success: true, fingerprint: fp });
});

// Track button click
app.post('/api/click', (req, res) => {
    const { button } = req.body;
    
    if (button && statsData.clicks.hasOwnProperty(button)) {
        statsData.clicks[button]++;
        saveData(statsData);
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'Invalid button' });
    }
});

// Get buttons config (public)
app.get('/api/buttons', (req, res) => {
    res.json(statsData.buttons);
});

// ============ BUTTONS MANAGEMENT ============

// Get buttons (admin)
app.get('/api/admin/buttons', adminAuth, (req, res) => {
    res.json(statsData.buttons);
});

// Add button (admin)
app.post('/api/admin/buttons', adminAuth, (req, res) => {
    const { label, url, icon } = req.body;
    if (!label || !url) {
        return res.status(400).json({ error: 'Label and URL are required' });
    }
    
    const newButton = {
        id: 'btn_' + Date.now(),
        label,
        url,
        icon: icon || '🔗'
    };
    
    statsData.buttons.push(newButton);
    saveData(statsData);
    res.json({ success: true, button: newButton });
});

// Update button (admin)
app.put('/api/admin/buttons/:id', adminAuth, (req, res) => {
    const { id } = req.params;
    const { label, url, icon } = req.body;
    
    const button = statsData.buttons.find(b => b.id === id);
    if (!button) {
        return res.status(404).json({ error: 'Button not found' });
    }
    
    if (label) button.label = label;
    if (url) button.url = url;
    if (icon) button.icon = icon;
    
    saveData(statsData);
    res.json({ success: true, button });
});

// Delete button (admin)
app.delete('/api/admin/buttons/:id', adminAuth, (req, res) => {
    const { id } = req.params;
    const index = statsData.buttons.findIndex(b => b.id === id);
    
    if (index === -1) {
        return res.status(404).json({ error: 'Button not found' });
    }
    
    statsData.buttons.splice(index, 1);
    saveData(statsData);
    res.json({ success: true });
});

// Reorder buttons (admin)
app.post('/api/admin/buttons/reorder', adminAuth, (req, res) => {
    const { order } = req.body; // Array of button IDs in new order
    
    if (!Array.isArray(order)) {
        return res.status(400).json({ error: 'Order must be an array of IDs' });
    }
    
    const newButtons = [];
    for (const id of order) {
        const button = statsData.buttons.find(b => b.id === id);
        if (button) {
            newButtons.push(button);
        }
    }
    
    // Add any buttons that weren't in the order array
    for (const button of statsData.buttons) {
        if (!newButtons.find(b => b.id === button.id)) {
            newButtons.push(button);
        }
    }
    
    statsData.buttons = newButtons;
    saveData(statsData);
    res.json({ success: true, buttons: statsData.buttons });
});

// Get ping settings (public)
app.get('/api/ping-settings', (req, res) => {
    res.json(statsData.pingSettings);
});

// Get public stats (limited)
app.get('/api/stats/public', (req, res) => {
    res.json({
        totalVisits: statsData.visits.total,
        uniqueVisitors: statsData.visits.unique.length
    });
});

// ============ ADMIN ROUTES ============

// Admin authentication middleware
function adminAuth(req, res, next) {
    const password = req.headers['x-admin-password'] || req.query.password;
    if (password === ADMIN_PASSWORD) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

// Get full stats (admin)
app.get('/api/admin/stats', adminAuth, (req, res) => {
    const today = getTodayKey();
    const todayStats = statsData.visits.daily[today] || { total: 0, unique: [] };
    
    // Calculate last 7 days
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const key = date.toISOString().split('T')[0];
        const dayData = statsData.visits.daily[key] || { total: 0, unique: [] };
        last7Days.push({
            date: key,
            visits: dayData.total,
            unique: dayData.unique.length
        });
    }
    
    res.json({
        visits: {
            total: statsData.visits.total,
            unique: statsData.visits.unique.length,
            today: todayStats.total,
            todayUnique: todayStats.unique.length,
            last7Days
        },
        clicks: statsData.clicks,
        servers: statsData.servers,
        buttons: statsData.buttons,
        pingSettings: statsData.pingSettings,
        lastReset: statsData.lastReset
    });
});

// Reset stats (admin)
app.post('/api/admin/reset', adminAuth, (req, res) => {
    statsData.visits = { total: 0, unique: [], daily: {} };
    statsData.clicks = { connect: 0, key: 0, channel: 0, donate: 0, support: 0 };
    statsData.lastReset = new Date().toISOString();
    saveData(statsData);
    res.json({ success: true, message: 'Stats reset successfully' });
});

// ============ SERVERS MANAGEMENT ============

// Get servers (admin)
app.get('/api/admin/servers', adminAuth, (req, res) => {
    res.json(statsData.servers);
});

// Add server (admin)
app.post('/api/admin/servers', adminAuth, (req, res) => {
    const { name, host, country } = req.body;
    if (!name || !host) {
        return res.status(400).json({ error: 'Name and host are required' });
    }
    
    const newServer = {
        id: Date.now(),
        name,
        host,
        country: country || '🌐'
    };
    
    statsData.servers.push(newServer);
    saveData(statsData);
    res.json({ success: true, server: newServer });
});

// Update server (admin)
app.put('/api/admin/servers/:id', adminAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const { name, host, country } = req.body;
    
    const server = statsData.servers.find(s => s.id === id);
    if (!server) {
        return res.status(404).json({ error: 'Server not found' });
    }
    
    if (name) server.name = name;
    if (host) server.host = host;
    if (country) server.country = country;
    
    saveData(statsData);
    res.json({ success: true, server });
});

// Delete server (admin)
app.delete('/api/admin/servers/:id', adminAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const index = statsData.servers.findIndex(s => s.id === id);
    
    if (index === -1) {
        return res.status(404).json({ error: 'Server not found' });
    }
    
    statsData.servers.splice(index, 1);
    saveData(statsData);
    res.json({ success: true });
});

// Reorder servers (admin)
app.post('/api/admin/servers/reorder', adminAuth, (req, res) => {
    const { order } = req.body; // Array of server IDs in new order
    
    if (!Array.isArray(order)) {
        return res.status(400).json({ error: 'Order must be an array of IDs' });
    }
    
    const newServers = [];
    for (const id of order) {
        const server = statsData.servers.find(s => s.id === id);
        if (server) {
            newServers.push(server);
        }
    }
    
    // Add any servers that weren't in the order array
    for (const server of statsData.servers) {
        if (!newServers.find(s => s.id === server.id)) {
            newServers.push(server);
        }
    }
    
    statsData.servers = newServers;
    saveData(statsData);
    res.json({ success: true, servers: statsData.servers });
});

// ============ PING SETTINGS ============

// Update ping settings (admin)
app.put('/api/admin/ping-settings', adminAuth, (req, res) => {
    const { level4, level3, level2, level1, mode, tcpPort, retryCount, retryDelay } = req.body;
    
    if (level4 !== undefined) statsData.pingSettings.level4 = parseInt(level4);
    if (level3 !== undefined) statsData.pingSettings.level3 = parseInt(level3);
    if (level2 !== undefined) statsData.pingSettings.level2 = parseInt(level2);
    if (level1 !== undefined) statsData.pingSettings.level1 = parseInt(level1);
    if (mode !== undefined) statsData.pingSettings.mode = mode;
    if (tcpPort !== undefined) statsData.pingSettings.tcpPort = parseInt(tcpPort);
    if (retryCount !== undefined) statsData.pingSettings.retryCount = parseInt(retryCount);
    if (retryDelay !== undefined) statsData.pingSettings.retryDelay = parseInt(retryDelay);
    
    saveData(statsData);
    res.json({ success: true, pingSettings: statsData.pingSettings });
});

// ============ PING ROUTE ============

app.get('/api/ping/:host', async (req, res) => {
    const { host } = req.params;
    const retryCount = statsData.pingSettings.retryCount || 3;
    const retryDelay = statsData.pingSettings.retryDelay || 1000;
    
    // Helper function for delay
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    
    // Try ping with retries
    for (let attempt = 1; attempt <= retryCount; attempt++) {
        try {
            const result = await ping.promise.probe(host, {
                timeout: 5,
                extra: ['-c', '1']
            });
            
            if (result.alive) {
                return res.json({
                    alive: true,
                    time: Math.round(parseFloat(result.time)),
                    host: result.host,
                    attempt: attempt
                });
            }
            
            // If not alive and not last attempt, wait and retry
            if (attempt < retryCount) {
                await delay(retryDelay);
            }
        } catch (error) {
            // If error and not last attempt, wait and retry
            if (attempt < retryCount) {
                await delay(retryDelay);
            }
        }
    }
    
    // All attempts failed
    res.json({ alive: false, host, attempts: retryCount });
});

// TCP Ping endpoint with retry
app.get('/api/ping-tcp/:host', async (req, res) => {
    const { host } = req.params;
    const port = statsData.pingSettings.tcpPort || 443;
    const timeout = 5000;
    const retryCount = statsData.pingSettings.retryCount || 3;
    const retryDelay = statsData.pingSettings.retryDelay || 1000;
    
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    
    // Single TCP ping attempt
    const tcpPing = () => new Promise((resolve) => {
        const startTime = Date.now();
        const socket = new net.Socket();
        
        socket.setTimeout(timeout);
        
        socket.on('connect', () => {
            const time = Date.now() - startTime;
            socket.destroy();
            resolve({ alive: true, time });
        });
        
        socket.on('timeout', () => {
            socket.destroy();
            resolve({ alive: false, error: 'timeout' });
        });
        
        socket.on('error', (err) => {
            socket.destroy();
            resolve({ alive: false, error: err.message });
        });
        
        socket.connect(port, host);
    });
    
    // Try with retries
    for (let attempt = 1; attempt <= retryCount; attempt++) {
        const result = await tcpPing();
        
        if (result.alive) {
            return res.json({
                alive: true,
                time: result.time,
                host: host,
                port: port,
                method: 'tcp',
                attempt: attempt
            });
        }
        
        if (attempt < retryCount) {
            await delay(retryDelay);
        }
    }
    
    res.json({ alive: false, host, attempts: retryCount });
});

// ============ SERVE HTML ============

app.get('/stats', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/stats.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ============ START SERVER ============

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 FastCon server running on port ${PORT}`);
    console.log(`📊 Admin panel: http://localhost:${PORT}/stats`);
});
