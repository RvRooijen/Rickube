// networking.js - Networking resources component (Services, Ingresses, Endpoints)

class NetworkingComponent {
  constructor(containerId, kubectlService, callbacks = {}) {
    this.container = document.getElementById(containerId);
    this.kubectlService = kubectlService;
    this.callbacks = callbacks;

    // Data storage
    this.services = [];
    this.ingresses = [];
    this.endpoints = [];

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
        servicesData,
        ingressesData,
        endpointsData
      ] = await Promise.all([
        this.kubectlService.getServices(namespace).catch(() => ({ items: [] })),
        this.kubectlService.getIngresses(namespace).catch(() => ({ items: [] })),
        this.kubectlService.getEndpoints(namespace).catch(() => ({ items: [] }))
      ]);

      this.services = servicesData.items || [];
      this.ingresses = ingressesData.items || [];
      this.endpoints = endpointsData.items || [];

      this.render();
    } catch (error) {
      console.error('[networking] Failed to load:', error);
      this.showError('Failed to load networking resources');
    }
  }

  render() {
    this.container.innerHTML = '';

    this.container.appendChild(this.renderSection('services', 'Services', this.services, this.renderServiceCard.bind(this)));
    this.container.appendChild(this.renderSection('ingresses', 'Ingresses', this.ingresses, this.renderIngressCard.bind(this)));
    this.container.appendChild(this.renderSection('endpoints', 'Endpoints', this.endpoints, this.renderEndpointsCard.bind(this)));
  }

  renderSection(id, title, items, cardRenderer) {
    const section = document.createElement('div');
    // Collapse by default if empty, or if manually collapsed
    const isCollapsed = items.length === 0 || this.collapsedSections.has(id);
    section.className = `workload-section${isCollapsed ? ' collapsed' : ''}`;
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

  renderServiceCard(service) {
    const card = document.createElement('div');
    card.className = 'workload-card';

    const name = service.metadata.name;
    const type = service.spec.type || 'ClusterIP';
    const clusterIP = service.spec.clusterIP || '-';
    const externalIP = this.getExternalIP(service);
    const ports = this.formatPorts(service.spec.ports);
    const age = this.calculateAge(service.metadata.creationTimestamp);

    const typeClass = type.toLowerCase().replace(/\s/g, '');

    card.innerHTML = `
      <div class="workload-card-header">
        <div class="workload-card-title">
          <span class="workload-card-name">${name}</span>
        </div>
        <span class="service-type ${typeClass}">${type}</span>
      </div>
      <div class="workload-card-info">
        <div class="workload-card-info-item">
          <span class="label">Cluster IP:</span>
          <span class="value">${clusterIP}</span>
        </div>
        ${externalIP ? `
        <div class="workload-card-info-item">
          <span class="label">External IP:</span>
          <span class="value">${externalIP}</span>
        </div>
        ` : ''}
        <div class="workload-card-info-item">
          <span class="label">Ports:</span>
          <span class="value">${ports}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Age:</span>
          <span class="value">${age}</span>
        </div>
      </div>
      <div class="workload-card-actions">
        <button class="workload-action-btn" data-action="portforward">Port Forward</button>
      </div>
    `;

    card.querySelector('[data-action="portforward"]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.callbacks.onPortForward) {
        const firstPort = service.spec.ports?.[0];
        this.callbacks.onPortForward('service', name, firstPort?.port || 80);
      }
    });

    // Click on card to show details
    card.addEventListener('click', () => {
      if (this.callbacks.onSelect) {
        this.callbacks.onSelect('service', name, service);
      }
    });

    return card;
  }

  renderIngressCard(ingress) {
    const card = document.createElement('div');
    card.className = 'workload-card';

    const name = ingress.metadata.name;
    const hosts = this.getIngressHosts(ingress);
    const age = this.calculateAge(ingress.metadata.creationTimestamp);
    const ingressClass = ingress.spec.ingressClassName || ingress.metadata.annotations?.['kubernetes.io/ingress.class'] || '-';

    card.innerHTML = `
      <div class="workload-card-header">
        <div class="workload-card-title">
          <span class="workload-card-name">${name}</span>
        </div>
      </div>
      <div class="workload-card-info">
        <div class="workload-card-info-item">
          <span class="label">Class:</span>
          <span class="value">${ingressClass}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Hosts:</span>
          <span class="value">${hosts}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Age:</span>
          <span class="value">${age}</span>
        </div>
      </div>
    `;

    // Click on card to show details
    card.addEventListener('click', () => {
      if (this.callbacks.onSelect) {
        this.callbacks.onSelect('ingress', name, ingress);
      }
    });

    return card;
  }

  renderEndpointsCard(endpoint) {
    const card = document.createElement('div');
    card.className = 'workload-card';

    const name = endpoint.metadata.name;
    const addresses = this.getEndpointAddresses(endpoint);
    const age = this.calculateAge(endpoint.metadata.creationTimestamp);

    card.innerHTML = `
      <div class="workload-card-header">
        <div class="workload-card-title">
          <span class="workload-card-name">${name}</span>
        </div>
        <span class="workload-card-status ${addresses.length > 0 ? 'status-ready' : 'status-degraded'}">
          ${addresses.length} endpoint${addresses.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div class="workload-card-info">
        <div class="workload-card-info-item workload-card-info-full">
          <span class="label">Addresses:</span>
          <span class="value">${addresses.length > 0 ? addresses.slice(0, 5).join(', ') + (addresses.length > 5 ? ` (+${addresses.length - 5} more)` : '') : 'None'}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Age:</span>
          <span class="value">${age}</span>
        </div>
      </div>
    `;

    // Click on card to show details
    card.addEventListener('click', () => {
      if (this.callbacks.onSelect) {
        this.callbacks.onSelect('endpoints', name, endpoint);
      }
    });

    return card;
  }

  // Helper methods
  getExternalIP(service) {
    if (service.spec.type === 'LoadBalancer') {
      const ingress = service.status?.loadBalancer?.ingress;
      if (ingress && ingress.length > 0) {
        return ingress[0].ip || ingress[0].hostname || '<pending>';
      }
      return '<pending>';
    }
    if (service.spec.externalIPs && service.spec.externalIPs.length > 0) {
      return service.spec.externalIPs.join(', ');
    }
    return null;
  }

  formatPorts(ports) {
    if (!ports || ports.length === 0) return '-';
    return ports.map(p => {
      const nodePort = p.nodePort ? `:${p.nodePort}` : '';
      return `${p.port}${nodePort}/${p.protocol || 'TCP'}`;
    }).join(', ');
  }

  getIngressHosts(ingress) {
    const rules = ingress.spec?.rules || [];
    if (rules.length === 0) return '-';
    const hosts = rules.map(r => r.host || '*').slice(0, 3);
    if (rules.length > 3) {
      hosts.push(`+${rules.length - 3} more`);
    }
    return hosts.join(', ');
  }

  getEndpointAddresses(endpoint) {
    const addresses = [];
    const subsets = endpoint.subsets || [];
    subsets.forEach(subset => {
      const addrs = subset.addresses || [];
      const ports = subset.ports || [];
      addrs.forEach(addr => {
        ports.forEach(port => {
          addresses.push(`${addr.ip}:${port.port}`);
        });
      });
    });
    return addresses;
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
        <p>Select a namespace to view networking resources</p>
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
    this.services = [];
    this.ingresses = [];
    this.endpoints = [];
    this.showEmptyState();
  }
}

export default NetworkingComponent;
