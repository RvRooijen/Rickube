// metrics.js - Resource metrics display component

class MetricsComponent {
  constructor() {
    this.metricsAvailable = true;
  }

  // Render metrics for a pod
  renderPodMetrics(pod, metrics) {
    const container = document.createElement('div');
    container.className = 'metrics-section';

    const title = document.createElement('h3');
    title.textContent = 'Resource Usage';
    container.appendChild(title);

    if (!this.metricsAvailable) {
      const warning = document.createElement('div');
      warning.className = 'metrics-warning';
      warning.textContent = 'Metrics server not available';
      container.appendChild(warning);
      return container;
    }

    if (!metrics) {
      const info = document.createElement('div');
      info.className = 'metrics-info';
      info.textContent = 'No metrics available for this pod';
      container.appendChild(info);
      return container;
    }

    // CPU metric
    const cpuMetric = document.createElement('div');
    cpuMetric.className = 'metric-row';
    cpuMetric.innerHTML = `
      <span class="metric-label">CPU:</span>
      <span class="metric-value">${metrics.cpu}</span>
    `;
    container.appendChild(cpuMetric);

    // Memory metric
    const memMetric = document.createElement('div');
    memMetric.className = 'metric-row';
    memMetric.innerHTML = `
      <span class="metric-label">Memory:</span>
      <span class="metric-value">${metrics.memory}</span>
    `;
    container.appendChild(memMetric);

    return container;
  }

  // Render container status
  renderContainerStatus(pod) {
    const container = document.createElement('div');
    container.className = 'container-status-section';

    const title = document.createElement('h3');
    title.textContent = 'Containers';
    container.appendChild(title);

    if (!pod.status.containerStatuses || pod.status.containerStatuses.length === 0) {
      const info = document.createElement('div');
      info.textContent = 'No container information available';
      container.appendChild(info);
      return container;
    }

    pod.status.containerStatuses.forEach(containerStatus => {
      const containerDiv = document.createElement('div');
      containerDiv.className = 'container-item';

      const name = document.createElement('div');
      name.className = 'container-name';
      name.textContent = containerStatus.name;

      const statusDiv = document.createElement('div');
      statusDiv.className = 'container-info';

      const ready = containerStatus.ready ? '✓ Ready' : '✗ Not Ready';
      const readyClass = containerStatus.ready ? 'status-ready' : 'status-not-ready';

      statusDiv.innerHTML = `
        <div class="${readyClass}">${ready}</div>
        <div>Restarts: ${containerStatus.restartCount}</div>
        <div>Image: ${containerStatus.image}</div>
      `;

      containerDiv.appendChild(name);
      containerDiv.appendChild(statusDiv);
      container.appendChild(containerDiv);
    });

    return container;
  }

  // Render pod conditions
  renderConditions(pod) {
    const container = document.createElement('div');
    container.className = 'conditions-section';

    const title = document.createElement('h3');
    title.textContent = 'Conditions';
    container.appendChild(title);

    if (!pod.status.conditions || pod.status.conditions.length === 0) {
      const info = document.createElement('div');
      info.textContent = 'No conditions available';
      container.appendChild(info);
      return container;
    }

    const table = document.createElement('div');
    table.className = 'conditions-table';

    pod.status.conditions.forEach(condition => {
      const row = document.createElement('div');
      row.className = 'condition-row';

      const statusClass = condition.status === 'True' ? 'condition-true' : 'condition-false';

      row.innerHTML = `
        <span class="condition-type">${condition.type}</span>
        <span class="condition-status ${statusClass}">${condition.status}</span>
      `;

      table.appendChild(row);
    });

    container.appendChild(table);
    return container;
  }

  // Render basic pod info
  renderBasicInfo(pod) {
    const container = document.createElement('div');
    container.className = 'basic-info-section';

    const title = document.createElement('h3');
    title.textContent = 'Pod Information';
    container.appendChild(title);

    const info = document.createElement('div');
    info.className = 'info-table';

    const fields = [
      { label: 'Name', value: pod.metadata.name },
      { label: 'Namespace', value: pod.metadata.namespace },
      { label: 'Status', value: pod.status.phase },
      { label: 'Node', value: pod.spec.nodeName || 'N/A' },
      { label: 'IP', value: pod.status.podIP || 'N/A' },
      { label: 'Created', value: new Date(pod.metadata.creationTimestamp).toLocaleString() },
    ];

    fields.forEach(field => {
      const row = document.createElement('div');
      row.className = 'info-row';
      row.innerHTML = `
        <span class="info-label">${field.label}:</span>
        <span class="info-value">${field.value}</span>
      `;
      info.appendChild(row);
    });

    container.appendChild(info);
    return container;
  }

  // Mark metrics as unavailable
  setMetricsUnavailable() {
    this.metricsAvailable = false;
  }

  // Mark metrics as available
  setMetricsAvailable() {
    this.metricsAvailable = true;
  }
}

export default MetricsComponent;
