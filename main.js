import { app, BrowserWindow, shell, Menu, dialog } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { app as expressApp, createServer } from './server-lib.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow = null;
let serverInstance = null;

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'MindGraph',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    backgroundColor: '#f8f9fa',
    show: false,
  });

  const url = `http://localhost:${port}`;
  mainWindow.loadURL(url);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Application menu
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac ? [{
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Note',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu-action', 'new-note')
        },
        {
          label: 'Open Daily Note',
          click: () => mainWindow?.webContents.send('menu-action', 'daily-note')
        },
        { type: 'separator' },
        {
          label: 'Export Current Note',
          click: () => mainWindow?.webContents.send('menu-action', 'export')
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Knowledge Graph',
          accelerator: 'CmdOrCtrl+G',
          click: () => mainWindow?.webContents.send('menu-action', 'graph')
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About MindGraph',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About MindGraph',
              message: '🧠 MindGraph v1.0.0',
              detail: 'Personal Knowledge Management System\n\nBidirectional links • Knowledge Graph • AI-powered\n\nBuilt with Node.js, Express, SQLite (sql.js), D3.js, and Electron.',
            });
          }
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    const PORT = process.env.PORT || 3456;
    try {
      serverInstance = expressApp.listen(PORT, () => {
        const actualPort = serverInstance.address().port;
        console.log(`🧠 MindGraph server running on port ${actualPort}`);
        resolve(actualPort);
      });
      serverInstance.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          serverInstance = expressApp.listen(0, () => {
            const actualPort = serverInstance.address().port;
            console.log(`🧠 MindGraph server running on port ${actualPort} (fallback)`);
            resolve(actualPort);
          });
        } else {
          reject(err);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

// ========== App Lifecycle ==========

app.whenReady().then(async () => {
  try {
    // Initialize database first
    await createServer();
    const port = await startServer();
    createWindow(port);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(port);
      }
    });
  } catch (err) {
    console.error('Failed to start MindGraph:', err);
    dialog.showErrorBox('Startup Error', `Failed to start MindGraph:\n${err.message}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
  }
});
