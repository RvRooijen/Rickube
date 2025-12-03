// config.js - Config resources component (ConfigMaps, Secrets)

class ConfigComponent {
  constructor(containerId, kubectlService, callbacks = {}) {
    this.container = document.getElementById(containerId);
    this.kubectlService = kubectlService;
    this.callbacks = callbacks;

    // Data storage
    this.configMaps = [];
    this.secrets = [];

    // Track collapsed sections
    this.collapsedSections = new Set();
  }

  async loadAll(namespace) {
    if (!namespace) {
      this.showEmptyState();
      return;
    }

    try {
      const [
        configMapsData,
        secretsData
      ] = await Promise.all([
        this.kubectlService.getConfigMaps(namespace).catch(() => ({ items: [] })),
        this.kubectlService.getSecrets(namespace).catch(() => ({ items: [] }))
      ]);

      this.configMaps = configMapsData.items || [];
      this.secrets = secretsData.items || [];

      this.render();
    } catch (error) {
      console.error('[config] Failed to load:', error);
      this.showError('Failed to load config resources');
    }
  }

  render() {
    this.container.innerHTML = '';

    this.container.appendChild(this.renderSection('configmaps', 'ConfigMaps', this.configMaps, this.renderConfigMapCard.bind(this)));
    this.container.appendChild(this.renderSection('secrets', 'Secrets', this.secrets, this.renderSecretCard.bind(this)));
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
      content.innerHTML = '<div class="workload-empty">No resources found</div>';
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

  renderConfigMapCard(configMap) {
    const card = document.createElement('div');
    card.className = 'workload-card';

    const name = configMap.metadata.name;
    const dataKeys = Object.keys(configMap.data || {});
    const binaryKeys = Object.keys(configMap.binaryData || {});
    const totalKeys = dataKeys.length + binaryKeys.length;
    const age = this.calculateAge(configMap.metadata.creationTimestamp);

    card.innerHTML = `
      <div class="workload-card-header">
        <div class="workload-card-title">
          <span class="workload-card-name">${name}</span>
        </div>
        <span class="workload-card-status status-ready">${totalKeys} key${totalKeys !== 1 ? 's' : ''}</span>
      </div>
      <div class="workload-card-info">
        <div class="workload-card-info-item workload-card-info-full">
          <span class="label">Keys:</span>
          <span class="value">${dataKeys.length > 0 ? dataKeys.slice(0, 5).join(', ') + (dataKeys.length > 5 ? ` (+${dataKeys.length - 5} more)` : '') : '-'}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Age:</span>
          <span class="value">${age}</span>
        </div>
      </div>
      <div class="workload-card-actions">
        <button class="workload-action-btn" data-action="view">View Data</button>
      </div>
    `;

    card.querySelector('[data-action="view"]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.callbacks.onViewConfigMap) {
        this.callbacks.onViewConfigMap(name, configMap.data || {});
      }
    });

    return card;
  }

  renderSecretCard(secret) {
    const card = document.createElement('div');
    card.className = 'workload-card';

    const name = secret.metadata.name;
    const type = secret.type || 'Opaque';
    const dataKeys = Object.keys(secret.data || {});
    const age = this.calculateAge(secret.metadata.creationTimestamp);

    // Determine type badge class
    let typeClass = 'secret-type-opaque';
    if (type.includes('tls')) typeClass = 'secret-type-tls';
    else if (type.includes('docker')) typeClass = 'secret-type-docker';
    else if (type.includes('service-account')) typeClass = 'secret-type-sa';

    card.innerHTML = `
      <div class="workload-card-header">
        <div class="workload-card-title">
          <span class="workload-card-name">${name}</span>
        </div>
        <span class="secret-type ${typeClass}">${this.truncateType(type)}</span>
      </div>
      <div class="workload-card-info">
        <div class="workload-card-info-item">
          <span class="label">Keys:</span>
          <span class="value">${dataKeys.length > 0 ? dataKeys.slice(0, 3).join(', ') + (dataKeys.length > 3 ? ` (+${dataKeys.length - 3})` : '') : '-'}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Age:</span>
          <span class="value">${age}</span>
        </div>
      </div>
      <div class="workload-card-actions">
        <button class="workload-action-btn" data-action="view">View Data</button>
      </div>
    `;

    card.querySelector('[data-action="view"]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.callbacks.onViewSecret) {
        this.callbacks.onViewSecret(name, secret.data || {}, type);
      }
    });

    return card;
  }

  truncateType(type) {
    if (type.length > 25) {
      // Show last part after /
      const parts = type.split('/');
      return parts[parts.length - 1];
    }
    return type;
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
    this.container.innerHTML = `
      <div class="empty-state">
        <p>Select a namespace to view config resources</p>
      </div>
    `;
  }

  showError(message) {
    this.container.innerHTML = `
      <div class="error-state">
        <p>${message}</p>
      </div>
    `;
  }

  clear() {
    this.configMaps = [];
    this.secrets = [];
    this.showEmptyState();
  }
}

export default ConfigComponent;
