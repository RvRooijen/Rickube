const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', {
  // Kubectl operations
  kubectl: {
    exec: (args) => ipcRenderer.invoke('kubectl:exec', args),
    getContexts: () => ipcRenderer.invoke('kubectl:getContexts'),
    useContext: (contextName) => ipcRenderer.invoke('kubectl:useContext', contextName),
    check: () => ipcRenderer.invoke('kubectl:check'),
    listDirectory: (podName, namespace, path) => ipcRenderer.invoke('kubectl:listDirectory', { podName, namespace, path }),
    readFile: (podName, namespace, filePath) => ipcRenderer.invoke('kubectl:readFile', { podName, namespace, filePath }),
  },

  // Terminal operations
  terminal: {
    create: (options) => ipcRenderer.invoke('terminal:create', options),
    write: (data) => ipcRenderer.invoke('terminal:write', data),
    resize: (data) => ipcRenderer.invoke('terminal:resize', data),
    close: (data) => ipcRenderer.invoke('terminal:close', data),
    onData: (callback) => {
      ipcRenderer.on('terminal:data', (event, data) => callback(data));
    },
    onExit: (callback) => {
      ipcRenderer.on('terminal:exit', (event, data) => callback(data));
    },
  },

  // Logs operations
  logs: {
    start: (options) => ipcRenderer.invoke('logs:start', options),
    stop: (data) => ipcRenderer.invoke('logs:stop', data),
    onData: (callback) => {
      ipcRenderer.on('logs:data', (event, data) => callback(data));
    },
    onError: (callback) => {
      ipcRenderer.on('logs:error', (event, data) => callback(data));
    },
    onExit: (callback) => {
      ipcRenderer.on('logs:exit', (event, data) => callback(data));
    },
  },
});
