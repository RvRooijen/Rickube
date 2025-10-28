# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rickube is een Electron desktop applicatie voor het visueel beheren van Kubernetes clusters via kubectl. Het draait op Windows maar executes alle kubectl commands in WSL2, waardoor het de beste van beide werelden combineert.

## Development Commands

**Run the application:**
```bash
npm start              # Start Electron app
npm run dev           # Start with DevTools en verbose logging
```

**BELANGRIJK:** Run altijd vanuit Windows (CMD/PowerShell), NOOIT vanuit WSL. De app draait op Windows en roept kubectl aan via `wsl bash -lc` commands.

## Architecture

### Electron Process Model

**Main Process** (`main.js`):
- Beheert het Electron window en IPC handlers
- Executes alle kubectl commands via `wsl bash -lc "kubectl ..."`
- Beheert terminal sessions met node-pty
- Beheert log streaming processes
- Alle kubectl commands worden uitgevoerd met 10MB buffer voor grote outputs

**Renderer Process** (`renderer/`):
- Vanilla JavaScript met ES6 modules, geen frontend framework
- Component-based architectuur met services layer
- Real-time polling voor namespace/pod updates
- xterm.js voor terminal emulatie

### Key Services

**KubectlService** (`services/kubectl.js`):
- Wrapper rond kubectl IPC calls naar main process
- Parsed JSON output van kubectl commands
- Handled metrics parsing (kubectl top)
- Handled directory listings en file reading van pods

**PollerService** (`services/poller.js`):
- Centraal polling mechanisme voor real-time updates
- Polling intervals:
  - Namespaces pod counts: 10 seconden
  - Pods in active namespace: 3 seconden
  - Metrics: 5 seconden
- Gebruikt key-based system om pollers te managen

**KubeconfigService** (`services/kubeconfig.js`):
- Multi-cluster context management
- Context switching met automatische reload van data

### Components

Alle components in `renderer/components/`:
- **Sidebar**: Namespace lijst met pod counts en permissions checking
- **PodGrid**: Grid view van pods met status badges en metrics
- **Terminal**: xterm.js terminal met multiple tabs support
- **Logs**: Log streaming met pause/resume/download functionaliteit
- **Metrics**: Pod metrics display (vereist metrics-server in cluster)
- **FileBrowser**: Directory browser voor pod filesystems met file preview

### IPC Communication Pattern

Main process IPC handlers volgen consistent pattern:
```javascript
ipcMain.handle('prefix:action', async (event, params) => {
  try {
    // Execute command
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

Prefixes:
- `kubectl:*` - kubectl command execution
- `terminal:*` - terminal session management
- `logs:*` - log streaming

### WSL Integration

Alle shell commands gebruiken `wsl bash -lc` om:
1. Login shells te forceren (PATH loaded correctly)
2. kubectl config uit WSL environment te gebruiken
3. Quotes correct te escapen: `"kubectl ...".replace(/"/g, '\\"')`

### State Management

App state wordt bijgehouden in `RickubeApp` class:
- `currentNamespace` - Geselecteerde namespace
- `currentPod` - Geselecteerde pod
- `currentPodData` - Volledige pod JSON data
- `selectedTab` - Active tab (details/logs/terminal/files)

State flow: namespace select → pod select → tab switch triggert data loading

### Panel Resize System

Three-panel layout (sidebar | pod grid | details) met draggable resize handles:
- Resize handle 1: tussen sidebar en pod grid
- Resize handle 2: tussen pod grid en right panel
- Min/max width constraints (10-40% voor sidebar, 15-50% voor right panel)

## Dependencies

Core dependencies:
- **electron**: ^38.4.0 - Desktop app framework
- **node-pty**: ^1.0.0 - PTY support voor interactive terminals
- **@xterm/xterm**: ^5.5.0 - Terminal UI component
- **@xterm/addon-fit**: ^0.10.0 - Terminal resize addon

Na nieuwe native dependencies: `npx electron-rebuild`

## Common Issues

**kubectl commands falen:**
- Verificaties: `wsl kubectl version --client`
- Zorg dat kubectl in WSL PATH staat
- Check dat kubeconfig correct geconfigureerd is in WSL

**Metrics niet beschikbaar:**
- Installeer metrics-server in cluster
- App handled gracefully met empty arrays als metrics niet beschikbaar zijn

**Terminal/logs werken niet:**
- Check dat node-pty correct gerebuild is voor Electron versie
- Rebuild met: `npx electron-rebuild`
