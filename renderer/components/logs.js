// logs.js - Log viewer component

class LogsComponent {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.logContent = null;
    this.isPaused = false;
    this.currentLogId = null;
    this.logBuffer = [];
    this.maxLines = 1000;

    // Listen for log data from main process
    window.api.logs.onData(({ logId, data }) => {
      if (logId === this.currentLogId && !this.isPaused) {
        this.appendLog(data);
      } else if (logId === this.currentLogId && this.isPaused) {
        // Buffer logs when paused
        this.logBuffer.push(data);
      }
    });

    // Listen for log errors
    window.api.logs.onError(({ logId, data }) => {
      if (logId === this.currentLogId) {
        this.appendLog(`[ERROR] ${data}`, true);
      }
    });

    // Listen for log exit
    window.api.logs.onExit(({ logId }) => {
      if (logId === this.currentLogId) {
        this.appendLog('[Process ended]', true);
      }
    });
  }

  // Start streaming logs
  async startLogs(podName, namespace) {
    // Stop existing logs
    await this.stopLogs();

    this.currentLogId = `logs-${podName}-${Date.now()}`;

    // Clear container and create log area
    this.container.innerHTML = '';
    this.logContent = document.createElement('div');
    this.logContent.className = 'log-content';
    this.container.appendChild(this.logContent);

    // Start streaming
    const result = await window.api.logs.start({
      podName,
      namespace,
      logId: this.currentLogId,
    });

    if (!result.success) {
      this.showError(result.error);
    }
  }

  // Stop streaming logs
  async stopLogs() {
    if (this.currentLogId) {
      await window.api.logs.stop({ logId: this.currentLogId });
      this.currentLogId = null;
    }
    this.logBuffer = [];
  }

  // Append log line
  appendLog(text, isError = false) {
    if (!this.logContent) return;

    const lines = text.split('\n');
    lines.forEach(line => {
      if (!line.trim()) return;

      const logLine = document.createElement('div');
      logLine.className = 'log-line';
      if (isError) {
        logLine.classList.add('error');
      }
      logLine.textContent = line;
      this.logContent.appendChild(logLine);
    });

    // Trim old lines if exceeding max
    while (this.logContent.children.length > this.maxLines) {
      this.logContent.removeChild(this.logContent.firstChild);
    }

    // Auto-scroll to bottom if not paused
    if (!this.isPaused) {
      this.logContent.scrollTop = this.logContent.scrollHeight;
    }
  }

  // Pause/resume logs
  togglePause() {
    this.isPaused = !this.isPaused;

    if (!this.isPaused && this.logBuffer.length > 0) {
      // Flush buffer
      this.logBuffer.forEach(data => this.appendLog(data));
      this.logBuffer = [];
    }

    return this.isPaused;
  }

  // Clear logs
  clear() {
    if (this.logContent) {
      this.logContent.innerHTML = '';
    }
    this.logBuffer = [];
  }

  // Get log content as text
  getLogText() {
    if (!this.logContent) return '';
    return Array.from(this.logContent.children)
      .map(line => line.textContent)
      .join('\n');
  }

  // Download logs
  downloadLogs(podName) {
    const text = this.getLogText();
    if (!text) return;

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${podName}-logs-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Show error state
  showError(message) {
    this.container.innerHTML = `<div class="error-state">${message}</div>`;
  }

  // Show empty state
  showEmptyState() {
    this.container.innerHTML = '<div class="empty-state"><p>Select a pod to view logs</p></div>';
  }
}

export default LogsComponent;
