# Web Radio Monitor

Monitors internet radio streams in real time and auto-adjusts volume when favourite artists or songs come on. Reads ICY metadata from live streams via a Node.js proxy with a WebSocket-powered browser UI.

## Features

- Monitor multiple radio streams simultaneously
- See the currently playing song and artist for each station in real time
- Add artists or songs to a watchlist — the UI highlights when they come on
- Stream audio directly in the browser via a built-in proxy
- Station history so you can quickly re-add previously used streams

## Prerequisites

- [Node.js](https://nodejs.org/) v16 or higher
- npm (included with Node.js)

## Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/qwertysonic-prog/web-radio-monitor.git
   cd web-radio-monitor
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

## Running the App

```bash
npm start
```

Then open your browser and go to:

```
http://localhost:3000
```

The server defaults to port **3000**. To use a different port, set the `PORT` environment variable:

```bash
PORT=8080 npm start
```

## Usage

### Adding a Station
Click **Add Station**, enter a name and the stream URL (e.g. an `.mp3` or Shoutcast/Icecast stream URL), then click Add. The station will appear as a card and start monitoring immediately.

### Watchlist
Open the **Watchlist** panel and add artist names or song titles. When a monitored station plays a match, it will be highlighted in the UI.

### Listening
Each station card has a play button that streams the audio directly through the built-in proxy — no need to open a separate player.

## Project Structure

```
web-radio-monitor/
├── server/
│   ├── index.js          # Express server, REST API, WebSocket broadcast
│   ├── store.js          # In-memory + file-backed data store
│   ├── streamMonitor.js  # ICY metadata polling for each station
│   └── streamProxy.js    # Proxies the audio stream to the browser
├── public/
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── app.js
│       ├── stationCard.js
│       └── watchlist.js
└── data/
    └── config.json       # Persisted stations, watchlist, and history
```

## Data Persistence

Stations, watchlist entries, and station history are saved to `data/config.json` automatically. This file is included in the repo with a few example stations — edit or clear it as needed.
