// sidebar.js - Namespace sidebar component

class Sidebar {
  constructor(containerId, onNamespaceSelect) {
    this.container = document.getElementById(containerId);
    this.onNamespaceSelect = onNamespaceSelect;
    this.namespaces = [];
    this.selectedNamespace = null;
    this.podCounts = new Map();
    this.noAccessNamespaces = new Set();
    this.filterAccessibleOnly = true; // Default: alleen toegankelijke namespaces tonen

    // Setup filter toggle
    this.setupFilterToggle();
  }

  setupFilterToggle() {
    const filterToggle = document.getElementById('filter-accessible');
    if (filterToggle) {
      filterToggle.addEventListener('change', (e) => {
        this.filterAccessibleOnly = e.target.checked;
        this.render(this.namespaces);
      });
    }
  }

  // Render the namespace list
  render(namespaces) {
    this.namespaces = namespaces;

    if (!namespaces || namespaces.length === 0) {
      this.container.innerHTML = '<div class="empty-state">No namespaces found</div>';
      return;
    }

    // Filter namespaces based on filter setting
    let filteredNamespaces = namespaces;
    if (this.filterAccessibleOnly) {
      filteredNamespaces = namespaces.filter(ns => {
        const hasNoAccess = this.noAccessNamespaces.has(ns.name) || ns.noAccess;
        return !hasNoAccess;
      });
    }

    this.container.innerHTML = '';

    if (filteredNamespaces.length === 0) {
      this.container.innerHTML = '<div class="empty-state">Geen toegankelijke namespaces gevonden</div>';
      return;
    }

    filteredNamespaces.forEach(ns => {
      const item = document.createElement('div');
      item.className = 'namespace-item';

      const hasNoAccess = this.noAccessNamespaces.has(ns.name) || ns.noAccess;

      if (hasNoAccess) {
        item.classList.add('no-access');
        item.title = 'No access to this namespace';
      }

      if (ns.name === this.selectedNamespace && !hasNoAccess) {
        item.classList.add('active');
      }

      const name = document.createElement('span');
      name.className = 'namespace-name';
      name.textContent = ns.name;

      const badge = document.createElement('span');
      badge.className = 'namespace-badge';

      if (hasNoAccess) {
        badge.textContent = '🔒';
      } else {
        const count = this.podCounts.get(ns.name) || 0;
        badge.textContent = count;
      }

      item.appendChild(name);
      item.appendChild(badge);

      // Only make it clickable if there's access
      if (!hasNoAccess) {
        item.addEventListener('click', () => {
          this.selectNamespace(ns.name);
        });
      }

      this.container.appendChild(item);
    });
  }

  // Select a namespace
  selectNamespace(namespaceName) {
    this.selectedNamespace = namespaceName;

    // Update active state
    const items = this.container.querySelectorAll('.namespace-item');
    items.forEach(item => {
      const name = item.querySelector('.namespace-name').textContent;
      if (name === namespaceName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Trigger callback
    if (this.onNamespaceSelect) {
      this.onNamespaceSelect(namespaceName);
    }
  }

  // Update pod count for a namespace
  updatePodCount(namespaceName, count) {
    this.podCounts.set(namespaceName, count);

    // Update badge
    const items = this.container.querySelectorAll('.namespace-item');
    items.forEach(item => {
      const name = item.querySelector('.namespace-name').textContent;
      if (name === namespaceName) {
        const badge = item.querySelector('.namespace-badge');
        badge.textContent = count;
      }
    });
  }

  // Mark a namespace as no access
  markAsNoAccess(namespaceName) {
    this.noAccessNamespaces.add(namespaceName);

    // Update the UI to show it as grayed out
    const items = this.container.querySelectorAll('.namespace-item');
    items.forEach(item => {
      const name = item.querySelector('.namespace-name').textContent;
      if (name === namespaceName) {
        item.classList.add('no-access');
        item.title = 'No access to this namespace';

        // Remove click listener by replacing the element
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);

        // Update badge to show lock icon
        const badge = newItem.querySelector('.namespace-badge');
        badge.textContent = '🔒';
      }
    });
  }

  // Get selected namespace
  getSelectedNamespace() {
    return this.selectedNamespace;
  }

  // Show loading state
  showLoading() {
    this.container.innerHTML = '<div class="loading">Loading namespaces...</div>';
  }

  // Show error state
  showError(message) {
    this.container.innerHTML = `<div class="error-state">${message}</div>`;
  }
}

export default Sidebar;
