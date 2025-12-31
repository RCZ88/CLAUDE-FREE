import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url'; // Required for ESM path logic

// Logic: Manually define __dirname because "type": "module" is enabled
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


ipcMain.handle('dialog:openDirectory', async () => {
  try{
      const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory'],
    });
    
    if (canceled) {
        return null;
    } else {
        return filePaths[0]; // Returns the path string to the UI
    }
  }catch(e){
    console.error('Failed to open directory dialog:', e);
    // Return null so the frontend handles it gracefully as "no selection"
    return null;
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // Update the path to .cjs
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true, // Must be true for the bridge to work
      nodeIntegration: false  // Must be false for security
    }
  });

  win.loadFile('index.html');
}

// ... the rest of your ipcMain.handle code ...
app.whenReady().then(createWindow);