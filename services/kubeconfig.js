// kubeconfig.js - Multi-cluster configuration handler

class KubeconfigService {
  constructor(kubectlService) {
    this.kubectlService = kubectlService;
    this.currentContext = null;
    this.contexts = [];
  }

  // Load all available contexts
  async loadContexts() {
    try {
      const contextsData = await this.kubectlService.getContexts();

      if (contextsData && contextsData.items) {
        this.contexts = contextsData.items.map(item => ({
          name: item.name,
          cluster: item.context.cluster,
          namespace: item.context.namespace || 'default',
          user: item.context.user,
          isCurrent: item.name === contextsData.current,
        }));
      }

      // Get current context
      this.currentContext = await this.kubectlService.getCurrentContext();

      return this.contexts;
    } catch (error) {
      console.error('Failed to load contexts:', error);
      throw error;
    }
  }

  // Switch to a different context
  async switchContext(contextName) {
    try {
      const result = await this.kubectlService.useContext(contextName);
      if (result.success) {
        this.currentContext = contextName;
        // Update current flag in contexts
        this.contexts = this.contexts.map(ctx => ({
          ...ctx,
          isCurrent: ctx.name === contextName,
        }));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to switch context:', error);
      throw error;
    }
  }

  // Get current context
  getCurrentContext() {
    return this.currentContext;
  }

  // Get all contexts
  getContexts() {
    return this.contexts;
  }

  // Get context by name
  getContext(name) {
    return this.contexts.find(ctx => ctx.name === name);
  }
}

export default KubeconfigService;
