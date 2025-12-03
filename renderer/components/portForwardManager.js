// portForwardManager.js - Manages active port forwards

class PortForwardManager {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.activeForwards = new Map();
    this.listeners = [];

    // Setup IPC listeners
    this.setupListeners();
  }

  setupListeners() {
    window.api.portforward.onData(({ forwardId, data }) => {
      console.log(`[portforward:${forwardId}] ${data}`);
    });

    window.api.portforward.onError(({ forwardId, data }) => {
      console.warn(`[portforward:${forwardId}] Error: ${data}`);
      // Show error notification if it's a binding error
      if (data.includes('address already in use') || data.includes('unable to listen')) {
        this.showError(`Port forward failed: port already in use`);
      } else if (data.includes('error')) {
        this.showError(`Port forward error: ${data}`);
      }
    });

    window.api.portforward.onExit(({ forwardId }) => {
      console.log(`[portforward:${forwardId}] Exited`);
      this.activeForwards.delete(forwardId);
      this.render();
      this.notifyListeners();
    });

    // Refresh list on startup
    this.refreshList();
  }

  showError(message) {
    // Create toast notification for errors
    const toast = document.createElement('div');
    toast.className = 'toast error';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  async startForward(resourceType, name, namespace, localPort, remotePort) {
    const result = await window.api.portforward.start({
      resourceType,
      name,
      namespace,
      localPort,
      remotePort
    });

    if (result.success) {
      this.activeForwards.set(result.forwardId, {
        forwardId: result.forwardId,
        resourceType,
        name,
        namespace,
        localPort,
        remotePort,
        startTime: new Date().toISOString()
      });
      this.render();
      this.notifyListeners();
    }

    return result;
  }

  async stopForward(forwardId) {
    const result = await window.api.portforward.stop({ forwardId });
    if (result.success) {
      this.activeForwards.delete(forwardId);
      this.render();
      this.notifyListeners();
    }
    return result;
  }

  async stopAll() {
    const result = await window.api.portforward.stopAll();
    if (result.success) {
      this.activeForwards.clear();
      this.render();
      this.notifyListeners();
    }
    return result;
  }

  async refreshList() {
    const result = await window.api.portforward.list();
    if (result.success) {
      this.activeForwards.clear();
      result.data.forEach(f => this.activeForwards.set(f.forwardId, f));
      this.render();
      this.notifyListeners();
    }
  }

  render() {
    if (!this.container) return;

    const count = this.activeForwards.size;

    // Update count badge
    const countEl = document.getElementById('port-forwards-count');
    if (countEl) {
      countEl.textContent = count;
    }

    // Render list
    const listEl = document.getElementById('port-forwards-list');
    if (!listEl) return;

    if (count === 0) {
      listEl.innerHTML = '<div class="port-forwards-empty">No active port forwards</div>';
      return;
    }

    listEl.innerHTML = '';
    this.activeForwards.forEach((forward, forwardId) => {
      const item = document.createElement('div');
      item.className = 'port-forward-item';
      item.innerHTML = `
        <div class="port-forward-info">
          <span class="port-forward-resource">${forward.resourceType}/${forward.name}</span>
          <span class="port-forward-namespace">${forward.namespace}</span>
          <span class="port-forward-ports">${forward.localPort}:${forward.remotePort}</span>
        </div>
        <div class="port-forward-actions">
          <a href="http://localhost:${forward.localPort}" target="_blank" class="port-forward-link" title="Open in browser">Open</a>
          <button class="port-forward-stop" data-forward-id="${forwardId}" title="Stop">Stop</button>
        </div>
      `;

      item.querySelector('.port-forward-stop').addEventListener('click', (e) => {
        e.stopPropagation();
        this.stopForward(forwardId);
      });

      listEl.appendChild(item);
    });
  }

  getCount() {
    return this.activeForwards.size;
  }

  // Observer pattern for UI updates
  addListener(callback) {
    this.listeners.push(callback);
  }

  removeListener(callback) {
    this.listeners = this.listeners.filter(cb => cb !== callback);
  }

  notifyListeners() {
    this.listeners.forEach(cb => cb(this.activeForwards.size));
  }
}

export default PortForwardManager;
