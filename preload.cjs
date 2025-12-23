// ✅ Correct: Only 'require' is allowed in .cjs files
const { contextBridge, ipcRenderer } = require('electron');

// This is the bridge. If this file has any syntax errors, 
// this code never runs, and window.electronAPI stays undefined.
contextBridge.exposeInMainWorld('electronAPI', {
    selectFolder: () => ipcRenderer.invoke('dialog:openDirectory')
});