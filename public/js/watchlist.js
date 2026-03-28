class WatchlistManager {
  constructor() {
    this.entries = [];
    this.listEl = document.getElementById('watchlist-entries');
  }

  setEntries(entries) {
    this.entries = entries;
    this._render();
  }

  addEntry(entry) {
    this.entries.push(entry);
    this._render();
  }

  removeEntry(id) {
    this.entries = this.entries.filter(e => e.id !== id);
    this._render();
  }

  /**
   * Check if the given artist/title matches any watchlist entry.
   * Returns true if there's a case-insensitive substring match.
   */
  checkMatch(artist, title) {
    const artistLower = (artist || '').toLowerCase();
    const titleLower = (title || '').toLowerCase();

    return this.entries.some(entry => {
      const value = entry.value.toLowerCase();
      if (entry.type === 'artist') {
        return artistLower.includes(value);
      } else if (entry.type === 'song') {
        return titleLower.includes(value);
      }
      // Generic match: check both fields
      return artistLower.includes(value) || titleLower.includes(value);
    });
  }

  _render() {
    this.listEl.innerHTML = '';
    for (const entry of this.entries) {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="type-badge">${entry.type}</span>
        <span>${this._escapeHtml(entry.value)}</span>
        <button class="remove-btn" title="Remove">&times;</button>
      `;
      li.querySelector('.remove-btn').addEventListener('click', () => {
        this._deleteEntry(entry.id);
      });
      this.listEl.appendChild(li);
    }
  }

  async _deleteEntry(id) {
    try {
      await fetch(`/api/watchlist/${id}`, { method: 'DELETE' });
      this.removeEntry(id);
    } catch (err) {
      console.error('Failed to delete watchlist entry:', err);
    }
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
