// app.js - Main application logic

import KubectlService from '../services/kubectl.js';
import PollerService from '../services/poller.js';
import KubeconfigService from '../services/kubeconfig.js';
import Sidebar from './components/sidebar.js';
import PodGrid from './components/podGrid.js';
import TerminalComponent from './components/terminal.js';
import LogsComponent from './components/logs.js';
import MetricsComponent from './components/metrics.js';
import FileBrowser from './components/fileBrowser.js';

class RickubeApp {
  constructor() {
    // Services
    this.kubectlService = new KubectlService();
    this.pollerService = new PollerService();
    this.kubeconfigService = new KubeconfigService(this.kubectlService);

    // Components
    this.sidebar = new Sidebar('namespace-list', this.onNamespaceSelect.bind(this));
    this.podGrid = new PodGrid('pod-grid', this.onPodSelect.bind(this));
    this.terminal = new TerminalComponent('terminal-container', 'terminal-tabs');
    this.logs = new LogsComponent('logs-container');
    this.metrics = new MetricsComponent();
    this.fileBrowser = new FileBrowser('files-container', this.kubectlService);

    // State
    this.currentNamespace = null;
    this.currentPod = null;
    this.currentPodData = null;
    this.selectedTab = 'details';

    // DOM elements
    this.contextSelect = document.getElementById('context-select');
    this.refreshIndicator = document.getElementById('refresh-indicator');
    this.connectionStatus = document.getElementById('connection-status');
    this.namespaceName = document.getElementById('namespace-name');
    this.podCount = document.getElementById('pod-count');
    this.refreshNamespacesBtn = document.getElementById('refresh-namespaces');

    // Initialize
    this.init();
    this.setupPanelResize();
  }

  setupPanelResize() {
    const mainContent = document.querySelector('.main-content');
    const sidebar = document.getElementById('sidebar');
    const podGridContainer = document.getElementById('pod-grid-container');
    const rightPanel = document.getElementById('right-panel');
    const handle1 = document.getElementById('resize-handle-1');
    const handle2 = document.getElementById('resize-handle-2');

    if (!mainContent || !sidebar || !podGridContainer || !rightPanel || !handle1 || !handle2) {
      return;
    }

    let isResizing = false;
    let currentHandle = null;

    const startResize = (handle) => {
      isResizing = true;
      currentHandle = handle;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    };

    const resize = (e) => {
      if (!isResizing) return;

      const mainContentRect = mainContent.getBoundingClientRect();
      const mouseX = e.clientX - mainContentRect.left;
      const totalWidth = mainContentRect.width;

      if (currentHandle === handle1) {
        // Resizing sidebar
        const newSidebarWidth = (mouseX / totalWidth) * 100;
        if (newSidebarWidth >= 10 && newSidebarWidth <= 40) {
          sidebar.style.width = `${newSidebarWidth}%`;
        }
      } else if (currentHandle === handle2) {
        // Resizing right panel
        const rightPanelLeft = mouseX;
        const newRightPanelWidth = ((totalWidth - rightPanelLeft) / totalWidth) * 100;
        if (newRightPanelWidth >= 15 && newRightPanelWidth <= 50) {
          rightPanel.style.width = `${newRightPanelWidth}%`;
        }
      }
    };

    const stopResize = () => {
      if (isResizing) {
        isResizing = false;
        currentHandle = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    handle1.addEventListener('mousedown', () => startResize(handle1));
    handle2.addEventListener('mousedown', () => startResize(handle2));
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);
  }

  async init() {
    // Check kubectl availability
    const kubectlCheck = await this.kubectlService.check();

    if (!kubectlCheck.success) {
      this.showError('kubectl is not available. Please install kubectl and ensure it is in your PATH.');
      this.updateConnectionStatus(false, kubectlCheck.error);
      return;
    }

    this.updateConnectionStatus(true, 'Connected');

    // Set up event listeners
    this.setupEventListeners();

    // Load contexts
    await this.loadContexts();

    // Load namespaces
    await this.loadNamespaces();

    // Start polling
    this.startPolling();
  }

  setupEventListeners() {
    // Context selector
    this.contextSelect.addEventListener('change', async (e) => {
      const contextName = e.target.value;
      await this.switchContext(contextName);
    });

    // Tab switching
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        this.switchTab(tab);
      });
    });

    // Refresh namespaces button
    this.refreshNamespacesBtn.addEventListener('click', () => {
      this.loadNamespaces();
    });

    // Logs controls
    document.getElementById('logs-pause').addEventListener('click', () => {
      const isPaused = this.logs.togglePause();
      document.getElementById('logs-pause').textContent = isPaused ? 'Resume' : 'Pause';
    });

    document.getElementById('logs-clear').addEventListener('click', () => {
      this.logs.clear();
    });

    document.getElementById('logs-download').addEventListener('click', () => {
      if (this.currentPod) {
        this.logs.downloadLogs(this.currentPod);
      }
    });

    // Copy kubectl exec command button
    document.getElementById('copy-exec-command').addEventListener('click', () => {
      if (this.currentPod && this.currentNamespace) {
        const command = `wsl bash -lc "kubectl exec -it ${this.currentPod} -n ${this.currentNamespace} -- /bin/bash"`;

        // Copy to clipboard
        navigator.clipboard.writeText(command).then(() => {
          this.showSuccess('Command gekopieerd naar clipboard!');
        }).catch(err => {
          console.error('Failed to copy:', err);
          this.showError('Failed to copy command');
        });
      } else {
        this.showError('Selecteer eerst een pod');
      }
    });
  }

  async loadContexts() {
    try {
      const contexts = await this.kubeconfigService.loadContexts();
      const currentContext = this.kubeconfigService.getCurrentContext();

      // Populate context selector
      this.contextSelect.innerHTML = '';
      contexts.forEach(ctx => {
        const option = document.createElement('option');
        option.value = ctx.name;
        option.textContent = `${ctx.name} (${ctx.cluster})`;
        if (ctx.name === currentContext) {
          option.selected = true;
        }
        this.contextSelect.appendChild(option);
      });
    } catch (error) {
      console.error('Failed to load contexts:', error);
      this.showError('Failed to load contexts: ' + error.message);
    }
  }

  async switchContext(contextName) {
    try {
      this.showRefreshing(true);

      await this.kubeconfigService.switchContext(contextName);

      // Stop all polling
      this.pollerService.stopAll();

      // Clear current state
      this.currentNamespace = null;
      this.currentPod = null;
      this.currentPodData = null;

      // Reload namespaces
      await this.loadNamespaces();

      // Restart polling
      this.startPolling();

      this.showRefreshing(false);
    } catch (error) {
      this.showError('Failed to switch context: ' + error.message);
      this.showRefreshing(false);
    }
  }

  async loadNamespaces() {
    try {
      this.sidebar.showLoading();

      const namespacesData = await this.kubectlService.getNamespaces();
      const namespaces = namespacesData.items.map(ns => ({
        name: ns.metadata.name,
      }));

      // Check permissions before rendering
      const permissionChecks = namespaces.map(async (ns) => {
        const hasAccess = await this.kubectlService.canListPods(ns.name);
        ns.noAccess = !hasAccess;
        if (!hasAccess) {
          this.sidebar.noAccessNamespaces.add(ns.name);
        }
        return ns;
      });

      await Promise.all(permissionChecks);

      // Now render the sidebar with permissions already set
      this.sidebar.render(namespaces);

      // Load pod counts only for accessible namespaces
      this.updateNamespacePodCounts();
    } catch (error) {
      console.error('[app] Failed to load namespaces:', error);
      this.sidebar.showError('Failed to load namespaces');
      this.showError('Failed to load namespaces: ' + error.message);
    }
  }

  async updateNamespacePodCounts() {
    // Get all namespaces
    const namespaces = this.sidebar.namespaces;

    // Only fetch pod counts for accessible namespaces (permissions already checked)
    const accessibleNamespaces = namespaces.filter(ns => !ns.noAccess);

    if (accessibleNamespaces.length === 0) {
      return;
    }

    const podCountPromises = accessibleNamespaces.map(async (ns) => {
      try {
        const podsData = await this.kubectlService.getPods(ns.name);
        const count = podsData.items.length;
        this.sidebar.updatePodCount(ns.name, count);
      } catch (error) {
        console.error(`[app] Failed to get pod count for ${ns.name}:`, error);
      }
    });

    await Promise.allSettled(podCountPromises);
  }

  async onNamespaceSelect(namespaceName) {
    this.currentNamespace = namespaceName;
    this.currentPod = null;
    this.currentPodData = null;

    this.namespaceName.textContent = namespaceName;

    // Load pods for this namespace
    await this.loadPods(namespaceName);

    // Stop pod polling and start new one
    this.pollerService.stop('pods');
    this.pollerService.stop('metrics');

    this.pollerService.start('pods', async () => {
      await this.loadPods(namespaceName);
    }, 3000);

    this.pollerService.start('metrics', async () => {
      await this.loadMetrics(namespaceName);
    }, 5000);
  }

  async loadPods(namespace) {
    try {
      this.showRefreshing(true);

      const podsData = await this.kubectlService.getPods(namespace);
      const pods = podsData.items;

      this.podGrid.render(pods);
      this.podCount.textContent = `${pods.length} pod${pods.length !== 1 ? 's' : ''}`;
      this.sidebar.updatePodCount(namespace, pods.length);

      this.showRefreshing(false);
    } catch (error) {
      console.error('Failed to load pods:', error);
      this.podGrid.showError('Failed to load pods');
      this.showRefreshing(false);
    }
  }

  async loadMetrics(namespace) {
    try {
      const metrics = await this.kubectlService.getPodMetrics(namespace);
      this.podGrid.updateMetrics(metrics);

      if (metrics.length === 0 && this.metrics.metricsAvailable) {
        this.metrics.setMetricsUnavailable();
      } else if (metrics.length > 0 && !this.metrics.metricsAvailable) {
        this.metrics.setMetricsAvailable();
      }
    } catch (error) {
      console.error('Failed to load metrics:', error);
      this.metrics.setMetricsUnavailable();
    }
  }

  async onPodSelect(podName, podData) {
    this.currentPod = podName;
    this.currentPodData = podData;

    // Update details tab
    await this.updateDetailsTab();

    // If logs tab is active, start logs
    if (this.selectedTab === 'logs') {
      await this.logs.startLogs(podName, this.currentNamespace);
    }
  }

  async updateDetailsTab() {
    const detailsContainer = document.querySelector('#details-tab .details-container');
    if (!this.currentPodData) {
      detailsContainer.innerHTML = '<div class="empty-state"><p>Select a pod to view details</p></div>';
      return;
    }

    detailsContainer.innerHTML = '';

    // Get pod metrics
    const metricsData = await this.kubectlService.getPodMetrics(this.currentNamespace);
    const podMetrics = metricsData.find(m => m.name === this.currentPod);

    // Render basic info
    detailsContainer.appendChild(this.metrics.renderBasicInfo(this.currentPodData));

    // Render metrics
    detailsContainer.appendChild(this.metrics.renderPodMetrics(this.currentPodData, podMetrics));

    // Render container status
    detailsContainer.appendChild(this.metrics.renderContainerStatus(this.currentPodData));

    // Render conditions
    detailsContainer.appendChild(this.metrics.renderConditions(this.currentPodData));
  }

  switchTab(tabName) {
    this.selectedTab = tabName;

    // Update tab buttons
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
      if (btn.dataset.tab === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update tab content
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
      if (content.id === `${tabName}-tab`) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });

    // Handle tab-specific actions
    if (tabName === 'logs' && this.currentPod && this.currentNamespace) {
      this.logs.startLogs(this.currentPod, this.currentNamespace);
    } else if (tabName === 'logs' && !this.currentPod) {
      this.logs.showEmptyState();
    }

    if (tabName === 'terminal') {
      this.updateTerminalTab();
    }

    if (tabName === 'files' && this.currentPod && this.currentNamespace) {
      this.fileBrowser.init(this.currentPod, this.currentNamespace);
    } else if (tabName === 'files' && !this.currentPod) {
      this.fileBrowser.clear();
    }
  }

  updateTerminalTab() {
    const terminalEmpty = document.getElementById('terminal-empty');
    const commandDisplay = document.getElementById('command-display');
    const kubectlCommand = document.getElementById('kubectl-command');

    if (this.currentPod && this.currentNamespace) {
      const command = `wsl bash -lc "kubectl exec -it ${this.currentPod} -n ${this.currentNamespace} -- /bin/bash"`;
      kubectlCommand.textContent = command;
      terminalEmpty.style.display = 'none';
      commandDisplay.style.display = 'block';
    } else {
      terminalEmpty.style.display = 'block';
      commandDisplay.style.display = 'none';
    }
  }

  startPolling() {
    // Poll namespaces every 10 seconds
    this.pollerService.start('namespaces', async () => {
      await this.updateNamespacePodCounts();
    }, 10000);
  }

  showRefreshing(isRefreshing) {
    if (isRefreshing) {
      this.refreshIndicator.classList.add('active');
    } else {
      this.refreshIndicator.classList.remove('active');
    }
  }

  updateConnectionStatus(isConnected, message) {
    const statusDot = this.connectionStatus.querySelector('.status-dot');
    const statusText = this.connectionStatus.querySelector('.status-text');

    if (isConnected) {
      statusDot.classList.add('connected');
      statusDot.classList.remove('disconnected');
    } else {
      statusDot.classList.add('disconnected');
      statusDot.classList.remove('connected');
    }

    statusText.textContent = message;
  }

  showError(message) {
    const toast = document.getElementById('error-toast');
    const toastMessage = toast.querySelector('.toast-message');
    const toastClose = toast.querySelector('.toast-close');

    toastMessage.textContent = message;
    toast.classList.add('show');
    toast.classList.remove('success');

    toastClose.onclick = () => {
      toast.classList.remove('show');
    };

    // Auto-hide after 5 seconds
    setTimeout(() => {
      toast.classList.remove('show');
    }, 5000);
  }

  showSuccess(message) {
    const toast = document.getElementById('error-toast');
    const toastMessage = toast.querySelector('.toast-message');
    const toastClose = toast.querySelector('.toast-close');

    toastMessage.textContent = message;
    toast.classList.add('show', 'success');

    toastClose.onclick = () => {
      toast.classList.remove('show');
    };

    // Auto-hide after 3 seconds
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  try {
    new RickubeApp();
  } catch (error) {
    console.error('[app] Failed to initialize:', error);
  }
});
