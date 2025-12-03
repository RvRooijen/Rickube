// events.js - Events panel component

class EventsComponent {
  constructor(containerId, kubectlService) {
    this.container = document.getElementById(containerId);
    this.kubectlService = kubectlService;

    // State
    this.events = [];
    this.filter = 'all'; // 'all' or 'warnings'
    this.isCollapsed = false;

    // DOM elements
    this.panel = document.getElementById('events-panel');
    this.countEl = document.getElementById('events-count');
    this.warningCountEl = document.getElementById('events-warning-count');
    this.toggleBtn = document.getElementById('events-toggle');
    this.filterAllBtn = document.getElementById('events-filter-all');
    this.filterWarningsBtn = document.getElementById('events-filter-warnings');
    this.clearBtn = document.getElementById('events-clear');
    this.resizeHandle = document.getElementById('events-resize-handle');

    this.setupEventListeners();
    this.setupResize();
  }

  setupEventListeners() {
    // Toggle panel
    this.toggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePanel();
    });

    // Header click to toggle
    const header = this.panel?.querySelector('.events-panel-header');
    header?.addEventListener('dblclick', () => {
      this.togglePanel();
    });

    // Filter buttons
    this.filterAllBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setFilter('all');
    });

    this.filterWarningsBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setFilter('warnings');
    });

    // Clear button
    this.clearBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.clear();
    });
  }

  setupResize() {
    if (!this.resizeHandle || !this.panel) return;

    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    this.resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startY = e.clientY;
      startHeight = this.panel.offsetHeight;
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;

      const deltaY = startY - e.clientY;
      const newHeight = Math.max(100, Math.min(window.innerHeight * 0.5, startHeight + deltaY));
      this.panel.style.height = `${newHeight}px`;
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  togglePanel() {
    this.isCollapsed = !this.isCollapsed;
    this.panel?.classList.toggle('collapsed', this.isCollapsed);
    if (this.toggleBtn) {
      this.toggleBtn.textContent = this.isCollapsed ? '▲' : '▼';
    }
  }

  setFilter(filter) {
    this.filter = filter;

    // Update button states
    this.filterAllBtn?.classList.toggle('active', filter === 'all');
    this.filterWarningsBtn?.classList.toggle('active', filter === 'warnings');

    this.render();
  }

  async loadEvents(namespace) {
    if (!namespace) {
      this.showEmptyState();
      return;
    }

    try {
      const eventsData = await this.kubectlService.getEvents(namespace);

      // Sort by timestamp (newest first) and limit
      this.events = (eventsData.items || [])
        .sort((a, b) => {
          const timeA = new Date(a.lastTimestamp || a.eventTime || 0);
          const timeB = new Date(b.lastTimestamp || b.eventTime || 0);
          return timeB - timeA;
        })
        .slice(0, 100);

      this.updateCounts();
      this.render();
    } catch (error) {
      console.error('[events] Failed to load:', error);
      this.events = [];
      this.updateCounts();
      this.render();
    }
  }

  updateCounts() {
    const total = this.events.length;
    const warnings = this.events.filter(e => e.type === 'Warning').length;

    if (this.countEl) {
      this.countEl.textContent = total;
    }
    if (this.warningCountEl) {
      this.warningCountEl.textContent = warnings > 0 ? `${warnings} warnings` : '';
    }
  }

  render() {
    if (!this.container) return;

    const filteredEvents = this.filter === 'warnings'
      ? this.events.filter(e => e.type === 'Warning')
      : this.events;

    if (filteredEvents.length === 0) {
      this.container.innerHTML = `
        <div class="empty-state">
          <p>${this.filter === 'warnings' ? 'No warnings' : 'No events'}</p>
        </div>
      `;
      return;
    }

    this.container.innerHTML = '';

    filteredEvents.forEach(event => {
      this.container.appendChild(this.renderEventItem(event));
    });

    // Auto-scroll to top (newest events)
    this.container.scrollTop = 0;
  }

  renderEventItem(event) {
    const item = document.createElement('div');
    const isWarning = event.type === 'Warning';
    item.className = `event-item ${isWarning ? 'event-warning' : 'event-normal'}`;

    const timestamp = event.lastTimestamp || event.eventTime;
    const age = this.calculateAge(timestamp);
    const involvedObject = event.involvedObject || {};
    const source = `${involvedObject.kind || 'Unknown'}/${involvedObject.name || 'unknown'}`;
    const reason = event.reason || '';
    const message = event.message || '';

    item.innerHTML = `
      <div class="event-icon">${isWarning ? '⚠' : '✓'}</div>
      <div class="event-content">
        <div class="event-header">
          <span class="event-type ${isWarning ? 'type-warning' : 'type-normal'}">${reason}</span>
          <span class="event-time">${age} ago</span>
          <span class="event-source">${source}</span>
        </div>
        <div class="event-message">${message}</div>
      </div>
    `;

    return item;
  }

  calculateAge(timestamp) {
    if (!timestamp) return 'unknown';

    const now = new Date();
    const created = new Date(timestamp);
    const diffMs = now - created;

    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }

  showEmptyState() {
    if (this.container) {
      this.container.innerHTML = `
        <div class="empty-state">
          <p>Select a namespace to view events</p>
        </div>
      `;
    }
    this.events = [];
    this.updateCounts();
  }

  clear() {
    this.events = [];
    this.updateCounts();
    this.render();
  }
}

export default EventsComponent;
