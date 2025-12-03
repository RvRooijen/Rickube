// workloads.js - Workloads component for displaying deployments, statefulsets, etc.

class WorkloadsComponent {
  constructor(containerId, kubectlService, callbacks = {}) {
    this.container = document.getElementById(containerId);
    this.kubectlService = kubectlService;
    this.callbacks = callbacks;

    // Data storage
    this.deployments = [];
    this.statefulSets = [];
    this.daemonSets = [];
    this.jobs = [];
    this.cronJobs = [];

    // Track collapsed sections
    this.collapsedSections = new Set();
  }

  async loadAll(namespace) {
    if (!namespace) {
      this.showEmptyState();
      return;
    }

    try {
      // Load all workload types in parallel
      const [
        deploymentsData,
        statefulSetsData,
        daemonSetsData,
        jobsData,
        cronJobsData
      ] = await Promise.all([
        this.kubectlService.getDeployments(namespace).catch(() => ({ items: [] })),
        this.kubectlService.getStatefulSets(namespace).catch(() => ({ items: [] })),
        this.kubectlService.getDaemonSets(namespace).catch(() => ({ items: [] })),
        this.kubectlService.getJobs(namespace).catch(() => ({ items: [] })),
        this.kubectlService.getCronJobs(namespace).catch(() => ({ items: [] }))
      ]);

      this.deployments = deploymentsData.items || [];
      this.statefulSets = statefulSetsData.items || [];
      this.daemonSets = daemonSetsData.items || [];
      this.jobs = jobsData.items || [];
      this.cronJobs = cronJobsData.items || [];

      this.render();
    } catch (error) {
      console.error('[workloads] Failed to load:', error);
      this.showError('Failed to load workloads');
    }
  }

  render() {
    this.container.innerHTML = '';

    // Render each section
    this.container.appendChild(this.renderSection('deployments', 'Deployments', this.deployments, this.renderDeploymentCard.bind(this)));
    this.container.appendChild(this.renderSection('statefulsets', 'StatefulSets', this.statefulSets, this.renderStatefulSetCard.bind(this)));
    this.container.appendChild(this.renderSection('daemonsets', 'DaemonSets', this.daemonSets, this.renderDaemonSetCard.bind(this)));
    this.container.appendChild(this.renderSection('jobs', 'Jobs', this.jobs, this.renderJobCard.bind(this)));
    this.container.appendChild(this.renderSection('cronjobs', 'CronJobs', this.cronJobs, this.renderCronJobCard.bind(this)));
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

  renderDeploymentCard(deployment) {
    const card = document.createElement('div');
    card.className = 'workload-card';

    const name = deployment.metadata.name;
    const replicas = deployment.spec.replicas || 0;
    const readyReplicas = deployment.status.readyReplicas || 0;
    const availableReplicas = deployment.status.availableReplicas || 0;
    const image = this.getFirstImage(deployment.spec.template.spec.containers);
    const strategy = deployment.spec.strategy?.type || 'RollingUpdate';
    const age = this.calculateAge(deployment.metadata.creationTimestamp);

    const statusClass = readyReplicas === replicas ? 'status-ready' :
                       readyReplicas > 0 ? 'status-progressing' : 'status-degraded';

    card.innerHTML = `
      <div class="workload-card-header">
        <div class="workload-card-title">
          <span class="workload-card-name">${name}</span>
        </div>
        <div class="workload-card-status ${statusClass}">
          ${readyReplicas === replicas ? '✓' : '⚠'} ${readyReplicas}/${replicas}
        </div>
      </div>
      <div class="workload-card-info">
        <div class="workload-card-info-item">
          <span class="label">Image:</span>
          <span class="value">${this.truncateImage(image)}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Strategy:</span>
          <span class="value">${strategy}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Age:</span>
          <span class="value">${age}</span>
        </div>
      </div>
      <div class="workload-card-actions">
        <button class="workload-action-btn" data-action="scale">Scale</button>
        <button class="workload-action-btn" data-action="restart">Restart</button>
        <button class="workload-action-btn" data-action="rollback">Rollback</button>
      </div>
    `;

    // Add event listeners
    card.querySelector('[data-action="scale"]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.callbacks.onScale) {
        this.callbacks.onScale('deployment', name, replicas);
      }
    });

    card.querySelector('[data-action="restart"]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.callbacks.onRestart) {
        this.callbacks.onRestart('deployment', name);
      }
    });

    card.querySelector('[data-action="rollback"]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.callbacks.onRollback) {
        this.callbacks.onRollback(name);
      }
    });

    return card;
  }

  renderStatefulSetCard(statefulSet) {
    const card = document.createElement('div');
    card.className = 'workload-card';

    const name = statefulSet.metadata.name;
    const replicas = statefulSet.spec.replicas || 0;
    const readyReplicas = statefulSet.status.readyReplicas || 0;
    const image = this.getFirstImage(statefulSet.spec.template.spec.containers);
    const age = this.calculateAge(statefulSet.metadata.creationTimestamp);

    const statusClass = readyReplicas === replicas ? 'status-ready' :
                       readyReplicas > 0 ? 'status-progressing' : 'status-degraded';

    card.innerHTML = `
      <div class="workload-card-header">
        <div class="workload-card-title">
          <span class="workload-card-name">${name}</span>
        </div>
        <div class="workload-card-status ${statusClass}">
          ${readyReplicas === replicas ? '✓' : '⚠'} ${readyReplicas}/${replicas}
        </div>
      </div>
      <div class="workload-card-info">
        <div class="workload-card-info-item">
          <span class="label">Image:</span>
          <span class="value">${this.truncateImage(image)}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Age:</span>
          <span class="value">${age}</span>
        </div>
      </div>
      <div class="workload-card-actions">
        <button class="workload-action-btn" data-action="scale">Scale</button>
        <button class="workload-action-btn" data-action="restart">Restart</button>
      </div>
    `;

    card.querySelector('[data-action="scale"]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.callbacks.onScale) {
        this.callbacks.onScale('statefulset', name, replicas);
      }
    });

    card.querySelector('[data-action="restart"]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.callbacks.onRestart) {
        this.callbacks.onRestart('statefulset', name);
      }
    });

    return card;
  }

  renderDaemonSetCard(daemonSet) {
    const card = document.createElement('div');
    card.className = 'workload-card';

    const name = daemonSet.metadata.name;
    const desiredNumberScheduled = daemonSet.status.desiredNumberScheduled || 0;
    const numberReady = daemonSet.status.numberReady || 0;
    const image = this.getFirstImage(daemonSet.spec.template.spec.containers);
    const age = this.calculateAge(daemonSet.metadata.creationTimestamp);

    const statusClass = numberReady === desiredNumberScheduled ? 'status-ready' :
                       numberReady > 0 ? 'status-progressing' : 'status-degraded';

    card.innerHTML = `
      <div class="workload-card-header">
        <div class="workload-card-title">
          <span class="workload-card-name">${name}</span>
        </div>
        <div class="workload-card-status ${statusClass}">
          ${numberReady === desiredNumberScheduled ? '✓' : '⚠'} ${numberReady}/${desiredNumberScheduled}
        </div>
      </div>
      <div class="workload-card-info">
        <div class="workload-card-info-item">
          <span class="label">Image:</span>
          <span class="value">${this.truncateImage(image)}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Age:</span>
          <span class="value">${age}</span>
        </div>
      </div>
      <div class="workload-card-actions">
        <button class="workload-action-btn" data-action="restart">Restart</button>
      </div>
    `;

    card.querySelector('[data-action="restart"]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.callbacks.onRestart) {
        this.callbacks.onRestart('daemonset', name);
      }
    });

    return card;
  }

  renderJobCard(job) {
    const card = document.createElement('div');
    card.className = 'workload-card';

    const name = job.metadata.name;
    const completions = job.spec.completions || 1;
    const succeeded = job.status.succeeded || 0;
    const failed = job.status.failed || 0;
    const active = job.status.active || 0;
    const age = this.calculateAge(job.metadata.creationTimestamp);

    let statusClass = 'status-progressing';
    let statusIcon = '⏳';
    if (succeeded >= completions) {
      statusClass = 'status-ready';
      statusIcon = '✓';
    } else if (failed > 0 && active === 0) {
      statusClass = 'status-degraded';
      statusIcon = '✗';
    }

    card.innerHTML = `
      <div class="workload-card-header">
        <div class="workload-card-title">
          <span class="workload-card-name">${name}</span>
        </div>
        <div class="workload-card-status ${statusClass}">
          ${statusIcon} ${succeeded}/${completions}
        </div>
      </div>
      <div class="workload-card-info">
        <div class="workload-card-info-item">
          <span class="label">Active:</span>
          <span class="value">${active}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Failed:</span>
          <span class="value">${failed}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Age:</span>
          <span class="value">${age}</span>
        </div>
      </div>
    `;

    return card;
  }

  renderCronJobCard(cronJob) {
    const card = document.createElement('div');
    card.className = 'workload-card';

    const name = cronJob.metadata.name;
    const schedule = cronJob.spec.schedule;
    const suspend = cronJob.spec.suspend || false;
    const lastScheduleTime = cronJob.status.lastScheduleTime;
    const age = this.calculateAge(cronJob.metadata.creationTimestamp);

    const statusClass = suspend ? 'status-degraded' : 'status-ready';

    card.innerHTML = `
      <div class="workload-card-header">
        <div class="workload-card-title">
          <span class="workload-card-name">${name}</span>
        </div>
        <div class="workload-card-status ${statusClass}">
          ${suspend ? '⏸ Suspended' : '✓ Active'}
        </div>
      </div>
      <div class="workload-card-info">
        <div class="workload-card-info-item">
          <span class="label">Schedule:</span>
          <span class="value">${schedule}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Last Run:</span>
          <span class="value">${lastScheduleTime ? this.calculateAge(lastScheduleTime) + ' ago' : 'Never'}</span>
        </div>
        <div class="workload-card-info-item">
          <span class="label">Age:</span>
          <span class="value">${age}</span>
        </div>
      </div>
      <div class="workload-card-actions">
        <button class="workload-action-btn" data-action="trigger">Trigger Now</button>
      </div>
    `;

    card.querySelector('[data-action="trigger"]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.callbacks.onTriggerJob) {
        this.callbacks.onTriggerJob(name);
      }
    });

    return card;
  }

  // Helper methods
  getFirstImage(containers) {
    if (containers && containers.length > 0) {
      return containers[0].image;
    }
    return 'unknown';
  }

  truncateImage(image) {
    if (!image) return 'unknown';
    // If image has a registry prefix, remove it for display
    const parts = image.split('/');
    const imageName = parts[parts.length - 1];
    return imageName.length > 40 ? imageName.substring(0, 37) + '...' : imageName;
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
        <p>Select a namespace to view workloads</p>
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
    this.deployments = [];
    this.statefulSets = [];
    this.daemonSets = [];
    this.jobs = [];
    this.cronJobs = [];
    this.showEmptyState();
  }
}

export default WorkloadsComponent;
