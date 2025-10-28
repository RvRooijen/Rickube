# Rickube - Visual kubectl Electron App

A modern, dashboard-style Electron application for managing Kubernetes clusters using kubectl.

## Features

- **Visual Namespace List**: Browse all namespaces with pod counts
- **Pod Grid View**: See all pods in a namespace with status, ready state, and resource usage
- **Real-time Metrics**: Display CPU and memory usage (requires metrics-server)
- **Log Viewer**: Stream pod logs with pause/resume controls
- **Interactive Terminal**: Execute shell sessions in pods using xterm.js
- **Multi-cluster Support**: Switch between different kubectl contexts
- **Real-time Polling**: Auto-refresh namespaces, pods, and metrics

## Prerequisites

- **kubectl**: Must be installed in WSL and configured with access to at least one Kubernetes cluster
- **Node.js**: Version 16 or higher (installed on Windows)
- **WSL2** (on Windows): Required - kubectl commands are executed in WSL

## Installation

1. Open a **Windows** Command Prompt or PowerShell (NOT WSL)

2. Navigate to the project directory:
   ```cmd
   cd C:\Projects\Rickube
   ```

3. Install dependencies (if not done already):
   ```cmd
   npm install
   ```

## Running the App

**IMPORTANT**: Run the app from **Windows** (CMD/PowerShell), NOT from WSL.

Start the application:

```cmd
npm start
```

For verbose logging with DevTools:

```cmd
npm run dev
```

The app runs on Windows but executes all kubectl commands in your WSL environment, giving you the best of both worlds: stable GUI and access to your WSL kubectl configuration.

## Usage

1. **Select Context**: Use the context dropdown in the top bar to switch between different Kubernetes clusters
2. **Select Namespace**: Click on a namespace in the left sidebar to view its pods
3. **Select Pod**: Click on a pod card to view its details, logs, or open a terminal
4. **View Logs**: Switch to the Logs tab to stream pod logs (with pause/resume controls)
5. **Open Terminal**: Switch to the Terminal tab and click "New Terminal" to open a shell session in the pod

## Architecture

```
rickube/
├── main.js                 # Electron main process
├── preload.js             # IPC bridge
├── renderer/
│   ├── index.html         # Main UI
│   ├── app.js             # Main application logic
│   ├── components/        # UI components
│   │   ├── sidebar.js     # Namespace list
│   │   ├── podGrid.js     # Pod overview
│   │   ├── terminal.js    # Terminal component
│   │   ├── logs.js        # Log viewer
│   │   ├── metrics.js     # Metrics display
│   │   └── fileBrowser.js # File browser
│   └── styles/
│       └── main.css       # Dashboard styling
├── services/
│   ├── kubectl.js         # kubectl wrapper
│   ├── poller.js          # Polling service
│   └── kubeconfig.js      # Multi-cluster handler
└── package.json
```

## Technologies

- **Electron**: Cross-platform desktop application framework
- **Vanilla JavaScript**: ES6 modules, no frontend framework
- **xterm.js**: Terminal emulation in the browser
- **node-pty**: Pseudo-terminal support for interactive shells
- **kubectl**: Kubernetes command-line tool

## Polling Intervals

- Namespaces: Every 10 seconds
- Pods in active namespace: Every 3 seconds
- Metrics: Every 5 seconds
- Logs: Streaming with `-f` flag

## Troubleshooting

### kubectl not found in WSL
Make sure kubectl is installed in WSL and available in your PATH. Test from WSL:
```bash
kubectl version --client
```

From Windows, test the WSL connection:
```cmd
wsl kubectl version --client
```

### Metrics not available
Install metrics-server in your Kubernetes cluster:
```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

### App won't start
- Make sure you're running from **Windows** (not WSL)
- Ensure Node.js is installed on Windows
- Check that WSL2 is properly configured

## License

MIT
