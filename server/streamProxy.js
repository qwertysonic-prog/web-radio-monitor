const http = require('http');
const https = require('https');

const MAX_REDIRECTS = 5;

function createProxyHandler(store) {
  return function proxyStream(req, res) {
    const stationId = req.params.id;
    const stations = store.getStations();
    const station = stations.find(s => s.id === stationId);

    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }

    connectWithRedirects(station.url, station.name, req, res, 0);
  };
}

function connectWithRedirects(streamUrl, stationName, clientReq, clientRes, depth) {
  if (depth >= MAX_REDIRECTS) {
    if (!clientRes.headersSent) {
      clientRes.status(502).json({ error: 'Too many redirects' });
    }
    return;
  }

  const parsed = new URL(streamUrl);
  const client = parsed.protocol === 'https:' ? https : http;

  const proxyReq = client.request(streamUrl, {
    headers: {
      'User-Agent': 'WebRadioMonitor/1.0',
      'Icy-MetaData': '0'
    }
  }, (proxyRes) => {
    // Follow redirects
    if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
      proxyRes.resume();
      connectWithRedirects(proxyRes.headers.location, stationName, clientReq, clientRes, depth + 1);
      return;
    }

    const contentType = proxyRes.headers['content-type'] || 'audio/mpeg';
    clientRes.setHeader('Content-Type', contentType);
    clientRes.setHeader('Cache-Control', 'no-cache');
    clientRes.setHeader('Connection', 'keep-alive');

    proxyRes.pipe(clientRes);

    proxyRes.on('error', () => {
      if (!clientRes.headersSent) {
        clientRes.status(502).json({ error: 'Stream error' });
      }
    });
  });

  proxyReq.on('error', (err) => {
    console.error(`[Proxy] Error connecting to ${stationName}:`, err.message);
    if (!clientRes.headersSent) {
      clientRes.status(502).json({ error: 'Failed to connect to stream' });
    }
  });

  clientReq.on('close', () => {
    proxyReq.destroy();
  });

  proxyReq.end();
}

module.exports = { createProxyHandler };
