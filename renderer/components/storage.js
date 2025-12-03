// storage.js - Storage resources component (PVCs, PVs)

class StorageComponent {
  constructor(containerId, kubectlService, callbacks = {}) {
    this.container = document.getElementById(containerId);
    this.kubectlService = kubectlService;
    this.callbacks = callbacks;

    // Data storage
    this.pvcs = [];
    this.pvs = [];

    // Track collapsed sections
    this.collapsedSections = new Set();
  }

  async loadAll(namespace) {
    try {
      // PVCs are namespace-scoped, PVs are cluster-scoped
      const [pvcsData, pvsData] = await Promise.all([
        namespace ? this.kubectlService.getPVCs(namespace).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
        this.kubectlService.getPVs().catch(() => ({ items: [] }))
      ]);

      this.pvcs = pvcsData.items || [];
      this.pvs = pvsData.items || [];

      this.render(namespace);
    } catch (error) {
      console.error('[storage] Failed to load:', error);
      this.showError('Failed to load storage resources');
    }
  }

  render(namespace) {
    this.container.innerHTML = '';

    if (namespace) {
      this.container.appendChild(this.renderSection('pvcs', 'PersistentVolumeClaims', this.pvcs, this.renderPVCCard.bind(this)));
    }
    this.container.appendChild(this.renderSection('pvs', 'PersistentVolumes (cluster-wide)', this.pvs, this.renderPVCard.bind(this)));
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

  renderPVCCard(pvc) {
    const card = document.createElement('div');
    card.className = 'workload-card';

    const name = pvc.metadata.name;
    const status = pvc.status.phase || 'Unknown';
    const capacity = pvc.status.capacity?.storage || pvc.spec.resources?.requests?.storage || '-';
    const accessModes = (pvc.status.accessModes || pvc.spec.accessModes || []).join(', ') || '-';
    const storageClass = pvc.spec.storageClassName || '-';
    const volumeName = pvc.spec.volumeName || '-';
    const age = this.calculateAge(pvc.metadata.creationTimestamp);

    const statusClass = status === 'Bound' ? 'status-ready' :
                       status === 'Pending' ? 'status-progressing' : 'status-degraded';

    card.innerHTML = `
      <div class="workload-card-header">
        <div class="workload-card-title">
          <span class="workload-card-name">${name}</span>
        </div>
        <span class="workload-card-status ${statusClass}">${status}</span>
      </div>
      <div class="workload-card-info">
        <div class="workload-card-info-item">
          <span class="label">Capacity:</span>
          <span class="value">${capacity}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Access Modes:</span>
          <span class="value">${this.formatAccessModes(accessModes)}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Storage Class:</span>
          <span class="value">${storageClass}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Volume:</span>
          <span class="value" title="${volumeName}">${this.truncate(volumeName, 30)}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Age:</span>
          <span class="value">${age}</span>
        </div>
      </div>
    `;

    return card;
  }

  renderPVCard(pv) {
    const card = document.createElement('div');
    card.className = 'workload-card';

    const name = pv.metadata.name;
    const status = pv.status.phase || 'Unknown';
    const capacity = pv.spec.capacity?.storage || '-';
    const accessModes = (pv.spec.accessModes || []).join(', ') || '-';
    const reclaimPolicy = pv.spec.persistentVolumeReclaimPolicy || '-';
    const storageClass = pv.spec.storageClassName || '-';
    const claim = pv.spec.claimRef ? `${pv.spec.claimRef.namespace}/${pv.spec.claimRef.name}` : '-';
    const age = this.calculateAge(pv.metadata.creationTimestamp);

    const statusClass = status === 'Bound' ? 'status-ready' :
                       status === 'Available' ? 'status-progressing' :
                       status === 'Released' ? 'status-pending' : 'status-degraded';

    card.innerHTML = `
      <div class="workload-card-header">
        <div class="workload-card-title">
          <span class="workload-card-name">${this.truncate(name, 35)}</span>
        </div>
        <span class="workload-card-status ${statusClass}">${status}</span>
      </div>
      <div class="workload-card-info">
        <div class="workload-card-info-item">
          <span class="label">Capacity:</span>
          <span class="value">${capacity}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Access Modes:</span>
          <span class="value">${this.formatAccessModes(accessModes)}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Reclaim Policy:</span>
          <span class="value">${reclaimPolicy}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Storage Class:</span>
          <span class="value">${storageClass}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Claim:</span>
          <span class="value" title="${claim}">${this.truncate(claim, 30)}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Age:</span>
          <span class="value">${age}</span>
        </div>
      </div>
    `;

    return card;
  }

  formatAccessModes(modes) {
    if (!modes || modes === '-') return '-';
    return modes
      .replace(/ReadWriteOnce/g, 'RWO')
      .replace(/ReadOnlyMany/g, 'ROX')
      .replace(/ReadWriteMany/g, 'RWX')
      .replace(/ReadWriteOncePod/g, 'RWOP');
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

  showEmptyState() {
    this.container.innerHTML = `
      <div class="empty-state">
        <p>Select a namespace to view storage resources</p>
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
    this.pvcs = [];
    this.pvs = [];
    this.showEmptyState();
  }
}

export default StorageComponent;
