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
}

export default KubectlService;
