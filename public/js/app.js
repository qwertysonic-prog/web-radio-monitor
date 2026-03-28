const watchlistManager = new WatchlistManager();
const stationCards = new Map(); // stationId -> StationCard

const stationsGrid = document.getElementById('stations-grid');
const noStationsEl = document.getElementById('no-stations');

// --- WebSocket Connection ---

let ws;
let wsReconnectTimer;

function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.addEventListener('open', () => {
    console.log('WebSocket connected');
    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }
  });

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    handleMessage(msg);
  });

  ws.addEventListener('close', () => {
    console.log('WebSocket disconnected, reconnecting...');
    wsReconnectTimer = setTimeout(connectWebSocket, 3000);
  });

  ws.addEventListener('error', () => {
    ws.close();
  });
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'init':
      // Initialize stations and watchlist from server state
      watchlistManager.setEntries(msg.watchlist);
      for (const station of msg.stations) {
        addStationCard(station);
      }
      updateNoStationsVisibility();
      if (msg.history) renderHistory(msg.history);
      break;

    case 'metadata':
      handleMetadata(msg);
      break;

    case 'station_added':
      if (!stationCards.has(msg.station.id)) {
        addStationCard(msg.station);
        updateNoStationsVisibility();
      }
      break;

    case 'station_removed':
      removeStationCard(msg.stationId);
      updateNoStationsVisibility();
      break;

    case 'watchlist_added':
      watchlistManager.addEntry(msg.entry);
      recheckAllMatches();
      break;

    case 'watchlist_removed':
      watchlistManager.removeEntry(msg.entryId);
      recheckAllMatches();
      break;

    case 'history_updated':
      renderHistory(msg.history);
      break;
  }
}

// --- Metadata Handling ---

// Store latest metadata per station for re-checking on watchlist changes
const latestMeta = new Map(); // stationId -> { artist, title }
const metaTimers = new Map(); // stationId -> timeout id (6-minute song timeout)
const META_TIMEOUT = 390000; // 6.5 minutes

function handleMetadata(msg) {
  const card = stationCards.get(msg.stationId);
  if (!card) return;

  card.updateMetadata(msg.artist, msg.title, msg.raw);
  latestMeta.set(msg.stationId, { artist: msg.artist, title: msg.title });

  const isMatch = watchlistManager.checkMatch(msg.artist, msg.title);
  card.setMatch(isMatch);

  // Reset the 6-minute timeout — if metadata doesn't change for 6 min, assume song ended
  clearTimeout(metaTimers.get(msg.stationId));
  const timer = setTimeout(() => {
    const c = stationCards.get(msg.stationId);
    if (c) c.setMatch(false, true); // immediate — song definitely over
  }, META_TIMEOUT);
  metaTimers.set(msg.stationId, timer);
}

function recheckAllMatches() {
  for (const [stationId, meta] of latestMeta) {
    const card = stationCards.get(stationId);
    if (card) {
      const isMatch = watchlistManager.checkMatch(meta.artist, meta.title);
      card.setMatch(isMatch);
    }
  }
}

// --- Station Cards ---

function addStationCard(station) {
  const card = new StationCard(station, async (id) => {
    try {
      await fetch(`/api/stations/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to delete station:', err);
    }
    removeStationCard(id);
    updateNoStationsVisibility();
  });

  stationCards.set(station.id, card);
  stationsGrid.appendChild(card.el);
}

function removeStationCard(stationId) {
  const card = stationCards.get(stationId);
  if (card) {
    card.destroy();
    stationCards.delete(stationId);
    latestMeta.delete(stationId);
    clearTimeout(metaTimers.get(stationId));
    metaTimers.delete(stationId);
  }
}

function updateNoStationsVisibility() {
  noStationsEl.style.display = stationCards.size === 0 ? 'block' : 'none';
}

// --- Recent Stations History ---

function renderHistory(history) {
  const container = document.getElementById('recent-stations');
  const list = document.getElementById('recent-stations-list');

  if (!history || history.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  list.innerHTML = '';

  for (const entry of history) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="history-name">${escapeHtml(entry.name)}</span><button class="history-remove" title="Remove">&times;</button>`;
    li.title = entry.url;
    li.querySelector('.history-name').addEventListener('click', () => {
      document.getElementById('station-name').value = entry.name;
      document.getElementById('station-url').value = entry.url;
    });
    li.querySelector('.history-remove').addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const res = await fetch('/api/history', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: entry.url })
        });
        if (res.ok) {
          const updated = await res.json();
          renderHistory(updated);
        }
      } catch (err) {
        console.error('Failed to remove history entry:', err);
      }
    });
    list.appendChild(li);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Forms ---

document.getElementById('add-station-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('station-name');
  const urlInput = document.getElementById('station-url');
  const name = nameInput.value.trim();
  const url = urlInput.value.trim();

  if (!name || !url) return;

  try {
    const res = await fetch('/api/stations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url })
    });
    if (res.ok) {
      nameInput.value = '';
      urlInput.value = '';
    }
  } catch (err) {
    console.error('Failed to add station:', err);
  }
});

document.getElementById('add-watchlist-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const typeSelect = document.getElementById('watchlist-type');
  const valueInput = document.getElementById('watchlist-value');
  const type = typeSelect.value;
  const value = valueInput.value.trim();

  if (!value) return;

  try {
    const res = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, value })
    });
    if (res.ok) {
      valueInput.value = '';
    }
  } catch (err) {
    console.error('Failed to add watchlist entry:', err);
  }
});

// --- Boot ---

connectWebSocket();
