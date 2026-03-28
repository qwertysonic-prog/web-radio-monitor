class StationCard {
  constructor(station, onRemove) {
    this.station = station;
    this.onRemove = onRemove;
    this.audio = null;
    this.playing = false;
    this.manualVolume = false; // true when user manually adjusts volume
    this.matched = false;
    this.currentVolume = 0;
    this.targetVolume = 0;
    this.fadeInterval = null;
    this.graceTimer = null; // 15s grace period before unmatch fade-down

    this.el = this._createElement();
  }

  _createElement() {
    const card = document.createElement('div');
    card.className = 'station-card';
    card.dataset.stationId = this.station.id;

    card.innerHTML = `
      <div class="station-card-header">
        <h3><span class="status-dot"></span>${this._escapeHtml(this.station.name)}</h3>
        <button class="remove-station" title="Remove station">&times;</button>
      </div>
      <div class="now-playing">
        <div class="now-playing-label">Now Playing</div>
        <div class="now-playing-text">Waiting for metadata...</div>
        <div class="match-indicator">MATCH - Volume up!</div>
      </div>
      <div class="volume-controls">
        <button class="mute-btn" title="Mute">M</button>
        <input type="range" class="volume-slider" min="0" max="100" value="0">
        <span class="volume-label">0%</span>
      </div>
      <button class="play-btn">Play Stream</button>
    `;

    // Event listeners
    card.querySelector('.remove-station').addEventListener('click', () => {
      this.stop();
      this.onRemove(this.station.id);
    });

    card.querySelector('.play-btn').addEventListener('click', () => {
      if (this.playing) {
        this.stop();
      } else {
        this.play();
      }
    });

    const slider = card.querySelector('.volume-slider');
    slider.addEventListener('input', () => {
      this.manualVolume = true;
      this._setVolume(parseInt(slider.value) / 100);
    });

    // Reset manual override after 30 seconds
    slider.addEventListener('change', () => {
      setTimeout(() => { this.manualVolume = false; }, 30000);
    });

    card.querySelector('.mute-btn').addEventListener('click', () => {
      if (this.currentVolume > 0) {
        this._setVolume(0);
        this.manualVolume = true;
        setTimeout(() => { this.manualVolume = false; }, 30000);
      } else {
        this._setVolume(1);
        this.manualVolume = false;
      }
    });

    return card;
  }

  play() {
    if (this.audio) this.stop();

    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.src = `/api/stream/${this.station.id}`;
    this.audio.volume = this.currentVolume;

    this.audio.play().then(() => {
      this.playing = true;
      this._updatePlayButton();
      this._setStatusDot('connected');
      // If there's already a match, turn volume up immediately
      if (this.matched && !this.manualVolume) {
        this._fadeVolume(1.0);
      }
    }).catch(err => {
      console.error('Playback failed:', err);
      this._setStatusDot('error');
    });

    this.audio.addEventListener('error', () => {
      this._setStatusDot('error');
    });
  }

  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
    this.playing = false;
    this._updatePlayButton();
    this._setStatusDot('');
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
  }

  updateMetadata(artist, title, raw) {
    const textEl = this.el.querySelector('.now-playing-text');
    if (artist && title) {
      textEl.textContent = `${artist} - ${title}`;
    } else {
      textEl.textContent = raw || 'Waiting for metadata...';
    }
  }

  setMatch(isMatch, immediate) {
    if (isMatch) {
      // Cancel any pending grace-period unmatch
      if (this.graceTimer) {
        clearTimeout(this.graceTimer);
        this.graceTimer = null;
      }

      const wasMatched = this.matched;
      this.matched = true;
      this.el.classList.add('matched');
      this.el.querySelector('.now-playing-text').classList.add('matched');

      if (!this.manualVolume && this.playing && !wasMatched) {
        this._fadeVolume(1.0);
      }
    } else if (this.matched || this.graceTimer) {
      if (immediate) {
        // Skip grace period (e.g. 6-minute timeout — song definitely ended)
        if (this.graceTimer) {
          clearTimeout(this.graceTimer);
          this.graceTimer = null;
        }
        this.matched = false;
        this.el.classList.remove('matched');
        this.el.querySelector('.now-playing-text').classList.remove('matched');
        if (!this.manualVolume && this.playing) {
          this._fadeVolume(0);
        }
      } else if (!this.graceTimer) {
        // 15s grace period — metadata may have updated before the song actually ended
        this.graceTimer = setTimeout(() => {
          this.graceTimer = null;
          this.matched = false;
          this.el.classList.remove('matched');
          this.el.querySelector('.now-playing-text').classList.remove('matched');
          if (!this.manualVolume && this.playing) {
            this._fadeVolume(0);
          }
        }, 15000);
      }
    }
  }

  _fadeVolume(target) {
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
    }

    this.targetVolume = target;
    const step = target > this.currentVolume ? 0.05 : -0.05;

    this.fadeInterval = setInterval(() => {
      this.currentVolume += step;

      if ((step > 0 && this.currentVolume >= this.targetVolume) ||
          (step < 0 && this.currentVolume <= this.targetVolume)) {
        this.currentVolume = this.targetVolume;
        clearInterval(this.fadeInterval);
        this.fadeInterval = null;
      }

      this.currentVolume = Math.max(0, Math.min(1, this.currentVolume));
      this._applyVolume();
    }, 50); // ~1 second total fade
  }

  _setVolume(vol) {
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }
    this.currentVolume = Math.max(0, Math.min(1, vol));
    this._applyVolume();
  }

  _applyVolume() {
    if (this.audio) {
      this.audio.volume = this.currentVolume;
    }
    const slider = this.el.querySelector('.volume-slider');
    const label = this.el.querySelector('.volume-label');
    slider.value = Math.round(this.currentVolume * 100);
    label.textContent = Math.round(this.currentVolume * 100) + '%';
  }

  _updatePlayButton() {
    const btn = this.el.querySelector('.play-btn');
    if (this.playing) {
      btn.textContent = 'Stop Stream';
      btn.classList.add('playing');
    } else {
      btn.textContent = 'Play Stream';
      btn.classList.remove('playing');
    }
  }

  _setStatusDot(status) {
    const dot = this.el.querySelector('.status-dot');
    dot.className = 'status-dot';
    if (status) dot.classList.add(status);
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  destroy() {
    this.stop();
    this.el.remove();
  }
}
