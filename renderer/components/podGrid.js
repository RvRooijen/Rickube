// podGrid.js - Pod grid component

class PodGrid {
  constructor(containerId, onPodSelect) {
    this.container = document.getElementById(containerId);
    this.onPodSelect = onPodSelect;
    this.pods = [];
    this.selectedPod = null;
    this.metrics = new Map();
  }

  // Render the pod grid
  render(pods) {
    this.pods = pods;

    if (!pods || pods.length === 0) {
      this.container.innerHTML = '<div class="empty-state"><p>No pods found in this namespace</p></div>';
      return;
    }

    this.container.innerHTML = '';

    pods.forEach(pod => {
      const card = this.createPodCard(pod);
      this.container.appendChild(card);
    });
  }

  // Create a pod card element
  createPodCard(pod) {
    const card = document.createElement('div');
    card.className = 'pod-card';
    card.dataset.podName = pod.metadata.name;

    if (this.selectedPod === pod.metadata.name) {
      card.classList.add('selected');
    }

    // Status indicator
    const status = this.getPodStatus(pod);
    card.classList.add(`status-${status.phase.toLowerCase()}`);

    // Pod header
    const header = document.createElement('div');
    header.className = 'pod-card-header';

    const statusDot = document.createElement('span');
    statusDot.className = `status-dot status-${status.phase.toLowerCase()}`;

    const name = document.createElement('span');
    name.className = 'pod-name';
    name.textContent = pod.metadata.name;
    name.title = pod.metadata.name;

    header.appendChild(statusDot);
    header.appendChild(name);

    // Pod info
    const info = document.createElement('div');
    info.className = 'pod-info';

    const readyInfo = document.createElement('div');
    readyInfo.className = 'pod-info-item';
    readyInfo.innerHTML = `<span class="label">Ready:</span> <span class="value">${status.ready}</span>`;

    const restartInfo = document.createElement('div');
    restartInfo.className = 'pod-info-item';
    restartInfo.innerHTML = `<span class="label">Restarts:</span> <span class="value">${status.restarts}</span>`;

    const ageInfo = document.createElement('div');
    ageInfo.className = 'pod-info-item';
    ageInfo.innerHTML = `<span class="label">Age:</span> <span class="value">${this.getAge(pod.metadata.creationTimestamp)}</span>`;

    info.appendChild(readyInfo);
    info.appendChild(restartInfo);
    info.appendChild(ageInfo);

    // Metrics (if available)
    const metrics = this.metrics.get(pod.metadata.name);
    if (metrics) {
      const metricsDiv = document.createElement('div');
      metricsDiv.className = 'pod-metrics';

      const cpuDiv = document.createElement('div');
      cpuDiv.className = 'metric-item';
      cpuDiv.innerHTML = `<span class="label">CPU:</span> <span class="value">${metrics.cpu}</span>`;

      const memDiv = document.createElement('div');
      memDiv.className = 'metric-item';
      memDiv.innerHTML = `<span class="label">Memory:</span> <span class="value">${metrics.memory}</span>`;

      metricsDiv.appendChild(cpuDiv);
      metricsDiv.appendChild(memDiv);
      info.appendChild(metricsDiv);
    }

    card.appendChild(header);
    card.appendChild(info);

    // Click handler
    card.addEventListener('click', () => {
      this.selectPod(pod.metadata.name, pod);
    });

    return card;
  }

  // Get pod status
  getPodStatus(pod) {
    const phase = pod.status.phase || 'Unknown';
    let ready = '0/0';
    let restarts = 0;

    if (pod.status.containerStatuses) {
      const totalContainers = pod.status.containerStatuses.length;
      const readyContainers = pod.status.containerStatuses.filter(c => c.ready).length;
      ready = `${readyContainers}/${totalContainers}`;
      restarts = pod.status.containerStatuses.reduce((sum, c) => sum + c.restartCount, 0);
    }

    return { phase, ready, restarts };
  }

  // Calculate age from timestamp
  getAge(timestamp) {
    const created = new Date(timestamp);
    const now = new Date();
    const diffMs = now - created;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d`;
    if (diffHours > 0) return `${diffHours}h`;
    if (diffMins > 0) return `${diffMins}m`;
    return '< 1m';
  }

  // Select a pod
  selectPod(podName, podData) {
    this.selectedPod = podName;

    // Update selected state
    const cards = this.container.querySelectorAll('.pod-card');
    cards.forEach(card => {
      if (card.dataset.podName === podName) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });

    // Trigger callback
    if (this.onPodSelect) {
      this.onPodSelect(podName, podData);
    }
  }

  // Update metrics
  updateMetrics(metrics) {
    this.metrics.clear();
    metrics.forEach(m => {
      this.metrics.set(m.name, { cpu: m.cpu, memory: m.memory });
    });

    // Re-render to show metrics
    this.render(this.pods);
  }

  // Get selected pod
  getSelectedPod() {
    return this.selectedPod;
  }

  // Show loading state
  showLoading() {
    this.container.innerHTML = '<div class="loading">Loading pods...</div>';
  }

  // Show error state
  showError(message) {
    this.container.innerHTML = `<div class="error-state">${message}</div>`;
  }
}

export default PodGrid;
