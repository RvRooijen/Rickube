// kubectl.js - Service layer for kubectl operations

class KubectlService {
  constructor() {
    this.api = window.api.kubectl;
  }

  // Check if kubectl is available
  async check() {
    return await this.api.check();
  }

  // Get all namespaces
  async getNamespaces() {
    const result = await this.api.exec(['get', 'namespaces', '-o', 'json']);

    if (result.success) {
      try {
        return JSON.parse(result.data);
      } catch (parseError) {
        console.error('[kubectl] Failed to parse namespace JSON:', parseError);
        throw parseError;
      }
    }
    throw new Error(result.error);
  }

  // Get all pods in a namespace
  async getPods(namespace) {
    const result = await this.api.exec(['get', 'pods', '-n', namespace, '-o', 'json']);
    if (result.success) {
      return JSON.parse(result.data);
    }
    throw new Error(result.error);
  }

  // Get pod details
  async getPodDetails(podName, namespace) {
    const result = await this.api.exec(['get', 'pod', podName, '-n', namespace, '-o', 'json']);
    if (result.success) {
      return JSON.parse(result.data);
    }
    throw new Error(result.error);
  }

  // Get pod metrics (requires metrics-server)
  async getPodMetrics(namespace) {
    const result = await this.api.exec(['top', 'pods', '-n', namespace, '--no-headers']);
    if (result.success) {
      return this.parseMetrics(result.data);
    }
    // Return empty array if metrics-server is not available
    if (result.error && result.error.includes('Metrics API not available')) {
      return [];
    }
    throw new Error(result.error);
  }

  // Parse metrics output
  parseMetrics(output) {
    if (!output || !output.trim()) return [];

    const lines = output.trim().split('\n');
    return lines.map(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        return {
          name: parts[0],
          cpu: parts[1],
          memory: parts[2],
        };
      }
      return null;
    }).filter(m => m !== null);
  }

  // Get current context
  async getCurrentContext() {
    const result = await this.api.exec(['config', 'current-context']);
    if (result.success) {
      return result.data.trim();
    }
    throw new Error(result.error);
  }

  // Get all contexts
  async getContexts() {
    const result = await this.api.getContexts();
    if (result.success) {
      return result.data;
    }
    throw new Error(result.error);
  }

  // Switch context
  async useContext(contextName) {
    return await this.api.useContext(contextName);
  }

  // Get pod logs (non-streaming, for initial load)
  async getPodLogs(podName, namespace, tailLines = 100) {
    const result = await this.api.exec(['logs', podName, '-n', namespace, `--tail=${tailLines}`]);
    if (result.success) {
      return result.data;
    }
    throw new Error(result.error);
  }

  // Delete pod
  async deletePod(podName, namespace) {
    const result = await this.api.exec(['delete', 'pod', podName, '-n', namespace]);
    if (result.success) {
      return result.data;
    }
    throw new Error(result.error);
  }

  // Describe pod
  async describePod(podName, namespace) {
    const result = await this.api.exec(['describe', 'pod', podName, '-n', namespace]);
    if (result.success) {
      return result.data;
    }
    throw new Error(result.error);
  }

  // Check if user can list pods in a namespace
  async canListPods(namespace) {
    const result = await this.api.exec(['auth', 'can-i', 'list', 'pods', '-n', namespace]);
    if (result.success) {
      const answer = result.data.trim().toLowerCase();
      return answer === 'yes';
    }
    // If the command fails, assume no access
    return false;
  }

  // List directory contents
  async listDirectory(podName, namespace, path = '/') {
    const result = await this.api.listDirectory(podName, namespace, path);
    if (result.success) {
      return this.parseDirectoryListing(result.data, path);
    }
    throw new Error(result.error);
  }

  // Parse ls -la output into structured data
  parseDirectoryListing(output, currentPath) {
    const lines = output.trim().split('\n');
    const items = [];

    for (let i = 1; i < lines.length; i++) { // Skip 'total' line
      const line = lines[i].trim();
      const parts = line.split(/\s+/);

      if (parts.length < 9) continue;

      const permissions = parts[0];
      let name = parts.slice(8).join(' '); // Handle spaces in names

      if (name === '.' || name === '..') continue;

      // Handle symbolic links (format: "linkname -> target")
      const isSymlink = permissions.startsWith('l');
      if (isSymlink && name.includes(' -> ')) {
        name = name.split(' -> ')[0]; // Only keep the link name, not the target
      }

      const isDirectory = permissions.startsWith('d') || isSymlink; // Treat symlinks as navigable

      items.push({
        name,
        isDirectory,
        permissions,
        size: parts[4],
        isSymlink,
        path: currentPath.endsWith('/') ? currentPath + name : currentPath + '/' + name
      });
    }

    return items;
  }

  // Read file contents
  async readFile(podName, namespace, filePath) {
    const result = await this.api.readFile(podName, namespace, filePath);
    if (result.success) {
      return result.data;
    }
    throw new Error(result.error);
  }

  // ============================================
  // Workloads: Deployments
  // ============================================

  async getDeployments(namespace) {
    const result = await this.api.exec(['get', 'deployments', '-n', namespace, '-o', 'json']);
    if (result.success) {
      return JSON.parse(result.data);
    }
    throw new Error(result.error);
  }

  async scaleResource(resourceType, name, namespace, replicas) {
    const result = await this.api.exec(['scale', `${resourceType}/${name}`, '-n', namespace, `--replicas=${replicas}`]);
    if (result.success) {
      return result.data;
    }
    throw new Error(result.error);
  }

  async restartResource(resourceType, name, namespace) {
    const result = await this.api.exec(['rollout', 'restart', `${resourceType}/${name}`, '-n', namespace]);
    if (result.success) {
      return result.data;
    }
    throw new Error(result.error);
  }

  async getRolloutStatus(resourceType, name, namespace) {
    // Get current deployment/statefulset status
    const result = await this.api.exec(['get', resourceType, name, '-n', namespace, '-o', 'json']);
    if (result.success) {
      const resource = JSON.parse(result.data);
      const status = resource.status || {};
      const spec = resource.spec || {};

      return {
        replicas: spec.replicas || 0,
        readyReplicas: status.readyReplicas || 0,
        updatedReplicas: status.updatedReplicas || 0,
        availableReplicas: status.availableReplicas || 0,
        unavailableReplicas: status.unavailableReplicas || 0,
        observedGeneration: status.observedGeneration,
        generation: resource.metadata?.generation,
        conditions: status.conditions || [],
      };
    }
    throw new Error(result.error);
  }

  async getResourceEvents(resourceType, name, namespace) {
    // Get events related to a specific resource
    const fieldSelector = `involvedObject.name=${name},involvedObject.kind=${this.getKindFromType(resourceType)}`;
    const result = await this.api.exec(['get', 'events', '-n', namespace, '--field-selector', fieldSelector, '--sort-by=.lastTimestamp', '-o', 'json']);
    if (result.success) {
      const data = JSON.parse(result.data);
      return data.items || [];
    }
    return [];
  }

  getKindFromType(resourceType) {
    const kindMap = {
      'deployment': 'Deployment',
      'statefulset': 'StatefulSet',
      'daemonset': 'DaemonSet',
      'replicaset': 'ReplicaSet',
      'pod': 'Pod',
    };
    return kindMap[resourceType] || resourceType;
  }

  async rollbackDeployment(name, namespace, revision = null) {
    const args = ['rollout', 'undo', `deployment/${name}`, '-n', namespace];
    if (revision) {
      args.push(`--to-revision=${revision}`);
    }
    const result = await this.api.exec(args);
    if (result.success) {
      return result.data;
    }
    throw new Error(result.error);
  }

  async getRolloutHistory(name, namespace) {
    const result = await this.api.exec(['rollout', 'history', `deployment/${name}`, '-n', namespace]);
    if (result.success) {
      return this.parseRolloutHistory(result.data);
    }
    throw new Error(result.error);
  }

  parseRolloutHistory(output) {
    if (!output || !output.trim()) return [];

    const lines = output.trim().split('\n');
    const revisions = [];

    // Skip header lines
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(/\s+/);
      if (parts.length >= 1) {
        revisions.push({
          revision: parts[0],
          change: parts.slice(1).join(' ') || '<none>'
        });
      }
    }

    return revisions;
  }

  // ============================================
  // Workloads: StatefulSets
  // ============================================

  async getStatefulSets(namespace) {
    const result = await this.api.exec(['get', 'statefulsets', '-n', namespace, '-o', 'json']);
    if (result.success) {
      return JSON.parse(result.data);
    }
    throw new Error(result.error);
  }

  // ============================================
  // Workloads: DaemonSets
  // ============================================

  async getDaemonSets(namespace) {
    const result = await this.api.exec(['get', 'daemonsets', '-n', namespace, '-o', 'json']);
    if (result.success) {
      return JSON.parse(result.data);
    }
    throw new Error(result.error);
  }

  // ============================================
  // Workloads: Jobs
  // ============================================

  async getJobs(namespace) {
    const result = await this.api.exec(['get', 'jobs', '-n', namespace, '-o', 'json']);
    if (result.success) {
      return JSON.parse(result.data);
    }
    throw new Error(result.error);
  }

  async deleteJob(name, namespace) {
    const result = await this.api.exec(['delete', 'job', name, '-n', namespace]);
    if (result.success) {
      return result.data;
    }
    throw new Error(result.error);
  }

  // ============================================
  // Workloads: CronJobs
  // ============================================

  async getCronJobs(namespace) {
    const result = await this.api.exec(['get', 'cronjobs', '-n', namespace, '-o', 'json']);
    if (result.success) {
      return JSON.parse(result.data);
    }
    throw new Error(result.error);
  }

  async triggerCronJob(name, namespace) {
    const jobName = `${name}-manual-${Date.now()}`;
    const result = await this.api.exec(['create', 'job', jobName, `--from=cronjob/${name}`, '-n', namespace]);
    if (result.success) {
      return result.data;
    }
    throw new Error(result.error);
  }

  // ============================================
  // Events
  // ============================================

  async getEvents(namespace) {
    const result = await this.api.exec(['get', 'events', '-n', namespace, '--sort-by=.lastTimestamp', '-o', 'json']);
    if (result.success) {
      return JSON.parse(result.data);
    }
    throw new Error(result.error);
  }

  // ============================================
  // Networking: Services
  // ============================================

  async getServices(namespace) {
    const result = await this.api.exec(['get', 'services', '-n', namespace, '-o', 'json']);
    if (result.success) {
      return JSON.parse(result.data);
    }
    throw new Error(result.error);
  }

  async describeService(name, namespace) {
    const result = await this.api.exec(['describe', 'service', name, '-n', namespace]);
    if (result.success) {
      return result.data;
    }
    throw new Error(result.error);
  }

  // ============================================
  // Networking: Ingresses
  // ============================================

  async getIngresses(namespace) {
    const result = await this.api.exec(['get', 'ingress', '-n', namespace, '-o', 'json']);
    if (result.success) {
      return JSON.parse(result.data);
    }
    throw new Error(result.error);
  }

  // ============================================
  // Networking: Endpoints
  // ============================================

  async getEndpoints(namespace) {
    const result = await this.api.exec(['get', 'endpoints', '-n', namespace, '-o', 'json']);
    if (result.success) {
      return JSON.parse(result.data);
    }
    throw new Error(result.error);
  }

  // ============================================
  // Config: ConfigMaps
  // ============================================

  async getConfigMaps(namespace) {
    const result = await this.api.exec(['get', 'configmaps', '-n', namespace, '-o', 'json']);
    if (result.success) {
      return JSON.parse(result.data);
    }
    throw new Error(result.error);
  }

  async getConfigMapData(name, namespace) {
    const result = await this.api.exec(['get', 'configmap', name, '-n', namespace, '-o', 'json']);
    if (result.success) {
      return JSON.parse(result.data);
    }
    throw new Error(result.error);
  }

  // ============================================
  // Config: Secrets
  // ============================================

  async getSecrets(namespace) {
    const result = await this.api.exec(['get', 'secrets', '-n', namespace, '-o', 'json']);
    if (result.success) {
      return JSON.parse(result.data);
    }
    throw new Error(result.error);
  }

  async getSecretData(name, namespace) {
    const result = await this.api.exec(['get', 'secret', name, '-n', namespace, '-o', 'json']);
    if (result.success) {
      return JSON.parse(result.data);
    }
    throw new Error(result.error);
  }

  // ============================================
  // Storage: PersistentVolumeClaims
  // ============================================

  async getPVCs(namespace) {
    const result = await this.api.exec(['get', 'pvc', '-n', namespace, '-o', 'json']);
    if (result.success) {
      return JSON.parse(result.data);
    }
    throw new Error(result.error);
  }

  async describePVC(name, namespace) {
    const result = await this.api.exec(['describe', 'pvc', name, '-n', namespace]);
    if (result.success) {
      return result.data;
    }
    throw new Error(result.error);
  }

  // ============================================
  // Storage: PersistentVolumes (cluster-wide)
  // ============================================

  async getPVs() {
    const result = await this.api.exec(['get', 'pv', '-o', 'json']);
    if (result.success) {
      return JSON.parse(result.data);
    }
    throw new Error(result.error);
  }

  // ============================================
  // Cluster: Nodes
  // ============================================

  async getNodes() {
    const result = await this.api.exec(['get', 'nodes', '-o', 'json']);
    if (result.success) {
      return JSON.parse(result.data);
    }
    throw new Error(result.error);
  }

  async describeNode(name) {
    const result = await this.api.exec(['describe', 'node', name]);
    if (result.success) {
      return result.data;
    }
    throw new Error(result.error);
  }

  async getNodeMetrics() {
    const result = await this.api.exec(['top', 'nodes', '--no-headers']);
    if (result.success) {
      return this.parseNodeMetrics(result.data);
    }
    // Return empty array if metrics-server is not available
    if (result.error && result.error.includes('Metrics API not available')) {
      return [];
    }
    throw new Error(result.error);
  }

  parseNodeMetrics(output) {
    if (!output || !output.trim()) return [];

    const lines = output.trim().split('\n');
    return lines.map(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5) {
        return {
          name: parts[0],
          cpuCores: parts[1],
          cpuPercent: parts[2],
          memoryBytes: parts[3],
          memoryPercent: parts[4],
        };
      }
      return null;
    }).filter(m => m !== null);
  }
}

export default KubectlService;
