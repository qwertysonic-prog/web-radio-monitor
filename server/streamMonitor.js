const icy = require('icy');
const http = require('http');
const https = require('https');
const { EventEmitter } = require('events');

const MAX_REDIRECTS = 5;
const IHEART_POLL_INTERVAL = 15000;
const META_HEARTBEAT_TIMEOUT = 90000; // reconnect if no metadata within 90s of connecting

class StreamMonitor extends EventEmitter {
  constructor() {
    super();
    this.monitors = new Map();
  }

  async start(station) {
    if (this.monitors.has(station.id)) {
      return;
    }

    const entry = {
      request: null,
      currentMeta: null,
      currentParsed: null, // { artist, title, raw }
      retryTimer: null,
      pollTimer: null,
      metaHeartbeat: null,
      stopped: false,
      iheartTitleCache: new Map(), // artist -> title from API
      lastIcyArtist: null,
      lastApiArtist: null // track what the API last reported
    };
    this.monitors.set(station.id, entry);

    // Try to find iHeart station ID from URL or by searching the API
    let iheartId = this._extractIheartId(station.url);
    if (!iheartId) {
      iheartId = await this._lookupIheartId(station.name);
    }
    if (iheartId) {
      this._startIheartPolling(station, entry, iheartId);
    }
    this._connectIcy(station, entry);
  }

  _extractIheartId(url) {
    const match = url.match(/ihrhls\.com\/zc(\d+)/);
    return match ? match[1] : null;
  }

  async _lookupIheartId(stationName) {
    try {
      // Extract likely call letters (3-4 uppercase letters) from the station name
      const callMatch = stationName.match(/\b([A-Z]{3,4})\b/i);
      if (!callMatch) return null;
      const callLetters = callMatch[1].toUpperCase();

      // Extract frequency from name (e.g., "94.9" from "94.9 KCMO")
      const freqMatch = stationName.match(/(\d+\.\d+)/);
      const freq = freqMatch ? freqMatch[1] : null;

      const data = await this._fetchJson(
        `https://us.api.iheart.com/api/v3/search/all?keywords=${encodeURIComponent(callLetters)}&maxRows=10`
      );
      if (!data || !data.results || !data.results.stations) return null;

      const candidates = data.results.stations.filter(s =>
        s.callLetters && s.callLetters.toUpperCase().startsWith(callLetters)
      );

      // Prefer frequency match, then FM over AM
      let best = null;
      for (const s of candidates) {
        if (freq && String(s.frequency) === freq) {
          best = s;
          break;
        }
        if (!best && s.callLetters && s.callLetters.endsWith('-FM')) {
          best = s;
        }
      }
      if (!best && candidates.length > 0) best = candidates[0];

      if (best) {
        console.log(`[Monitor] Found iHeart ID ${best.id} for ${stationName} (${best.callLetters})`);
        return String(best.id);
      }
    } catch (err) {
      console.error(`[Monitor] iHeart lookup failed for ${stationName}:`, err.message);
    }
    return null;
  }

  // --- iHeart API polling (primary metadata source for iHeart stations) ---

  _startIheartPolling(station, entry, iheartId) {
    console.log(`[Monitor] Starting iHeart title lookup for ${station.name} (id: ${iheartId})`);
    this._pollIheart(station, entry, iheartId);
    entry.pollTimer = setInterval(() => {
      this._pollIheart(station, entry, iheartId);
    }, IHEART_POLL_INTERVAL);
  }

  async _pollIheart(station, entry, iheartId) {
    if (entry.stopped) return;

    try {
      const data = await this._fetchJson(`https://us.api.iheart.com/api/v3/live-meta/stream/${iheartId}/trackHistory`);
      if (entry.stopped || !data || !Array.isArray(data.data)) return;

      // Build a cache of artist -> title from recent tracks
      for (const track of data.data) {
        if (track.artist && track.title) {
          entry.iheartTitleCache.set(track.artist.toLowerCase(), track.title);
        }
      }

      // Use the most recent track from API as primary metadata source
      const latest = data.data[0];
      if (latest && latest.artist && latest.title) {
        const apiKey = `${latest.artist} - ${latest.title}`;
        if (apiKey !== entry.lastApiArtist) {
          entry.lastApiArtist = apiKey;
          // Update displayed metadata if different from current
          if (apiKey !== entry.currentMeta) {
            entry.currentMeta = apiKey;
            const meta = { stationId: station.id, raw: apiKey, artist: latest.artist, title: latest.title };
            entry.currentParsed = meta;
            console.log(`[Monitor] ${station.name} (API): ${latest.artist} - ${latest.title}`);
            this.emit('metadata', meta);
          }
        }
      }

      // Also try to enrich the current ICY artist if it differs from API
      if (entry.lastIcyArtist) {
        const title = entry.iheartTitleCache.get(entry.lastIcyArtist.toLowerCase());
        if (title) {
          const metaKey = `${entry.lastIcyArtist} - ${title}`;
          if (metaKey !== entry.currentMeta) {
            entry.currentMeta = metaKey;
            const meta = { stationId: station.id, raw: metaKey, artist: entry.lastIcyArtist, title };
            entry.currentParsed = meta;
            console.log(`[Monitor] ${station.name} (enriched): ${entry.lastIcyArtist} - ${title}`);
            this.emit('metadata', meta);
          }
        }
      }
    } catch (err) {
      console.error(`[Monitor] iHeart API error for ${station.name}:`, err.message);
    }
  }

  _fetchJson(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      client.get(url, {
        headers: { 'User-Agent': 'WebRadioMonitor/1.0' }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch { reject(new Error('Invalid JSON')); }
        });
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  // --- ICY metadata ---

  _resolveRedirects(streamUrl, depth = 0) {
    return new Promise((resolve, reject) => {
      if (depth >= MAX_REDIRECTS) {
        return reject(new Error('Too many redirects'));
      }

      const parsed = new URL(streamUrl);
      const client = parsed.protocol === 'https:' ? https : http;

      const req = client.get(streamUrl, {
        headers: {
          'User-Agent': 'WebRadioMonitor/1.0'
        }
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const location = res.headers.location;
          console.log(`[Monitor] Redirect ${res.statusCode}: ${location}`);
          resolve(this._resolveRedirects(location, depth + 1));
        } else {
          res.resume();
          req.destroy();
          resolve(streamUrl);
        }
      });

      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Redirect resolution timed out'));
      });
    });
  }

  async _connectIcy(station, entry) {
    if (entry.stopped) return;

    const isIheart = !!this._extractIheartId(station.url);
    console.log(`[Monitor] Connecting ICY to ${station.name}: ${station.url}`);

    try {
      const finalUrl = await this._resolveRedirects(station.url);
      if (entry.stopped) return;

      if (finalUrl !== station.url) {
        console.log(`[Monitor] Resolved to: ${finalUrl}`);
      }

      const req = icy.get(finalUrl, (res) => {
        console.log(`[Monitor] ICY connected to ${station.name}`);

        // Reconnect if no metadata arrives within 90s (server may not be sending ICY data)
        if (entry.metaHeartbeat) clearTimeout(entry.metaHeartbeat);
        entry.metaHeartbeat = setTimeout(() => {
          if (entry.stopped) return;
          console.log(`[Monitor] No metadata from ${station.name} in ${META_HEARTBEAT_TIMEOUT / 1000}s, reconnecting...`);
          try { req.destroy(); } catch {}
          this._scheduleReconnect(station, entry);
        }, META_HEARTBEAT_TIMEOUT);

        res.on('metadata', (metadata) => {
          if (entry.metaHeartbeat) {
            clearTimeout(entry.metaHeartbeat);
            entry.metaHeartbeat = null;
          }
          const parsed = icy.parse(metadata);
          const streamTitle = parsed.StreamTitle || '';
          if (!streamTitle) return;

          const { artist, title } = this._parseStreamTitle(streamTitle);

          if (isIheart) {
            // For iHeart: ICY gives real-time artist, title is "text" placeholder
            if (!artist) return; // Skip blank entries like " - text"

            entry.lastIcyArtist = artist;

            // Try to find actual song title from API cache
            const cachedTitle = entry.iheartTitleCache.get(artist.toLowerCase());
            const displayTitle = cachedTitle || '';
            const metaKey = cachedTitle ? `${artist} - ${cachedTitle}` : artist;

            if (metaKey !== entry.currentMeta) {
              entry.currentMeta = metaKey;
              const meta = { stationId: station.id, raw: metaKey, artist, title: displayTitle };
              entry.currentParsed = meta;
              console.log(`[Monitor] ${station.name}: ${artist}${displayTitle ? ' - ' + displayTitle : ' (title pending...)'}`);
              this.emit('metadata', meta);
            }
          } else {
            // For regular Icecast streams: use ICY metadata as-is
            if (streamTitle !== entry.currentMeta) {
              entry.currentMeta = streamTitle;
              const meta = { stationId: station.id, raw: streamTitle, artist, title };
              entry.currentParsed = meta;
              console.log(`[Monitor] ${station.name}: ${artist} - ${title}`);
              this.emit('metadata', meta);
            }
          }
        });

        res.on('data', () => {});

        res.on('error', (err) => {
          console.error(`[Monitor] Stream error for ${station.name}:`, err.message);
          this._scheduleReconnect(station, entry);
        });

        res.on('close', () => {
          console.log(`[Monitor] Stream closed for ${station.name}`);
          this._scheduleReconnect(station, entry);
        });
      });

      req.on('error', (err) => {
        console.error(`[Monitor] Connection error for ${station.name}:`, err.message);
        this._scheduleReconnect(station, entry);
      });

      entry.request = req;
    } catch (err) {
      console.error(`[Monitor] Failed to connect to ${station.name}:`, err.message);
      this._scheduleReconnect(station, entry);
    }
  }

  _scheduleReconnect(station, entry) {
    if (entry.stopped) return;
    if (entry.retryTimer) return;

    console.log(`[Monitor] Will reconnect to ${station.name} in 10s`);
    entry.retryTimer = setTimeout(() => {
      entry.retryTimer = null;
      this._connectIcy(station, entry);
    }, 10000);
  }

  _parseStreamTitle(streamTitle) {
    const sep = streamTitle.indexOf(' - ');
    if (sep !== -1) {
      return {
        artist: streamTitle.substring(0, sep).trim(),
        title: streamTitle.substring(sep + 3).trim()
      };
    }
    return { artist: '', title: streamTitle.trim() };
  }

  stop(stationId) {
    const entry = this.monitors.get(stationId);
    if (!entry) return;

    entry.stopped = true;
    if (entry.retryTimer) clearTimeout(entry.retryTimer);
    if (entry.pollTimer) clearInterval(entry.pollTimer);
    if (entry.metaHeartbeat) clearTimeout(entry.metaHeartbeat);
    if (entry.request) {
      try { entry.request.abort(); } catch {}
    }
    this.monitors.delete(stationId);
    console.log(`[Monitor] Stopped monitoring station ${stationId}`);
  }

  stopAll() {
    for (const [id] of this.monitors) {
      this.stop(id);
    }
  }

  getCurrentMeta(stationId) {
    const entry = this.monitors.get(stationId);
    return entry ? entry.currentParsed : null;
  }
}

module.exports = StreamMonitor;
