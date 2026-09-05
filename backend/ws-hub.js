// Hub WebSocket: liga dispositivos (app) e operadores (painel).
//
//  ws://host/ws/device?token=JWT_DO_UTILIZADOR   ← app
//  ws://host/ws/panel?token=JWT_DO_ADMIN         ← painel
//
// Dispositivo → hub:   { type:"hello", device:{...} } | { type:"heartbeat", ... }
//                      { type:"frame", jpeg:"base64" } | { type:"result", id, ok, detail }
// Painel → hub:        { type:"command", deviceId, command, payload }
//                      { type:"watch", deviceId } | { type:"unwatch", deviceId }
// Hub → painel:        { type:"devices", list } | { type:"device", device }
//                      { type:"frame", deviceId, jpeg } | { type:"result", ... } | { type:"log", ... }
// Hub → dispositivo:   { type:"command", id, command, payload }

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const Device = require('./models/Device');
const DeviceEvent = require('./models/DeviceEvent');

const SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const HEARTBEAT_TIMEOUT_MS = 90_000;

const devices = new Map();   // deviceId → { ws, user, info, watchers:Set<ws> }
const panels = new Set();    // ws de operadores

const send = (ws, obj) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };
const broadcastPanels = (obj) => panels.forEach(p => send(p, obj));

const publicDevice = (d) => ({
  deviceId: d.deviceId, username: d.username, userId: d.userId, mac: d.mac, model: d.model, brand: d.brand,
  androidVersion: d.androidVersion, appVersion: d.appVersion, ip: d.ip, online: d.online, lastSeen: d.lastSeen,
  screen: d.screen, playing: d.playing, vpnOn: d.vpnOn, lastScreenshotAt: d.lastScreenshotAt
});

async function log(evt) { try { await DeviceEvent.create(evt); } catch (e) { /* nunca bloqueia */ } }

async function listDevices() {
  const all = await Device.find().sort({ online: -1, lastSeen: -1 }).lean();
  return all.map(publicDevice);
}

function attach(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/ws/')) return;             // deixa passar outros upgrades (nenhum)
    let user;
    try { user = jwt.verify(url.searchParams.get('token') || '', SECRET); }
    catch { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); return socket.destroy(); }
    const kind = url.pathname === '/ws/panel' ? 'panel' : url.pathname === '/ws/device' ? 'device' : null;
    if (!kind) { socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); return socket.destroy(); }
    if (kind === 'panel' && !['admin', 'reseller'].includes(user.role)) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); return socket.destroy(); }
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
    wss.handleUpgrade(req, socket, head, (ws) => (kind === 'panel' ? onPanel : onDevice)(ws, user, ip));
  });

  // ---------- Dispositivo ----------
  function onDevice(ws, user, ip) {
    let deviceId = null;
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (raw) => {
      let msg; try { msg = JSON.parse(raw); } catch { return; }
      try {
        if (msg.type === 'hello' || msg.type === 'heartbeat') {
          const info = msg.device || msg;
          deviceId = info.deviceId || deviceId;
          if (!deviceId) return;
          const upd = {
            userId: user._id, username: user.username, ip, online: true, lastSeen: new Date(),
            ...(info.mac && { mac: info.mac }), ...(info.model && { model: info.model }), ...(info.brand && { brand: info.brand }),
            ...(info.androidVersion && { androidVersion: info.androidVersion }), ...(info.appVersion && { appVersion: info.appVersion }),
            ...('screen' in info && { screen: info.screen }), ...('playing' in info && { playing: info.playing }),
            ...('vpnOn' in info && { vpnOn: !!info.vpnOn })
          };
          const d = await Device.findOneAndUpdate({ deviceId }, upd, { upsert: true, new: true }).lean();
          const entry = devices.get(deviceId) || { watchers: new Set() };
          const wasOnline = !!entry.ws;
          entry.ws = ws; entry.user = user; entry.info = d;
          devices.set(deviceId, entry);
          if (!wasOnline) log({ deviceId, userId: user._id, type: 'online', detail: `${d.model || 'dispositivo'} ligado (${ip})` });
          broadcastPanels({ type: 'device', device: publicDevice(d) });
        }
        else if (msg.type === 'frame' && deviceId) {
          const entry = devices.get(deviceId);
          entry?.watchers.forEach(p => send(p, { type: 'frame', deviceId, jpeg: msg.jpeg, at: Date.now() }));
          if (msg.snapshot) {
            await Device.updateOne({ deviceId }, { lastScreenshot: msg.jpeg, lastScreenshotAt: new Date() });
            broadcastPanels({ type: 'log', deviceId, text: 'Captura recebida' });
          }
        }
        else if (msg.type === 'result' && deviceId) {
          log({ deviceId, userId: user._id, type: 'result', command: msg.command, ok: msg.ok, detail: msg.detail });
          broadcastPanels({ type: 'result', deviceId, id: msg.id, command: msg.command, ok: msg.ok, detail: msg.detail });
        }
      } catch (e) { console.error('ws device:', e.message); }
    });

    ws.on('close', async () => {
      if (!deviceId) return;
      const entry = devices.get(deviceId);
      if (entry && entry.ws === ws) {
        entry.ws = null;
        await Device.updateOne({ deviceId }, { online: false, lastSeen: new Date() });
        log({ deviceId, userId: user._id, type: 'offline', detail: 'Dispositivo desligado' });
        const d = await Device.findOne({ deviceId }).lean();
        if (d) broadcastPanels({ type: 'device', device: publicDevice(d) });
      }
    });
  }

  // ---------- Painel ----------
  function onPanel(ws, user) {
    panels.add(ws);
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    listDevices().then(list => send(ws, { type: 'devices', list }));

    ws.on('message', async (raw) => {
      let msg; try { msg = JSON.parse(raw); } catch { return; }
      const entry = msg.deviceId ? devices.get(msg.deviceId) : null;

      if (msg.type === 'watch' && entry) { entry.watchers.add(ws); sendCommand(entry, 'LIVE_ON', {}, user); }
      else if (msg.type === 'unwatch' && entry) { entry.watchers.delete(ws); if (!entry.watchers.size) sendCommand(entry, 'LIVE_OFF', {}, user); }
      else if (msg.type === 'command') {
        if (!entry || !entry.ws) return send(ws, { type: 'result', deviceId: msg.deviceId, ok: false, command: msg.command, detail: 'Dispositivo offline' });
        const id = sendCommand(entry, msg.command, msg.payload || {}, user);
        send(ws, { type: 'log', deviceId: msg.deviceId, id, text: `Comando ${msg.command} enviado ao dispositivo` });
      }
      else if (msg.type === 'list') send(ws, { type: 'devices', list: await listDevices() });
    });

    ws.on('close', () => {
      panels.delete(ws);
      devices.forEach(e => { if (e.watchers.delete(ws) && !e.watchers.size) sendCommand(e, 'LIVE_OFF', {}, user); });
    });
  }

  function sendCommand(entry, command, payload, by) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    send(entry.ws, { type: 'command', id, command, payload });
    if (command !== 'LIVE_ON' && command !== 'LIVE_OFF' && command !== 'KEY') {
      log({ deviceId: entry.info?.deviceId, userId: entry.user?._id, type: 'command', command, payload, by: by?.username });
    }
    return id;
  }

  // ping/pong para detetar ligações mortas
  setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false; ws.ping();
    });
  }, 30_000);

  // dispositivos sem heartbeat há muito → offline
  setInterval(async () => {
    const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);
    const stale = await Device.find({ online: true, lastSeen: { $lt: cutoff } }).lean();
    for (const d of stale) {
      await Device.updateOne({ _id: d._id }, { online: false });
      devices.get(d.deviceId)?.ws?.terminate();
      broadcastPanels({ type: 'device', device: publicDevice({ ...d, online: false }) });
    }
  }, 60_000);

  console.log('🔌 WebSocket hub ativo em /ws/device e /ws/panel');
  return { devices, sendCommand, listDevices, publicDevice };
}

module.exports = { attach };
