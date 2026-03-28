const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

const MAX_HISTORY = 5;

const DEFAULT_CONFIG = {
  stations: [],
  watchlist: [],
  stationHistory: []
};

function load() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function save(config) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

function generateId() {
  return crypto.randomBytes(6).toString('hex');
}

// --- Stations ---

function getStations() {
  return load().stations;
}

function addStation(name, url) {
  const config = load();
  const station = { id: generateId(), name, url };
  config.stations.push(station);
  save(config);
  return station;
}

function removeStation(id) {
  const config = load();
  config.stations = config.stations.filter(s => s.id !== id);
  save(config);
}

// --- Watchlist ---

function getWatchlist() {
  return load().watchlist;
}

function addWatchlistEntry(type, value) {
  const config = load();
  const entry = { id: generateId(), type, value };
  config.watchlist.push(entry);
  save(config);
  return entry;
}

function removeWatchlistEntry(id) {
  const config = load();
  config.watchlist = config.watchlist.filter(e => e.id !== id);
  save(config);
}

// --- Station History ---

function getHistory() {
  const config = load();
  return config.stationHistory || [];
}

function addToHistory(name, url) {
  const config = load();
  if (!config.stationHistory) config.stationHistory = [];

  // Remove any existing entry with the same URL
  config.stationHistory = config.stationHistory.filter(h => h.url !== url);

  // Add to the front
  config.stationHistory.unshift({ name, url, lastUsed: Date.now() });

  // Keep only the last MAX_HISTORY entries
  config.stationHistory = config.stationHistory.slice(0, MAX_HISTORY);

  save(config);
}

function removeFromHistory(url) {
  const config = load();
  if (!config.stationHistory) return;
  config.stationHistory = config.stationHistory.filter(h => h.url !== url);
  save(config);
}

module.exports = {
  getStations,
  addStation,
  removeStation,
  getWatchlist,
  addWatchlistEntry,
  removeWatchlistEntry,
  getHistory,
  addToHistory,
  removeFromHistory
};
