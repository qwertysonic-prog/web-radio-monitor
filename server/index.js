const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const store = require('./store');
const StreamMonitor = require('./streamMonitor');
const { createProxyHandler } = require('./streamProxy');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const monitor = new StreamMonitor();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- REST API: Stations ---

app.get('/api/stations', (req, res) => {
  res.json(store.getStations());
});

app.post('/api/stations', (req, res) => {
  const { name, url } = req.body;
  if (!name || !url) {
    return res.status(400).json({ error: 'name and url are required' });
  }
  const station = store.addStation(name, url);
  store.addToHistory(name, url);
  monitor.start(station);
  broadcast({ type: 'station_added', station });
  broadcast({ type: 'history_updated', history: store.getHistory() });
  res.status(201).json(station);
});

app.delete('/api/stations/:id', (req, res) => {
  const { id } = req.params;
  monitor.stop(id);
  store.removeStation(id);
  broadcast({ type: 'station_removed', stationId: id });
  res.json({ ok: true });
});

// --- REST API: Watchlist ---

app.get('/api/watchlist', (req, res) => {
  res.json(store.getWatchlist());
});

app.post('/api/watchlist', (req, res) => {
  const { type, value } = req.body;
  if (!type || !value) {
    return res.status(400).json({ error: 'type and value are required' });
  }
  if (type !== 'artist' && type !== 'song') {
    return res.status(400).json({ error: 'type must be "artist" or "song"' });
  }
  const entry = store.addWatchlistEntry(type, value);
  broadcast({ type: 'watchlist_added', entry });
  res.status(201).json(entry);
});

app.delete('/api/watchlist/:id', (req, res) => {
  const { id } = req.params;
  store.removeWatchlistEntry(id);
  broadcast({ type: 'watchlist_removed', entryId: id });
  res.json({ ok: true });
});

// --- REST API: History ---

app.get('/api/history', (req, res) => {
  res.json(store.getHistory());
});

app.delete('/api/history', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  store.removeFromHistory(url);
  const history = store.getHistory();
  broadcast({ type: 'history_updated', history });
  res.json(history);
});

// --- Stream Proxy ---

app.get('/api/stream/:id', createProxyHandler(store));

// --- WebSocket ---

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');

  // Send current state to new client
  const stations = store.getStations();
  const watchlist = store.getWatchlist();
  const history = store.getHistory();
  ws.send(JSON.stringify({ type: 'init', stations, watchlist, history }));

  // Send current metadata for all monitored stations
  for (const station of stations) {
    const meta = monitor.getCurrentMeta(station.id);
    if (meta) {
      ws.send(JSON.stringify({ type: 'metadata', ...meta }));
    }
  }

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
  });
});

// --- Metadata forwarding ---

monitor.on('metadata', (data) => {
  broadcast({ type: 'metadata', ...data });
});

// --- Start monitoring existing stations ---

const existingStations = store.getStations();
for (const station of existingStations) {
  monitor.start(station);
}

// --- Start server ---

server.listen(PORT, () => {
  console.log(`Web Radio Monitor running at http://localhost:${PORT}`);
  console.log(`Monitoring ${existingStations.length} station(s)`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  monitor.stopAll();
  server.close();
  process.exit(0);
});
