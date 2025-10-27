class FileBrowser {
  constructor(containerId, kubectlService) {
    this.container = document.getElementById(containerId);
    this.kubectlService = kubectlService;
    this.currentPod = null;
    this.currentNamespace = null;
    this.currentPath = '/';
    this.expandedPaths = new Set();
  }

  async init(podName, namespace) {
    this.currentPod = podName;
    this.currentNamespace = namespace;
    this.currentPath = '/';
    this.render();
    await this.loadDirectory('/');
  }

  render() {
    this.container.innerHTML = `
      <div class="file-browser">
        <div class="file-browser-breadcrumbs" id="file-breadcrumbs"></div>
        <div class="file-browser-content" id="file-browser-content">
          <div class="file-tree" id="file-tree">
            <div class="loading">Loading files...</div>
          </div>
          <div class="resize-handle" id="resize-handle"></div>
          <div class="file-preview" id="file-preview">
            <div class="empty-state">Select a file to preview</div>
          </div>
        </div>
      </div>
    `;

    this.setupResize();
  }

  setupResize() {
    const container = document.getElementById('file-browser-content');
    const leftPanel = document.getElementById('file-tree');
    const handle = document.getElementById('resize-handle');

    if (!container || !leftPanel || !handle) return;

    let isResizing = false;

    handle.addEventListener('mousedown', (e) => {
      isResizing = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;

      const containerRect = container.getBoundingClientRect();
      const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;

      // Limit between 20% and 80%
      if (newWidth >= 20 && newWidth <= 80) {
        leftPanel.style.width = `${newWidth}%`;
      }
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  async loadDirectory(path) {
    const treeContainer = document.getElementById('file-tree');

    try {
      const items = await this.kubectlService.listDirectory(this.currentPod, this.currentNamespace, path);
      this.renderTree(items, path);
      this.updateBreadcrumbs(path);
      this.currentPath = path;
    } catch (error) {
      // Show user-friendly error message
      let errorMsg = error.message;
      if (errorMsg.includes('Permission denied')) {
        errorMsg = `🔒 Geen toegang tot deze directory (${path})`;
      }
      treeContainer.innerHTML = `
        <div class="error-state">
          <p>${errorMsg}</p>
          <button class="btn btn-small" id="go-back-btn">← Ga terug</button>
        </div>
      `;

      // Add event listener for back button
      const backBtn = document.getElementById('go-back-btn');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          // Go back to parent directory
          const parentPath = this.getParentPath(path);
          this.loadDirectory(parentPath);
        });
      }
    }
  }

  getParentPath(path) {
    if (path === '/' || !path) return '/';
    const parts = path.split('/').filter(p => p);
    parts.pop();
    return parts.length === 0 ? '/' : '/' + parts.join('/');
  }

  renderTree(items, path) {
    const treeContainer = document.getElementById('file-tree');
    treeContainer.innerHTML = '';

    // Sort: directories first, then files
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    items.forEach(item => {
      const itemElement = this.createTreeItem(item);
      treeContainer.appendChild(itemElement);
    });
  }

  createTreeItem(item) {
    const div = document.createElement('div');
    div.className = 'file-tree-item';
    div.dataset.path = item.path;

    let icon;
    if (item.isSymlink) {
      icon = '🔗'; // Symlink icon
    } else if (item.isDirectory) {
      icon = '📁';
    } else {
      icon = this.getFileIcon(item.name);
    }

    div.innerHTML = `
      <span class="file-icon">${icon}</span>
      <span class="file-name">${item.name}</span>
      <span class="file-size">${item.isDirectory ? '' : item.size}</span>
    `;

    div.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (item.isDirectory || item.isSymlink) {
        await this.loadDirectory(item.path);
      } else {
        await this.previewFile(item.path, item.name);
      }
    });

    return div;
  }

  getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
      'js': '📜', 'json': '📋', 'txt': '📄', 'log': '📝',
      'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️',
      'sh': '🔧', 'yml': '⚙️', 'yaml': '⚙️', 'xml': '📋',
      'md': '📖', 'pdf': '📕', 'zip': '📦', 'tar': '📦'
    };
    return iconMap[ext] || '📄';
  }

  async previewFile(filePath, fileName) {
    const previewContainer = document.getElementById('file-preview');

    try {
      previewContainer.innerHTML = '<div class="loading">Loading file...</div>';

      const content = await this.kubectlService.readFile(this.currentPod, this.currentNamespace, filePath);

      previewContainer.innerHTML = `
        <div class="file-preview-header">
          <span class="file-preview-name">${fileName}</span>
          <button class="btn btn-small" id="download-file" title="Download file">⬇ Download</button>
        </div>
        <div class="file-preview-content">
          <pre><code>${this.escapeHtml(content)}</code></pre>
        </div>
      `;

      // Download button (placeholder for now)
      document.getElementById('download-file').addEventListener('click', () => {
        alert('Download functionaliteit komt later');
      });

    } catch (error) {
      previewContainer.innerHTML = `<div class="error-state">Failed to read file: ${error.message}</div>`;
    }
  }

  updateBreadcrumbs(path) {
    const breadcrumbsContainer = document.getElementById('file-breadcrumbs');
    const parts = path.split('/').filter(p => p);

    let html = '<span class="breadcrumb-item" data-path="/">📁 /</span>';
    let currentPath = '';

    parts.forEach((part, index) => {
      currentPath += '/' + part;
      html += `<span class="breadcrumb-separator">›</span>`;
      html += `<span class="breadcrumb-item" data-path="${currentPath}">${part}</span>`;
    });

    breadcrumbsContainer.innerHTML = html;

    // Add click handlers
    breadcrumbsContainer.querySelectorAll('.breadcrumb-item').forEach(item => {
      item.addEventListener('click', () => {
        const path = item.dataset.path;
        this.loadDirectory(path);
      });
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  clear() {
    this.container.innerHTML = '<div class="empty-state">Select a pod to browse files</div>';
  }
}

export default FileBrowser;
