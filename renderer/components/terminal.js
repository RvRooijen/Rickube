// terminal.js - Interactive terminal component

// Note: Terminal and FitAddon are loaded via script tags in index.html
// They are available as global objects on window

class TerminalComponent {
  constructor(containerId, tabsContainerId) {
    this.container = document.getElementById(containerId);
    this.tabsContainer = document.getElementById(tabsContainerId);
    this.terminals = new Map();
    this.activeTerminalId = null;
    this.terminalCounter = 0;

    // Listen for terminal data from main process
    window.api.terminal.onData(({ terminalId, data }) => {
      const terminal = this.terminals.get(terminalId);
      if (terminal && terminal.xterm) {
        terminal.xterm.write(data);
      }
    });

    // Listen for terminal exit
    window.api.terminal.onExit(({ terminalId }) => {
      this.closeTerminal(terminalId);
    });
  }

  // Create a new terminal session
  async createTerminal(podName, namespace) {
    if (!podName || !namespace) {
      console.error('Pod name and namespace are required');
      return;
    }

    // Check if Terminal and FitAddon are available
    console.log('[terminal] Checking libraries:', {
      hasTerminal: !!window.Terminal,
      hasFitAddon: !!window.FitAddon,
      windowKeys: Object.keys(window).filter(k => k.toLowerCase().includes('term') || k.toLowerCase().includes('fit'))
    });

    if (!window.Terminal) {
      throw new Error('Terminal library not loaded');
    }

    const terminalId = `terminal-${++this.terminalCounter}`;

    // Create xterm instance
    const xterm = new window.Terminal({
      cursorBlink: true,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selection: '#264f78',
      },
      fontSize: 14,
      fontFamily: 'Consolas, "Courier New", monospace',
    });

    // FitAddon is optional - try to load it but don't fail if it's not available
    let fitAddon = null;
    try {
      // Try different ways FitAddon might be exposed
      let FitAddonClass = null;

      if (typeof window.FitAddon === 'function') {
        FitAddonClass = window.FitAddon;
      } else if (window.FitAddon && typeof window.FitAddon.FitAddon === 'function') {
        FitAddonClass = window.FitAddon.FitAddon;
      }

      if (FitAddonClass) {
        fitAddon = new FitAddonClass();
        xterm.loadAddon(fitAddon);
        console.log('[terminal] FitAddon loaded successfully');
      } else {
        console.warn('[terminal] FitAddon not available, terminal will work without auto-resize');
      }
    } catch (error) {
      console.warn('[terminal] Failed to load FitAddon:', error.message);
    }

    // Store terminal data
    this.terminals.set(terminalId, {
      xterm,
      fitAddon,
      podName,
      namespace,
      element: null,
    });

    // Create terminal element
    const terminalElement = document.createElement('div');
    terminalElement.className = 'terminal-instance';
    terminalElement.id = terminalId;
    terminalElement.style.display = 'none';

    this.container.innerHTML = '';
    this.container.appendChild(terminalElement);
    this.terminals.get(terminalId).element = terminalElement;

    // Open xterm
    xterm.open(terminalElement);
    if (fitAddon) {
      fitAddon.fit();
    }

    // Handle terminal input
    xterm.onData((data) => {
      window.api.terminal.write({ terminalId, data });
    });

    // Handle resize
    xterm.onResize(({ cols, rows }) => {
      window.api.terminal.resize({ terminalId, cols, rows });
    });

    // Create terminal tab
    this.createTab(terminalId, podName);

    // Start terminal session in main process
    const result = await window.api.terminal.create({
      podName,
      namespace,
      terminalId,
    });

    if (!result.success) {
      xterm.writeln(`\x1b[31mError: ${result.error}\x1b[0m`);
      return;
    }

    // Show the terminal
    this.showTerminal(terminalId);

    // Fit terminal after it's visible
    if (fitAddon) {
      setTimeout(() => {
        fitAddon.fit();
      }, 100);
    }
  }

  // Create a terminal tab
  createTab(terminalId, podName) {
    const tab = document.createElement('div');
    tab.className = 'terminal-tab';
    tab.dataset.terminalId = terminalId;

    const label = document.createElement('span');
    label.className = 'terminal-tab-label';
    label.textContent = podName;
    label.title = podName;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'terminal-tab-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTerminal(terminalId);
    });

    tab.appendChild(label);
    tab.appendChild(closeBtn);

    tab.addEventListener('click', () => {
      this.showTerminal(terminalId);
    });

    this.tabsContainer.appendChild(tab);
  }

  // Show a terminal
  showTerminal(terminalId) {
    // Hide all terminals
    this.terminals.forEach((terminal, id) => {
      if (terminal.element) {
        terminal.element.style.display = 'none';
      }
    });

    // Remove active class from all tabs
    const tabs = this.tabsContainer.querySelectorAll('.terminal-tab');
    tabs.forEach(tab => tab.classList.remove('active'));

    // Show selected terminal
    const terminal = this.terminals.get(terminalId);
    if (terminal && terminal.element) {
      terminal.element.style.display = 'block';
      this.activeTerminalId = terminalId;

      // Set active tab
      const tab = this.tabsContainer.querySelector(`[data-terminal-id="${terminalId}"]`);
      if (tab) {
        tab.classList.add('active');
      }

      // Fit terminal
      if (terminal.fitAddon) {
        setTimeout(() => {
          terminal.fitAddon.fit();
        }, 50);
      }
    }
  }

  // Close a terminal
  async closeTerminal(terminalId) {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) return;

    // Dispose xterm
    if (terminal.xterm) {
      terminal.xterm.dispose();
    }

    // Remove element
    if (terminal.element) {
      terminal.element.remove();
    }

    // Remove tab
    const tab = this.tabsContainer.querySelector(`[data-terminal-id="${terminalId}"]`);
    if (tab) {
      tab.remove();
    }

    // Remove from map
    this.terminals.delete(terminalId);

    // Close in main process
    await window.api.terminal.close({ terminalId });

    // Show another terminal if available
    if (this.terminals.size > 0) {
      const nextTerminalId = Array.from(this.terminals.keys())[0];
      this.showTerminal(nextTerminalId);
    } else {
      this.showEmptyState();
    }
  }

  // Show empty state
  showEmptyState() {
    this.container.innerHTML = '<div class="empty-state"><p>Select a pod and click "New Terminal" to start a shell session</p></div>';
  }

  // Close all terminals
  closeAll() {
    const terminalIds = Array.from(this.terminals.keys());
    terminalIds.forEach(id => this.closeTerminal(id));
  }

  // Get active terminal
  getActiveTerminal() {
    return this.terminals.get(this.activeTerminalId);
  }
}

export default TerminalComponent;
