import { contextBridge, ipcRenderer } from 'electron';

// Expose IPC to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Listen for menu actions from main process
  onMenuAction: (callback) => {
    ipcRenderer.on('menu-action', (event, action) => callback(action));
  },
  // Remove listener
  removeMenuActionListener: () => {
    ipcRenderer.removeAllListeners('menu-action');
  },
  // Platform info
  platform: process.platform,
});
