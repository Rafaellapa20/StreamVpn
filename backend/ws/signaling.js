const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;

// deviceId -> { ws, user, name, lastSeen, watchedBy: Set<adminWs> }
const devices = new Map();
// Set de admins ligados (para receberem a lista de dispositivos)
const admins = new Set();

function verifyToken(token) {
  try { return jwt.verify(token, SECRET); } catch { return null; }
}

function safeSend(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function deviceSummary(d) {
  return { deviceId: d.deviceId, name: d.name, username: d.user.username, lastSeen: d.lastSeen };
}

function broadcastDeviceList() {
  const list = Array.from(devices.values()).map(deviceSummary);
  for (const adminWs of admins) safeSend(adminWs, { type: 'devices', list });
}

function attach(server) {
  const wss = new WebSocket.Server({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { socket.destroy(); return; }

    if (url.pathname !== '/ws/device' && url.pathname !== '/ws/admin') {
      socket.destroy();
      return;
    }
    const token = url.searchParams.get('token');
    const user = token && verifyToken(token);
    if (!user) { socket.destroy(); return; }
    if (url.pathname === '/ws/admin' && user.role !== 'admin') { socket.destroy(); return; }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.isAdmin = url.pathname === '/ws/admin';
      ws.user = user;
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    if (ws.isAdmin) attachAdmin(ws);
    else attachDevice(ws);
  });

  return wss;
}

function attachAdmin(ws) {
  admins.add(ws);
  safeSend(ws, { type: 'devices', list: Array.from(devices.values()).map(deviceSummary) });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const target = msg.deviceId && devices.get(msg.deviceId);

    switch (msg.type) {
      case 'watch':
        if (target) {
          const wasEmpty = target.watchedBy.size === 0;
          target.watchedBy.add(ws);
          if (wasEmpty) safeSend(target.ws, { type: 'watch-requested' });
        }
        break;
      case 'unwatch':
        if (target) {
          target.watchedBy.delete(ws);
          if (target.watchedBy.size === 0) safeSend(target.ws, { type: 'stop-streaming' });
        }
        break;
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        if (target) safeSend(target.ws, { type: msg.type, payload: msg.payload });
        break;
      case 'command':
        if (target) safeSend(target.ws, { type: 'command', action: msg.action, payload: msg.payload });
        break;
      default:
        break;
    }
  });

  ws.on('close', () => {
    admins.delete(ws);
    for (const d of devices.values()) d.watchedBy.delete(ws);
  });
}

function attachDevice(ws) {
  let deviceId = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'hello') {
      deviceId = String(msg.deviceId || ws.user._id);
      devices.set(deviceId, {
        deviceId, ws, user: ws.user,
        name: msg.name || ws.user.username,
        lastSeen: new Date().toISOString(),
        watchedBy: new Set()
      });
      broadcastDeviceList();
      return;
    }
    if (!deviceId) return; // tem de mandar 'hello' primeiro
    const d = devices.get(deviceId);
    if (!d) return;
    d.lastSeen = new Date().toISOString();

    switch (msg.type) {
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        for (const adminWs of d.watchedBy) safeSend(adminWs, { type: msg.type, deviceId, payload: msg.payload });
        break;
      case 'log':
        for (const adminWs of d.watchedBy) safeSend(adminWs, { type: 'log', deviceId, message: msg.message });
        break;
      default:
        break;
    }
  });

  ws.on('close', () => {
    if (deviceId && devices.get(deviceId)?.ws === ws) {
      devices.delete(deviceId);
      broadcastDeviceList();
    }
  });
}

module.exports = { attach };
