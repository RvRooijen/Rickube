// cluster.js - Cluster resources component (Nodes)

class ClusterComponent {
  constructor(containerId, kubectlService, callbacks = {}) {
    this.container = document.getElementById(containerId);
    this.kubectlService = kubectlService;
    this.callbacks = callbacks;

    // Data storage
    this.nodes = [];
    this.nodeMetrics = [];

    // Track collapsed sections
    this.collapsedSections = new Set();
  }

  async loadAll() {
    try {
      const [nodesData, metricsData] = await Promise.all([
        this.kubectlService.getNodes().catch(() => ({ items: [] })),
        this.kubectlService.getNodeMetrics().catch(() => [])
      ]);

      this.nodes = nodesData.items || [];
      this.nodeMetrics = metricsData || [];

      this.render();
    } catch (error) {
      console.error('[cluster] Failed to load:', error);
      this.showError('Failed to load cluster resources');
    }
  }

  render() {
    this.container.innerHTML = '';

    this.container.appendChild(this.renderSection('nodes', 'Nodes', this.nodes, this.renderNodeCard.bind(this)));
  }

  renderSection(id, title, items, cardRenderer) {
    const section = document.createElement('div');
    section.className = `workload-section${this.collapsedSections.has(id) ? ' collapsed' : ''}`;
    section.dataset.sectionId = id;

    const header = document.createElement('div');
    header.className = 'workload-section-header';
    header.innerHTML = `
      <div class="workload-section-title">
        <span class="collapse-icon">▼</span>
        <span>${title}</span>
      </div>
      <span class="workload-section-count">${items.length}</span>
    `;
    header.addEventListener('click', () => this.toggleSection(id, section));

    const content = document.createElement('div');
    content.className = 'workload-section-content';

    if (items.length === 0) {
      content.innerHTML = '<div class="workload-empty">No nodes found</div>';
    } else {
      items.forEach(item => {
        content.appendChild(cardRenderer(item));
      });
    }

    section.appendChild(header);
    section.appendChild(content);
    return section;
  }

  toggleSection(id, sectionEl) {
    if (this.collapsedSections.has(id)) {
      this.collapsedSections.delete(id);
      sectionEl.classList.remove('collapsed');
    } else {
      this.collapsedSections.add(id);
      sectionEl.classList.add('collapsed');
    }
  }

  renderNodeCard(node) {
    const card = document.createElement('div');
    card.className = 'workload-card node-card';

    const name = node.metadata.name;
    const status = this.getNodeStatus(node);
    const roles = this.getNodeRoles(node);
    const version = node.status.nodeInfo?.kubeletVersion || '-';
    const os = node.status.nodeInfo?.osImage || '-';
    const arch = node.status.nodeInfo?.architecture || '-';
    const containerRuntime = node.status.nodeInfo?.containerRuntimeVersion || '-';
    const age = this.calculateAge(node.metadata.creationTimestamp);

    // Get metrics for this node
    const metrics = this.nodeMetrics.find(m => m.name === name);

    const statusClass = status === 'Ready' ? 'status-ready' : 'status-degraded';

    card.innerHTML = `
      <div class="workload-card-header">
        <div class="workload-card-title">
          <span class="workload-card-name">${name}</span>
          ${roles ? `<span class="node-role">${roles}</span>` : ''}
        </div>
        <span class="workload-card-status ${statusClass}">${status}</span>
      </div>
      ${metrics ? `
      <div class="node-metrics">
        <div class="node-metric">
          <span class="node-metric-label">CPU</span>
          <span class="node-metric-value">${metrics.cpuCores} (${metrics.cpuPercent})</span>
        </div>
        <div class="node-metric">
          <span class="node-metric-label">Memory</span>
          <span class="node-metric-value">${metrics.memoryBytes} (${metrics.memoryPercent})</span>
        </div>
      </div>
      ` : ''}
      <div class="workload-card-info">
        <div class="workload-card-info-item">
          <span class="label">Kubelet:</span>
          <span class="value">${version}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">OS:</span>
          <span class="value" title="${os}">${this.truncate(os, 25)}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Arch:</span>
          <span class="value">${arch}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Container Runtime:</span>
          <span class="value">${this.truncate(containerRuntime, 20)}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Age:</span>
          <span class="value">${age}</span>
        </div>
      </div>
      ${this.renderNodeConditions(node)}
    `;

    return card;
  }

  getNodeStatus(node) {
    const conditions = node.status?.conditions || [];
    const readyCondition = conditions.find(c => c.type === 'Ready');
    if (readyCondition) {
      return readyCondition.status === 'True' ? 'Ready' : 'NotReady';
    }
    return 'Unknown';
  }

  getNodeRoles(node) {
    const labels = node.metadata.labels || {};
    const roles = [];

    Object.keys(labels).forEach(key => {
      if (key.startsWith('node-role.kubernetes.io/')) {
        roles.push(key.replace('node-role.kubernetes.io/', ''));
      }
    });

    // Also check for the legacy role label
    if (labels['kubernetes.io/role']) {
      roles.push(labels['kubernetes.io/role']);
    }

    return roles.join(', ');
  }

  renderNodeConditions(node) {
    const conditions = node.status?.conditions || [];
    const problemConditions = conditions.filter(c =>
      (c.type !== 'Ready' && c.status === 'True') ||
      (c.type === 'Ready' && c.status !== 'True')
    );

    if (problemConditions.length === 0) return '';

    return `
      <div class="node-conditions">
        ${problemConditions.map(c => `
          <div class="node-condition ${c.status === 'True' ? 'condition-warning' : 'condition-error'}">
            <span class="condition-type">${c.type}</span>
            <span class="condition-message">${c.message || c.reason || ''}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  truncate(str, maxLength) {
    if (!str || str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
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

  showError(message) {
    this.container.innerHTML = `
      <div class="error-state">
        <p>${message}</p>
      </div>
    `;
  }

  clear() {
    this.nodes = [];
    this.nodeMetrics = [];
    this.container.innerHTML = `
      <div class="empty-state">
        <p>Loading cluster info...</p>
      </div>
    `;
  }
}

export default ClusterComponent;
