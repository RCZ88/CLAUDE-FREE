import { app, BrowserWindow, ipcMain } from 'electron';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { Server } from "socket.io";
import { initDB } from "./src/db/database.js";
import './server.js';
// ... Import your other services exactly as you had them in server.js ...

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendPath = path.join(__dirname, '..', 'frontend');

const APP = express();
const server = http.createServer(APP);
const io = new Server(server, { cors: { origin: "*" } });

// 1. Initialize DB and Middleware
initDB();
APP.use(cors());
APP.use(express.json({ limit: '50mb' }));
APP.use(express.static(frontendPath));

// 2. Combined API Routes (Copy-pasted from your server.js)
APP.post("/api/getSystemPrompt", (req, res) => {
  res.json({ prompt: "Your System Prompt Logic Here" });
});

// 3. Socket.io Logic
io.on("connection", (socket) => {

  console.log("Renderer Connected via Socket.io");
  // Add your discovery/agentic listeners here...
});

// 4. Window Management
function createWindow() {
  // This creates a file:// URL which Electron handles better than raw strings with spaces
  const preloadPath = fileURLToPath(new URL('preload.cjs', import.meta.url));

  console.log("📍 Attempting to load preload from:", preloadPath);

  const win = new BrowserWindow({
    width: 1200, height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,  // ← Changed back to true
      nodeIntegration: false,  // ← Keep false for security
      webSecurity: false       // ← This stays off for development
    }
  });
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://esm.sh http://localhost:3000; " +
          "script-src-elem 'self' 'unsafe-inline' 'unsafe-eval' https://esm.sh http://localhost:3000; " +
          "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; " +
          "style-src-elem 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; " +
          "font-src 'self' https://cdnjs.cloudflare.com data:; " +
          "img-src 'self' blob: data: http://localhost:3000; " +
          "connect-src 'self' https://esm.sh http://localhost:3000 http://127.0.0.1:8000 ws://localhost:3000 ws://127.0.0.1:3000;"
        ]
      }
    });
  });


  win.loadFile(path.join(__dirname, '../frontend/index.html'));
}



// 5. IPC Bridges
ipcMain.handle('select-folder', async () => {
  // Logic for folder picker here
  return "C:/Selected/Path";
});

// 6. START EVERYTHING ON ONE PORT
server.listen(3000, '127.0.0.1', () => {
  console.log("✅ Unified Server running at http://127.0.0.1:3000");
  app.whenReady().then(createWindow);
});