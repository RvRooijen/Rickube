class FileBrowser {
  constructor(containerId, kubectlService) {
    this.container = document.getElementById(containerId);
    this.kubectlService = kubectlService;
    this.currentPod = null;
    this.currentNamespace = null;
    this.currentPath = '/';
    this.expandedPaths = new Set();
    this.contextMenu = null;
    this.setupContextMenu();
  }

  async init(podName, namespace) {
    this.currentPod = podName;
    this.currentNamespace = namespace;
    this.currentPath = '/';
    this.render();
    await this.loadDirectory('/');
  }

  setupContextMenu() {
    // Create context menu element
    this.contextMenu = document.createElement('div');
    this.contextMenu.className = 'context-menu';
    this.contextMenu.id = 'file-context-menu';
    this.contextMenu.innerHTML = `
      <div class="context-menu-item" data-action="download">
        <span>📥</span>
        <span>Download</span>
      </div>
    `;
    document.body.appendChild(this.contextMenu);

    // Hide context menu on click anywhere
    document.addEventListener('click', () => {
      this.hideContextMenu();
    });

    // Hide context menu on scroll
    document.addEventListener('scroll', () => {
      this.hideContextMenu();
    }, true);

    // Handle context menu item clicks
    this.contextMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.context-menu-item');
      if (item) {
        const action = item.dataset.action;
        const filePath = this.contextMenu.dataset.filePath;
        const fileName = this.contextMenu.dataset.fileName;

        if (action === 'download' && filePath && fileName) {
          this.downloadFile(filePath, fileName);
        }

        this.hideContextMenu();
      }
    });
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
    div.dataset.name = item.name;
    div.dataset.isDirectory = item.isDirectory;

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

    // Add context menu for files only (not directories)
    if (!item.isDirectory && !item.isSymlink) {
      div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showContextMenu(e.clientX, e.clientY, item.path, item.name);
      });
    }

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

      // Download button - now with actual functionality
      document.getElementById('download-file').addEventListener('click', () => {
        this.downloadFile(filePath, fileName);
      });

    } catch (error) {
      previewContainer.innerHTML = `<div class="error-state">Failed to read file: ${error.message}</div>`;
    }
  }

  showContextMenu(x, y, filePath, fileName) {
    // Store file info in context menu
    this.contextMenu.dataset.filePath = filePath;
    this.contextMenu.dataset.fileName = fileName;

    // Position the menu
    this.contextMenu.style.left = `${x}px`;
    this.contextMenu.style.top = `${y}px`;

    // Show the menu
    this.contextMenu.classList.add('show');

    // Adjust position if menu goes off-screen
    const rect = this.contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      this.contextMenu.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      this.contextMenu.style.top = `${y - rect.height}px`;
    }
  }

  hideContextMenu() {
    if (this.contextMenu) {
      this.contextMenu.classList.remove('show');
    }
  }

  async downloadFile(filePath, fileName) {
    try {
      // Get reference to app instance for toast notifications
      const app = window.app || { showSuccess: console.log, showError: console.error };

      // Show loading toast
      app.showSuccess(`Downloading ${fileName}...`);

      // Read file content from pod
      const content = await this.kubectlService.readFile(
        this.currentPod,
        this.currentNamespace,
        filePath
      );

      // Create blob and download
      const blob = new Blob([content], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);

      // Create temporary download link
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Show success toast
      app.showSuccess('File downloaded successfully');

    } catch (error) {
      console.error('Download failed:', error);
      const app = window.app || { showError: console.error };
      app.showError(`Failed to download file: ${error.message}`);
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
