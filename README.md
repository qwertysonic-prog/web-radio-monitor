# Web Radio Monitor

Monitors internet radio streams in real time. See what's playing on multiple stations at once, build a watchlist of favourite artists or songs, and listen directly in your browser.

## Features

- Monitor multiple radio streams simultaneously
- See the currently playing song and artist for each station in real time
- Add artists or songs to a watchlist — the UI highlights when they come on
- Stream audio directly in the browser via a built-in proxy
- Station history so you can quickly re-add previously used streams

---

## Step 1 — Install Node.js

This app runs on **Node.js**, a free tool that lets you run JavaScript outside of a browser.

1. Go to [https://nodejs.org](https://nodejs.org)
2. Click the **LTS** download button (the one labelled "Recommended for most users")
3. Run the installer and follow the prompts — the default options are fine

To confirm it installed correctly, open a terminal (see Step 2) and type:

```
node --version
```

You should see a version number like `v20.11.0`. If you do, you're good to go.

---

## Step 2 — Open a Terminal

A terminal lets you type commands to run the app.

- **Windows:** Press `Win + R`, type `cmd`, and press Enter
- **Mac:** Open **Finder → Applications → Utilities → Terminal**

---

## Step 3 — Download the App

You don't need Git. Just download the project as a ZIP file:

1. Go to [https://github.com/qwertysonic-prog/web-radio-monitor](https://github.com/qwertysonic-prog/web-radio-monitor)
2. Click the green **Code** button near the top right
3. Click **Download ZIP**
4. Once downloaded, right-click the ZIP file and choose **Extract All** (Windows) or double-click it (Mac)
5. Move the extracted folder somewhere easy to find, like your Desktop

---

## Step 4 — Navigate to the Folder in Your Terminal

In your terminal, you need to move into the folder you just extracted.

**Windows example** (if you put it on your Desktop):

```
cd C:\Users\YourName\Desktop\web-radio-monitor-main
```

**Mac example:**

```
cd ~/Desktop/web-radio-monitor-main
```

> Tip: You can type `cd ` (with a space after it) and then drag the folder into the terminal window — it will fill in the path for you.

---

## Step 5 — Install Dependencies

The app uses a few open-source packages. Install them by running:

```
npm install
```

This only needs to be done once. It will create a `node_modules` folder — that's normal.

---

## Step 6 — Start the App

```
npm start
```

You should see:

```
Web Radio Monitor running at http://localhost:3000
```

Now open your browser and go to:

```
http://localhost:3000
```

The app will be running. To stop it, go back to the terminal and press `Ctrl + C`.

---

## Usage

### Adding a Station
Click **Add Station**, enter a name and the stream URL, then click Add. The station will appear as a card and start showing what's playing.

### Watchlist
Open the **Watchlist** panel and add artist names or song titles. When a monitored station plays a match, it will be highlighted in the UI.

### Listening
Each station card has a play button that streams the audio directly through the app — no need to open a separate player.

---

## Data Persistence

Your stations, watchlist, and history are saved automatically to `data/config.json` inside the app folder. They will still be there the next time you start the app.
