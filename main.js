const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { autoUpdater } = require('electron-updater');

const execAsync = promisify(exec);

// Configure auto-updater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// Auto-updater event handlers
autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
  // Notify renderer process
  if (mainWindow) {
    mainWindow.webContents.send('update-available', info);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', info);
  }
});

autoUpdater.on('error', (err) => {
  console.error('Auto-updater error:', err);
});

let mainWindow;

// Create the main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#1e1e1e',
    title: 'Rickube - Visual kubectl',
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Open DevTools in development
  if (process.argv.includes('--enable-logging')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Check for updates when app is ready
app.whenReady().then(() => {
  createWindow();

  // Check for updates after 3 seconds (give time for window to load)
  setTimeout(() => {
    autoUpdater.checkForUpdates();
  }, 3000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers

// Execute kubectl command
ipcMain.handle('kubectl:exec', async (event, args) => {
  try {
    // Use bash -lc to ensure PATH is loaded properly in WSL
    const kubectlCmd = `kubectl ${args.join(' ')}`;
    const command = `wsl bash -lc "${kubectlCmd.replace(/"/g, '\\"')}"`;

    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    if (stderr && !stdout) {
      throw new Error(stderr);
    }

    return { success: true, data: stdout, error: stderr || null };
  } catch (error) {
    console.error('[kubectl:exec] Error:', error.message);
    return { success: false, data: null, error: error.message };
  }
});

// Get kubeconfig contexts
ipcMain.handle('kubectl:getContexts', async () => {
  try {
    const { stdout } = await execAsync('wsl bash -lc "kubectl config get-contexts -o json"');
    return { success: true, data: JSON.parse(stdout) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Switch kubectl context
ipcMain.handle('kubectl:useContext', async (event, contextName) => {
  try {
    await execAsync(`wsl bash -lc "kubectl config use-context ${contextName}"`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Stream logs
let logProcesses = new Map();

ipcMain.handle('logs:start', (event, { podName, namespace, logId }) => {
  try {
    const child = exec(`wsl bash -lc "kubectl logs ${podName} -n ${namespace} --tail=100 -f"`);

    logProcesses.set(logId, child);

    child.stdout.on('data', (data) => {
      mainWindow.webContents.send('logs:data', { logId, data });
    });

    child.stderr.on('data', (data) => {
      mainWindow.webContents.send('logs:error', { logId, data });
    });

    child.on('exit', () => {
      mainWindow.webContents.send('logs:exit', { logId });
      logProcesses.delete(logId);
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('logs:stop', (event, { logId }) => {
  const process = logProcesses.get(logId);
  if (process) {
    process.kill();
    logProcesses.delete(logId);
    return { success: true };
  }
  return { success: false, error: 'Log process not found' };
});

// Check if kubectl is available
ipcMain.handle('kubectl:check', async () => {
  try {
    await execAsync('wsl bash -lc "kubectl version --client"');
    return { success: true };
  } catch (error) {
    console.error('[kubectl:check] kubectl not available:', error.message);
    return { success: false, error: 'kubectl not found or not accessible in WSL' };
  }
});

// List directory in pod
ipcMain.handle('kubectl:listDirectory', async (event, { podName, namespace, path }) => {
  try {
    const command = `wsl bash -lc "kubectl exec ${podName} -n ${namespace} -- ls -la ${path}"`;
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024,
    });

    if (stderr && !stdout) {
      throw new Error(stderr);
    }

    return { success: true, data: stdout };
  } catch (error) {
    console.error('[kubectl:listDirectory] Error:', error.message);
    return { success: false, error: error.message };
  }
});

// Read file from pod
ipcMain.handle('kubectl:readFile', async (event, { podName, namespace, filePath }) => {
  try {
    const command = `wsl bash -lc "kubectl exec ${podName} -n ${namespace} -- cat ${filePath}"`;
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024,
    });

    if (stderr && !stdout) {
      throw new Error(stderr);
    }

    return { success: true, data: stdout };
  } catch (error) {
    console.error('[kubectl:readFile] Error:', error.message);
    return { success: false, error: error.message };
  }
});
