const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const pty = require('node-pty');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

let mainWindow;
const terminals = new Map();

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
    // Clean up all terminals
    terminals.forEach((term) => term.kill());
    terminals.clear();
  });
}

app.whenReady().then(createWindow);

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

// Create a new terminal session
ipcMain.handle('terminal:create', (event, { podName, namespace, terminalId }) => {
  try {
    const shell = os.platform() === 'win32' ? 'cmd.exe' : 'bash';
    const args = os.platform() === 'win32'
      ? ['/c', `wsl bash -lc "kubectl exec -it ${podName} -n ${namespace} -- /bin/bash || kubectl exec -it ${podName} -n ${namespace} -- /bin/sh"`]
      : ['-c', `wsl bash -lc "kubectl exec -it ${podName} -n ${namespace} -- /bin/bash || kubectl exec -it ${podName} -n ${namespace} -- /bin/sh"`];

    const term = pty.spawn(shell, args, {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME || process.env.USERPROFILE,
      env: process.env,
    });

    terminals.set(terminalId, term);

    // Send data from terminal to renderer
    term.on('data', (data) => {
      mainWindow.webContents.send('terminal:data', { terminalId, data });
    });

    term.on('exit', () => {
      mainWindow.webContents.send('terminal:exit', { terminalId });
      terminals.delete(terminalId);
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Write to terminal
ipcMain.handle('terminal:write', (event, { terminalId, data }) => {
  const term = terminals.get(terminalId);
  if (term) {
    term.write(data);
    return { success: true };
  }
  return { success: false, error: 'Terminal not found' };
});

// Resize terminal
ipcMain.handle('terminal:resize', (event, { terminalId, cols, rows }) => {
  const term = terminals.get(terminalId);
  if (term) {
    term.resize(cols, rows);
    return { success: true };
  }
  return { success: false, error: 'Terminal not found' };
});

// Close terminal
ipcMain.handle('terminal:close', (event, { terminalId }) => {
  const term = terminals.get(terminalId);
  if (term) {
    term.kill();
    terminals.delete(terminalId);
    return { success: true };
  }
  return { success: false, error: 'Terminal not found' };
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
