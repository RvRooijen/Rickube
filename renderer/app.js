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
import WorkloadsComponent from './components/workloads.js';
import EventsComponent from './components/events.js';
import NetworkingComponent from './components/networking.js';
import ConfigComponent from './components/config.js';
import StorageComponent from './components/storage.js';
import ClusterComponent from './components/cluster.js';
import PortForwardManager from './components/portForwardManager.js';

class RickubeApp {
  constructor() {
    // Services
    this.kubectlService = new KubectlService();
    this.pollerService = new PollerService();
    this.kubeconfigService = new KubeconfigService(this.kubectlService);

    // Components
    this.sidebar = new Sidebar('namespace-list', this.onNamespaceSelect.bind(this));
    this.podGrid = new PodGrid('pod-grid', this.onPodSelect.bind(this), {
      logs: this.onPodContextLogs.bind(this),
      terminal: this.onPodContextTerminal.bind(this),
      describe: this.onPodContextDescribe.bind(this),
      files: this.onPodContextFiles.bind(this),
      yaml: this.onPodContextYaml.bind(this),
      delete: this.onPodContextDelete.bind(this),
    });
    this.terminal = new TerminalComponent('terminal-container', 'terminal-tabs');
    this.logs = new LogsComponent('logs-container');
    this.metrics = new MetricsComponent();
    this.fileBrowser = new FileBrowser('files-container', this.kubectlService);
    this.workloads = new WorkloadsComponent('workloads-container', this.kubectlService, {
      onScale: this.onWorkloadScale.bind(this),
      onRestart: this.onWorkloadRestart.bind(this),
      onRollback: this.onWorkloadRollback.bind(this),
      onTriggerJob: this.onTriggerCronJob.bind(this),
      onSelect: this.onResourceSelect.bind(this),
    });
    this.events = new EventsComponent('events-list', this.kubectlService);
    this.networking = new NetworkingComponent('networking-container', this.kubectlService, {
      onPortForward: this.onPortForward.bind(this),
      onSelect: this.onResourceSelect.bind(this),
    });
    this.config = new ConfigComponent('config-container', this.kubectlService, {
      onViewConfigMap: this.onViewConfigMap.bind(this),
      onViewSecret: this.onViewSecret.bind(this),
      onSelect: this.onResourceSelect.bind(this),
    });
    this.storage = new StorageComponent('storage-container', this.kubectlService, {
      onSelect: this.onResourceSelect.bind(this),
    });
    this.cluster = new ClusterComponent('cluster-container', this.kubectlService, {
      onSelect: this.onResourceSelect.bind(this),
    });
    this.portForwardManager = new PortForwardManager('port-forwards-list');

    // State
    this.currentNamespace = null;
    this.currentPod = null;
    this.currentPodData = null;
    this.currentResource = null;       // { type, name, data }
    this.selectedTab = 'details';
    this.currentMainView = 'pods';

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
    const mainViewContainer = document.getElementById('main-view-container');
    const rightPanel = document.getElementById('right-panel');
    const handle1 = document.getElementById('resize-handle-1');
    const handle2 = document.getElementById('resize-handle-2');

    if (!mainContent || !sidebar || !mainViewContainer || !rightPanel || !handle1 || !handle2) {
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

    // Main view tab switching (Pods/Workloads)
    const mainViewTabs = document.querySelectorAll('.main-view-tab');
    mainViewTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        this.switchMainView(view);
      });
    });

    // Right panel tab switching
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

    // Port forwards panel controls
    document.getElementById('stop-all-forwards').addEventListener('click', () => {
      this.portForwardManager.stopAll();
    });

    document.getElementById('port-forwards-toggle').addEventListener('click', () => {
      const panel = document.getElementById('port-forwards-panel');
      panel.classList.toggle('collapsed');
      const toggleBtn = document.getElementById('port-forwards-toggle');
      toggleBtn.textContent = panel.classList.contains('collapsed') ? '▲' : '▼';
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

    // Load pods and events for this namespace
    await Promise.all([
      this.loadPods(namespaceName),
      this.loadEvents(namespaceName)
    ]);

    // Stop existing polling and start new ones
    this.pollerService.stop('pods');
    this.pollerService.stop('metrics');
    this.pollerService.stop('events');

    this.pollerService.start('pods', async () => {
      await this.loadPods(namespaceName);
    }, 3000);

    this.pollerService.start('metrics', async () => {
      await this.loadMetrics(namespaceName);
    }, 5000);

    // Events polling - always active regardless of view
    this.pollerService.start('events', async () => {
      await this.loadEvents(namespaceName);
    }, 10000);
  }

  async loadEvents(namespace) {
    try {
      await this.events.loadEvents(namespace);
    } catch (error) {
      console.error('[app] Failed to load events:', error);
    }
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

  // Pod context menu handlers
  onPodContextLogs(podName, podData) {
    this.currentPod = podName;
    this.currentPodData = podData;
    this.switchTab('logs');
    this.logs.startLogs(podName, this.currentNamespace);
  }

  onPodContextTerminal(podName, podData) {
    this.currentPod = podName;
    this.currentPodData = podData;
    this.switchTab('terminal');
    // Get first container name
    const containerName = podData.spec?.containers?.[0]?.name;
    if (containerName) {
      this.terminal.createNewTab(this.currentNamespace, podName, containerName);
    }
  }

  onPodContextDescribe(podName, podData) {
    this.currentPod = podName;
    this.currentPodData = podData;
    this.switchTab('details');
    this.updateDetailsTab();
  }

  onPodContextFiles(podName, podData) {
    this.currentPod = podName;
    this.currentPodData = podData;
    this.switchTab('files');
    const containerName = podData.spec?.containers?.[0]?.name;
    if (containerName) {
      this.fileBrowser.loadDirectory(this.currentNamespace, podName, containerName, '/');
    }
  }

  async onPodContextYaml(podName, podData) {
    // Get full YAML for the pod
    try {
      const result = await this.kubectlService.api.exec([
        'get', 'pod', podName, '-n', this.currentNamespace, '-o', 'yaml'
      ]);
      if (result.success) {
        this.showYamlModal('Pod: ' + podName, result.data);
      }
    } catch (error) {
      this.showError('Failed to get pod YAML: ' + error.message);
    }
  }

  async onPodContextDelete(podName, podData) {
    const confirmed = await this.showConfirmModal(
      'Delete Pod',
      `Are you sure you want to delete pod "${podName}"? This action cannot be undone.`
    );

    if (confirmed) {
      try {
        await this.kubectlService.api.exec([
          'delete', 'pod', podName, '-n', this.currentNamespace
        ]);
        this.showSuccess(`Pod ${podName} deleted`);
        // Refresh pod list
        await this.loadPods(this.currentNamespace);
      } catch (error) {
        this.showError('Failed to delete pod: ' + error.message);
      }
    }
  }

  showYamlModal(title, yaml) {
    // Reuse configmap modal for showing YAML
    const modal = document.getElementById('configmap-modal');
    const modalName = document.getElementById('configmap-modal-name');
    const dataList = document.getElementById('configmap-data-list');
    const closeBtn = document.getElementById('configmap-modal-close');

    modalName.textContent = title;
    dataList.innerHTML = `<pre class="yaml-output">${this.escapeHtml(yaml)}</pre>`;
    modal.classList.add('show');

    closeBtn.onclick = () => {
      modal.classList.remove('show');
    };

    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.classList.remove('show');
      }
    };
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

  // Main view switching (Pods/Workloads)
  switchMainView(viewName) {
    this.currentMainView = viewName;

    // Update tab buttons
    const mainViewTabs = document.querySelectorAll('.main-view-tab');
    mainViewTabs.forEach(btn => {
      if (btn.dataset.view === viewName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update view content
    const viewContents = document.querySelectorAll('.main-view-content');
    viewContents.forEach(content => {
      if (content.id === `${viewName}-view`) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });

    // Stop all view-specific polling first
    this.pollerService.stop('workloads');
    this.pollerService.stop('networking');
    this.pollerService.stop('config');
    this.pollerService.stop('storage');
    this.pollerService.stop('cluster');

    // Handle view-specific actions
    if (viewName === 'workloads' && this.currentNamespace) {
      this.loadWorkloads(this.currentNamespace);
      this.pollerService.start('workloads', async () => {
        await this.loadWorkloads(this.currentNamespace);
      }, 5000);
    } else if (viewName === 'networking' && this.currentNamespace) {
      this.loadNetworking(this.currentNamespace);
      this.pollerService.start('networking', async () => {
        await this.loadNetworking(this.currentNamespace);
      }, 10000);
    } else if (viewName === 'config' && this.currentNamespace) {
      this.loadConfig(this.currentNamespace);
      this.pollerService.start('config', async () => {
        await this.loadConfig(this.currentNamespace);
      }, 10000);
    } else if (viewName === 'storage') {
      this.loadStorage(this.currentNamespace);
      this.pollerService.start('storage', async () => {
        await this.loadStorage(this.currentNamespace);
      }, 30000);
    } else if (viewName === 'cluster') {
      this.loadCluster();
      this.pollerService.start('cluster', async () => {
        await this.loadCluster();
      }, 30000);
    }
  }

  async loadWorkloads(namespace) {
    try {
      await this.workloads.loadAll(namespace);
    } catch (error) {
      console.error('[app] Failed to load workloads:', error);
    }
  }

  async loadNetworking(namespace) {
    try {
      await this.networking.loadAll(namespace);
    } catch (error) {
      console.error('[app] Failed to load networking:', error);
    }
  }

  async loadConfig(namespace) {
    try {
      await this.config.loadAll(namespace);
    } catch (error) {
      console.error('[app] Failed to load config:', error);
    }
  }

  async loadStorage(namespace) {
    try {
      await this.storage.loadAll(namespace);
    } catch (error) {
      console.error('[app] Failed to load storage:', error);
    }
  }

  async loadCluster() {
    try {
      await this.cluster.loadAll();
    } catch (error) {
      console.error('[app] Failed to load cluster:', error);
    }
  }

  // Workload action handlers
  async onWorkloadScale(resourceType, name, currentReplicas) {
    const modal = document.getElementById('scale-modal');
    const resourceNameEl = document.getElementById('scale-resource-name');
    const replicasInput = document.getElementById('scale-replicas');
    const currentEl = document.getElementById('scale-current');
    const confirmBtn = document.getElementById('scale-confirm');
    const cancelBtn = document.getElementById('scale-cancel');
    const closeBtn = document.getElementById('scale-modal-close');

    resourceNameEl.textContent = name;
    replicasInput.value = currentReplicas;
    currentEl.textContent = currentReplicas;
    modal.classList.add('show');

    return new Promise((resolve) => {
      const cleanup = () => {
        modal.classList.remove('show');
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        closeBtn.onclick = null;
      };

      confirmBtn.onclick = async () => {
        const newReplicas = parseInt(replicasInput.value, 10);
        cleanup();
        try {
          await this.kubectlService.scaleResource(resourceType, name, this.currentNamespace, newReplicas);
          this.showSuccess(`${name} scaled to ${newReplicas} replicas`);
          await this.loadWorkloads(this.currentNamespace);
        } catch (error) {
          this.showError(`Failed to scale: ${error.message}`);
        }
        resolve(true);
      };

      cancelBtn.onclick = () => {
        cleanup();
        resolve(false);
      };

      closeBtn.onclick = () => {
        cleanup();
        resolve(false);
      };
    });
  }

  async onWorkloadRestart(resourceType, name) {
    const confirmed = await this.showConfirmModal(
      'Restart Workload',
      `Are you sure you want to restart ${name}? This will trigger a rolling restart.`
    );

    if (confirmed) {
      try {
        await this.kubectlService.restartResource(resourceType, name, this.currentNamespace);
        // Show operation modal with live status updates
        this.showOperationModal(resourceType, name, 'restart');
      } catch (error) {
        this.showError(`Failed to restart: ${error.message}`);
      }
    }
  }

  showOperationModal(resourceType, name, operation) {
    const modal = document.getElementById('operation-modal');
    const title = document.getElementById('operation-title');
    const command = document.getElementById('operation-command');
    const statusValue = document.getElementById('operation-status-value');
    const progressFill = document.getElementById('operation-progress-fill');
    const progressText = document.getElementById('operation-progress-text');
    const statsContainer = document.getElementById('operation-stats');
    const eventsContainer = document.getElementById('operation-events');
    const closeBtn = document.getElementById('operation-close');
    const modalCloseBtn = document.getElementById('operation-modal-close');

    // Set initial content
    const opName = operation.charAt(0).toUpperCase() + operation.slice(1);
    title.textContent = `${opName}: ${name}`;
    command.textContent = `kubectl rollout ${operation} ${resourceType}/${name} -n ${this.currentNamespace}`;
    statusValue.textContent = 'Starting...';
    statusValue.className = 'operation-status-value status-in-progress';
    progressFill.style.width = '0%';
    progressFill.classList.remove('complete');
    progressText.textContent = '0/0';
    statsContainer.innerHTML = '';
    eventsContainer.innerHTML = '<div class="operation-events-empty">Loading events...</div>';

    modal.classList.add('show');

    // Polling interval reference
    let pollInterval = null;
    let isComplete = false;

    const closeModal = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      modal.classList.remove('show');
      this.loadWorkloads(this.currentNamespace);
    };

    closeBtn.onclick = closeModal;
    modalCloseBtn.onclick = closeModal;
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };

    // Track the initial generation to detect when rollout starts
    let initialGeneration = null;
    let rolloutStarted = false;

    // Start polling for status updates
    const updateStatus = async () => {
      try {
        // Get rollout status
        const status = await this.kubectlService.getRolloutStatus(resourceType, name, this.currentNamespace);

        // Track initial generation on first call
        if (initialGeneration === null) {
          initialGeneration = status.generation;
        }

        // Detect if rollout has started (generation changed or observedGeneration catching up)
        if (status.generation > initialGeneration ||
            status.observedGeneration !== status.generation ||
            status.unavailableReplicas > 0) {
          rolloutStarted = true;
        }

        // Update stats
        statsContainer.innerHTML = `
          <div class="operation-stat">
            <span class="operation-stat-label">Desired</span>
            <span class="operation-stat-value">${status.replicas}</span>
          </div>
          <div class="operation-stat">
            <span class="operation-stat-label">Updated</span>
            <span class="operation-stat-value">${status.updatedReplicas}</span>
          </div>
          <div class="operation-stat">
            <span class="operation-stat-label">Ready</span>
            <span class="operation-stat-value">${status.readyReplicas}</span>
          </div>
          <div class="operation-stat">
            <span class="operation-stat-label">Unavailable</span>
            <span class="operation-stat-value">${status.unavailableReplicas || 0}</span>
          </div>
        `;

        // Update progress - only show real progress once rollout has started
        const progress = status.replicas > 0
          ? Math.round((status.updatedReplicas / status.replicas) * 100)
          : 0;
        progressFill.style.width = `${progress}%`;
        progressText.textContent = `${status.updatedReplicas}/${status.replicas} updated`;

        // Check if complete - must have started first and all conditions met
        const isRolloutComplete =
          rolloutStarted &&
          status.observedGeneration >= status.generation &&
          status.updatedReplicas === status.replicas &&
          status.readyReplicas === status.replicas &&
          status.availableReplicas === status.replicas &&
          (status.unavailableReplicas || 0) === 0 &&
          status.replicas > 0;

        if (isRolloutComplete) {
          if (!isComplete) {
            isComplete = true;
            statusValue.textContent = 'Complete';
            statusValue.className = 'operation-status-value status-success';
            progressFill.classList.add('complete');
            progressText.textContent = `${status.replicas}/${status.replicas} ready`;
          }
        } else if (!rolloutStarted) {
          statusValue.textContent = 'Waiting for rollout to start...';
          statusValue.className = 'operation-status-value status-in-progress';
        } else {
          statusValue.textContent = `Rolling out... (${status.unavailableReplicas || 0} unavailable)`;
          statusValue.className = 'operation-status-value status-in-progress';
        }

        // Get recent events
        const events = await this.kubectlService.getResourceEvents(resourceType, name, this.currentNamespace);
        if (events && events.length > 0) {
          const recentEvents = events.slice(-10).reverse();
          eventsContainer.innerHTML = recentEvents.map(event => `
            <div class="operation-event">
              <div class="operation-event-header">
                <span class="operation-event-type ${event.type}">${event.type}</span>
                <span class="operation-event-time">${this.formatEventTime(event.lastTimestamp || event.eventTime)}</span>
              </div>
              <div class="operation-event-message">
                <span class="operation-event-reason">${event.reason}:</span> ${this.escapeHtml(event.message || '')}
              </div>
            </div>
          `).join('');
        } else {
          eventsContainer.innerHTML = '<div class="operation-events-empty">No events found</div>';
        }

      } catch (error) {
        console.error('Failed to update operation status:', error);
      }
    };

    // Initial update
    updateStatus();

    // Poll every 2 seconds
    pollInterval = setInterval(updateStatus, 2000);
  }

  formatEventTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return date.toLocaleTimeString();
  }

  formatRevisionTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Format: "Dec 3, 14:30" or "Dec 3, 14:30 (2d ago)"
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        return `${timeStr} (${diffMins}m ago)`;
      }
      return `${timeStr} (${diffHours}h ago)`;
    } else if (diffDays < 7) {
      return `${dateStr}, ${timeStr} (${diffDays}d ago)`;
    }
    return `${dateStr}, ${timeStr}`;
  }

  async onWorkloadRollback(name) {
    // Show rollback modal with revision history
    const selectedRevision = await this.showRollbackModal(name);

    if (selectedRevision !== null) {
      try {
        await this.kubectlService.rollbackDeployment(name, this.currentNamespace, selectedRevision);
        // Show operation modal with live status updates
        this.showOperationModal('deployment', name, 'undo');
      } catch (error) {
        this.showError(`Failed to rollback: ${error.message}`);
      }
    }
  }

  async showRollbackModal(name) {
    const modal = document.getElementById('rollback-modal');
    const deploymentName = document.getElementById('rollback-deployment-name');
    const currentContainer = document.getElementById('rollback-current');
    const historyContainer = document.getElementById('rollback-history');
    const confirmBtn = document.getElementById('rollback-confirm');
    const cancelBtn = document.getElementById('rollback-cancel');
    const closeBtn = document.getElementById('rollback-modal-close');

    deploymentName.textContent = name;
    currentContainer.innerHTML = '<div class="loading-spinner">Loading current revision...</div>';
    historyContainer.innerHTML = '<div class="loading-spinner">Loading history...</div>';
    confirmBtn.disabled = true;

    modal.classList.add('show');

    let selectedRevision = null;

    return new Promise(async (resolve) => {
      const closeModal = (result) => {
        modal.classList.remove('show');
        resolve(result);
      };

      cancelBtn.onclick = () => closeModal(null);
      closeBtn.onclick = () => closeModal(null);
      modal.onclick = (e) => {
        if (e.target === modal) closeModal(null);
      };

      confirmBtn.onclick = () => closeModal(selectedRevision);

      // Load rollout history
      try {
        const history = await this.kubectlService.getRolloutHistoryDetailed(name, this.currentNamespace);

        if (!history || history.length === 0) {
          historyContainer.innerHTML = '<div class="operation-events-empty">No revision history found</div>';
          currentContainer.innerHTML = '';
          return;
        }

        // Sort by revision descending (newest first)
        history.sort((a, b) => parseInt(b.revision) - parseInt(a.revision));

        // Current revision is the highest number
        const currentRevision = history[0];

        currentContainer.innerHTML = `
          <div class="rollback-current-label">Current Revision #${currentRevision.revision}</div>
          <div class="rollback-current-image">${currentRevision.image || 'Unknown image'}</div>
        `;

        // Show all revisions except the current one as options
        if (history.length <= 1) {
          historyContainer.innerHTML = '<div class="operation-events-empty">No previous revisions available to rollback to</div>';
          return;
        }

        historyContainer.innerHTML = history.map((rev, index) => {
          const isCurrent = index === 0;
          const isPrevious = index === 1;
          let badge = '';

          if (isCurrent) {
            badge = '<span class="rollback-revision-badge current">Current</span>';
          } else if (isPrevious) {
            badge = '<span class="rollback-revision-badge previous">Previous</span>';
          }

          const timestamp = rev.timestamp ? this.formatRevisionTimestamp(rev.timestamp) : '';

          return `
            <div class="rollback-revision ${isCurrent ? 'current' : ''}"
                 data-revision="${rev.revision}"
                 ${isCurrent ? '' : 'tabindex="0"'}>
              <div class="rollback-revision-header">
                <span class="rollback-revision-number">Revision #${rev.revision}</span>
                <div class="rollback-revision-meta">
                  ${timestamp ? `<span class="rollback-revision-time">${timestamp}</span>` : ''}
                  ${badge}
                </div>
              </div>
              <div class="rollback-revision-image">${rev.image || 'Unknown image'}</div>
              ${rev.changeReason && rev.changeReason !== '<none>'
                ? `<div class="rollback-revision-reason">${this.escapeHtml(rev.changeReason)}</div>`
                : ''}
            </div>
          `;
        }).join('');

        // Add click handlers to revision items
        const revisionElements = historyContainer.querySelectorAll('.rollback-revision:not(.current)');
        revisionElements.forEach(el => {
          el.addEventListener('click', () => {
            // Remove selected from all
            historyContainer.querySelectorAll('.rollback-revision').forEach(r => r.classList.remove('selected'));
            // Add selected to clicked
            el.classList.add('selected');
            selectedRevision = el.dataset.revision;
            confirmBtn.disabled = false;
          });
        });

      } catch (error) {
        console.error('Failed to load rollout history:', error);
        historyContainer.innerHTML = `<div class="operation-events-empty">Failed to load history: ${error.message}</div>`;
        currentContainer.innerHTML = '';
      }
    });
  }

  async onTriggerCronJob(name) {
    const confirmed = await this.showConfirmModal(
      'Trigger CronJob',
      `Are you sure you want to manually trigger ${name}?`
    );

    if (confirmed) {
      try {
        await this.kubectlService.triggerCronJob(name, this.currentNamespace);
        this.showSuccess(`${name} triggered successfully`);
        await this.loadWorkloads(this.currentNamespace);
      } catch (error) {
        this.showError(`Failed to trigger job: ${error.message}`);
      }
    }
  }

  showConfirmModal(title, message) {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-title');
    const messageEl = document.getElementById('confirm-message');
    const confirmBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');
    const closeBtn = document.getElementById('confirm-modal-close');

    titleEl.textContent = title;
    messageEl.textContent = message;
    modal.classList.add('show');

    return new Promise((resolve) => {
      const cleanup = () => {
        modal.classList.remove('show');
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        closeBtn.onclick = null;
      };

      confirmBtn.onclick = () => {
        cleanup();
        resolve(true);
      };

      cancelBtn.onclick = () => {
        cleanup();
        resolve(false);
      };

      closeBtn.onclick = () => {
        cleanup();
        resolve(false);
      };
    });
  }

  // Port-forward handler
  async onPortForward(resourceType, name, defaultPort) {
    const modal = document.getElementById('port-forward-modal');
    const resourceNameEl = document.getElementById('pf-resource-name');
    const localPortInput = document.getElementById('pf-local-port');
    const remotePortInput = document.getElementById('pf-remote-port');
    const portStatusEl = document.getElementById('pf-port-status');
    const startBtn = document.getElementById('pf-start');
    const killBtn = document.getElementById('pf-kill');
    const cancelBtn = document.getElementById('pf-cancel');
    const closeBtn = document.getElementById('pf-modal-close');

    let currentPortInfo = null;

    const checkPort = async (port) => {
      portStatusEl.innerHTML = '<span class="checking">Checking port...</span>';
      killBtn.style.display = 'none';

      const result = await window.api.portforward.checkPort({ port });
      if (result.success && result.inUse) {
        currentPortInfo = result;
        portStatusEl.innerHTML = `<span class="port-in-use">Port ${port} in use by: <strong>${result.processName}</strong> (PID: ${result.pid})</span>`;
        killBtn.style.display = 'inline-block';
      } else {
        currentPortInfo = null;
        portStatusEl.innerHTML = `<span class="port-available">Port ${port} is available</span>`;
      }
    };

    resourceNameEl.textContent = `${resourceType}/${name}`;
    localPortInput.value = defaultPort;
    remotePortInput.value = defaultPort;
    modal.classList.add('show');

    // Check port on open and on change
    await checkPort(defaultPort);
    localPortInput.oninput = () => {
      const port = parseInt(localPortInput.value, 10);
      if (port > 0 && port <= 65535) {
        checkPort(port);
      }
    };

    return new Promise((resolve) => {
      const cleanup = () => {
        modal.classList.remove('show');
        startBtn.onclick = null;
        killBtn.onclick = null;
        cancelBtn.onclick = null;
        closeBtn.onclick = null;
        localPortInput.oninput = null;
        portStatusEl.innerHTML = '';
        killBtn.style.display = 'none';
      };

      killBtn.onclick = async () => {
        if (currentPortInfo && currentPortInfo.pid) {
          const result = await window.api.portforward.killProcess({ pid: currentPortInfo.pid });
          if (result.success) {
            this.showSuccess(`Process ${currentPortInfo.processName} (PID: ${currentPortInfo.pid}) killed`);
            await checkPort(parseInt(localPortInput.value, 10));
          } else {
            this.showError(`Failed to kill process: ${result.error}`);
          }
        }
      };

      startBtn.onclick = async () => {
        const localPort = parseInt(localPortInput.value, 10);
        const remotePort = parseInt(remotePortInput.value, 10);
        cleanup();

        try {
          const result = await this.portForwardManager.startForward(
            resourceType,
            name,
            this.currentNamespace,
            localPort,
            remotePort
          );
          if (result.success) {
            this.showSuccess(`Port forward started: localhost:${localPort}`);
          } else {
            this.showError(`Failed to start port forward: ${result.error}`);
          }
        } catch (error) {
          this.showError(`Failed to start port forward: ${error.message}`);
        }
        resolve(true);
      };

      cancelBtn.onclick = () => {
        cleanup();
        resolve(false);
      };

      closeBtn.onclick = () => {
        cleanup();
        resolve(false);
      };
    });
  }

  // ConfigMap view handler
  onViewConfigMap(name, data) {
    const modal = document.getElementById('configmap-modal');
    const nameEl = document.getElementById('configmap-modal-name');
    const dataList = document.getElementById('configmap-data-list');
    const closeBtn = document.getElementById('configmap-modal-close');

    nameEl.textContent = name;
    dataList.innerHTML = '';

    const keys = Object.keys(data);
    if (keys.length === 0) {
      dataList.innerHTML = '<div class="config-data-empty">No data</div>';
    } else {
      keys.forEach(key => {
        const item = document.createElement('div');
        item.className = 'config-data-item';
        item.innerHTML = `
          <div class="config-data-key">${this.escapeHtml(key)}</div>
          <pre class="config-data-value"><code>${this.escapeHtml(data[key])}</code></pre>
        `;
        dataList.appendChild(item);
      });
    }

    modal.classList.add('show');

    closeBtn.onclick = () => {
      modal.classList.remove('show');
    };

    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.classList.remove('show');
      }
    };
  }

  // Secret view handler
  onViewSecret(name, data, type) {
    const modal = document.getElementById('secret-modal');
    const nameEl = document.getElementById('secret-modal-name');
    const dataList = document.getElementById('secret-data-list');
    const closeBtn = document.getElementById('secret-modal-close');

    nameEl.textContent = `${name} (${type})`;
    dataList.innerHTML = '';

    const keys = Object.keys(data);
    if (keys.length === 0) {
      dataList.innerHTML = '<div class="secret-data-empty">No data</div>';
    } else {
      keys.forEach(key => {
        const item = document.createElement('div');
        item.className = 'secret-data-item';
        item.innerHTML = `
          <div class="secret-data-key">${this.escapeHtml(key)}</div>
          <div class="secret-data-value">
            <code class="masked">••••••••••••••••</code>
            <button class="btn btn-small reveal-btn">Reveal</button>
          </div>
        `;

        const revealBtn = item.querySelector('.reveal-btn');
        const codeEl = item.querySelector('code');
        let isRevealed = false;

        revealBtn.onclick = () => {
          if (!isRevealed) {
            try {
              const decoded = atob(data[key]);
              codeEl.textContent = decoded;
              codeEl.classList.remove('masked');
              revealBtn.textContent = 'Hide';
              isRevealed = true;
            } catch (e) {
              codeEl.textContent = '[binary data]';
              codeEl.classList.remove('masked');
              revealBtn.disabled = true;
            }
          } else {
            codeEl.textContent = '••••••••••••••••';
            codeEl.classList.add('masked');
            revealBtn.textContent = 'Reveal';
            isRevealed = false;
          }
        };

        dataList.appendChild(item);
      });
    }

    modal.classList.add('show');

    closeBtn.onclick = () => {
      modal.classList.remove('show');
    };

    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.classList.remove('show');
      }
    };
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Resource selection handler (for non-pod resources)
  async onResourceSelect(type, name, data) {
    this.currentResource = { type, name, data };
    // Clear pod selection when selecting other resources
    this.currentPod = null;
    this.currentPodData = null;

    // Switch to details tab and show resource details
    this.switchTab('details');
    await this.updateResourceDetails();
  }

  async updateResourceDetails() {
    const detailsContainer = document.querySelector('#details-tab .details-container');

    if (!this.currentResource) {
      detailsContainer.innerHTML = '<div class="empty-state"><p>Select a resource to view details</p></div>';
      return;
    }

    const { type, name, data } = this.currentResource;

    // Fetch describe output for the resource
    let describeOutput = '';
    try {
      describeOutput = await this.fetchResourceDescribe(type, name);
    } catch (error) {
      console.error(`Failed to describe ${type}/${name}:`, error);
    }

    detailsContainer.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'resource-details-header';
    header.innerHTML = `
      <div class="resource-type">${type}</div>
      <div class="resource-name">${name}</div>
    `;
    detailsContainer.appendChild(header);

    // Basic info section
    const basicInfo = document.createElement('div');
    basicInfo.className = 'details-section';
    basicInfo.innerHTML = `
      <h3>Basic Info</h3>
      <div class="details-grid">
        <div class="detail-item">
          <span class="detail-label">Name</span>
          <span class="detail-value">${name}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Namespace</span>
          <span class="detail-value">${data.metadata?.namespace || 'cluster-scoped'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Created</span>
          <span class="detail-value">${data.metadata?.creationTimestamp || '-'}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">UID</span>
          <span class="detail-value">${data.metadata?.uid || '-'}</span>
        </div>
      </div>
    `;
    detailsContainer.appendChild(basicInfo);

    // Labels section
    if (data.metadata?.labels && Object.keys(data.metadata.labels).length > 0) {
      const labelsSection = document.createElement('div');
      labelsSection.className = 'details-section';
      labelsSection.innerHTML = `
        <h3>Labels</h3>
        <div class="labels-list">
          ${Object.entries(data.metadata.labels).map(([k, v]) =>
            `<span class="label-badge">${this.escapeHtml(k)}=${this.escapeHtml(v)}</span>`
          ).join('')}
        </div>
      `;
      detailsContainer.appendChild(labelsSection);
    }

    // Describe output
    if (describeOutput) {
      const describeSection = document.createElement('div');
      describeSection.className = 'details-section';
      describeSection.innerHTML = `
        <h3>Describe</h3>
        <pre class="describe-output">${this.escapeHtml(describeOutput)}</pre>
      `;
      detailsContainer.appendChild(describeSection);
    }
  }

  async fetchResourceDescribe(type, name) {
    // Map type to kubectl resource type
    const typeMap = {
      'service': 'service',
      'ingress': 'ingress',
      'endpoints': 'endpoints',
      'configmap': 'configmap',
      'secret': 'secret',
      'pvc': 'pvc',
      'pv': 'pv',
      'node': 'node',
      'deployment': 'deployment',
      'statefulset': 'statefulset',
      'daemonset': 'daemonset',
      'job': 'job',
      'cronjob': 'cronjob',
    };

    const resourceType = typeMap[type] || type;

    // For cluster-scoped resources (nodes, pvs), don't use namespace
    if (type === 'node' || type === 'pv') {
      const result = await this.kubectlService.api.exec(['describe', resourceType, name]);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error);
    }

    // For namespace-scoped resources
    const result = await this.kubectlService.api.exec(['describe', resourceType, name, '-n', this.currentNamespace]);
    if (result.success) {
      return result.data;
    }
    throw new Error(result.error);
  }
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  try {
    window.app = new RickubeApp();
  } catch (error) {
    console.error('[app] Failed to initialize:', error);
  }
});
