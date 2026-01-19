// server.js
// import { processFileForVectors } from './indexer.js';
// 1. Core Logic (Note the mandatory .js extension for local files)


// 3. Third-party Libraries
import cors from "cors";
import express from "express";
import http from "http";
import chokidar from "chokidar";
import Parser from "tree-sitter";

import path from 'path';
import { fileURLToPath } from 'url';

import { Readable } from "node:stream";
import { Server } from "socket.io";

import { getProjectSkeleton, } from "./src/utils/formatting.js"
import { doAgentic } from "./src/agents/discovery.js";
import { Languages, languageMap, searchCodeMap } from "./src/services/codemap.js"
import { IGNORE_PATTERNS } from "./src/utils/parser.js";
import { attachWatchListeners, getFileCount } from "./src/services/watcher.js";
import { getSnippet } from "./src/tools/system.js";
import { getVectorContext } from "./src/services/vectors.js";
import db, { initDB } from "./src/db/database.js";
import { chat, loadSystemPrompt } from "./src/services/ai.js"
import { updateFeatureState } from "./src/routes/featureRoutes.js";
// import pkg from 'electron';
// const { app, BrowserWindow, ipcMain } = pkg;



const APP = express();

// Routes AFTER middleware
APP.get("/api/getAssets/:assetName", async (req, res) => {
  try {
    const { assetName } = req.params;
    console.log("Loading filename: ", assetName);
    const filePath = path.join(__dirname, '..', "assets", `${assetName}.png`);

    res.sendFile(filePath, (err) => {
      if (err) {
        console.error("File not found:", filePath);
        res.status(404).send("Asset not found");
      }
    });
  } catch (error) {
    res.status(500).send("Server Error: ", error);
  }
});

// Middleware FIRST
APP.use(cors());
APP.use(express.json({ limit: '50mb' }));
APP.use(express.urlencoded({ limit: '50mb', extended: true }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const frontendPath = path.join(__dirname, '..', 'frontend');
APP.use(express.static(frontendPath));



// Server creation LAST
const server = http.createServer(APP);
const PORT = process.env.PORT || 3000;

initDB();

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ['websocket', 'polling']
});

console.log("✅ Database Schema Initialized: vector_index table is ready.");

let watcher;

console.log(
  await getProjectSkeleton(
    "D:\\Users\\cleme\\Documents\\COMPUTAH SAYENCE\\CLAUDE FREE"
  )
);

// if (app) {

// } else {
//   console.error("Electron is not initialized. Are you running this with 'node' instead of 'electron'?");
// }

// This tells the server to STOP sending security instructions to the browser
APP.use((req, res, next) => {
  res.removeHeader("Content-Security-Policy");
  res.removeHeader("X-Content-Security-Policy");
  res.removeHeader("X-WebKit-CSP");
  next();
});

io.on("connection", (socket) => {
  console.log("User Connected!");

  socket.on("start_discovery", async (sessionId, prompt, codemap, semantic, model) => {
    try {
      // 1. Tell the frontend we started
      socket.emit("discovery_status", { message: "Starting Agentic Process..." });

      const result = await doAgentic(socket, sessionId, prompt, codemap, semantic, model);

      // 2. Send the final result back
      socket.emit("discovery_complete", {
        result: result,
        prompt: prompt
      });

    } catch (error) {
      console.error("Error whilst trying to doAgentic, error:", error);

      // 3. Inform the frontend of the failure
      socket.emit("discovery_error", {
        message: "Agent failed to complete discovery.",
        error: error.message
      });
    }
  });
});


// 4. THE HANDLER (Placeholder for now)


function testLanguageSetup() {
  const parser = new Parser();
  console.log("\n🔍 Testing Language Setup:");

  for (const [langName, langObj] of Object.entries(Languages)) {
    try {
      parser.setLanguage(langObj);
      console.log(`✓ ${langName}: OK`);
    } catch (err) {
      console.error(`✗ ${langName}: FAILED - ${err.message}`);
    }
  }

  console.log("\n📋 Language Map:");
  for (const [ext, lang] of Object.entries(languageMap)) {
    const name = Object.keys(Languages).find((key) => Languages[key] === lang);
    console.log(`  ${ext} → ${name}`);
  }
}

testLanguageSetup();



APP.post("/api/selectBranch", async (req, res) => {
  try {
    const { branchId } = req.body;
    if (branchId) {
      let stmt = db.prepare(
        "SELECT folder_path FROM attachment_path WHERE session_id = ?"
      );
      const response = stmt.all(branchId);
      const cleanedPaths = response.map((path) => path.folder_path);

      console.log("Paths for Session ID: ", branchId);

      if (watcher) {
        const previousWatcherDir = watcher.getWatched();
        console.log(
          "Closing Previous Session's Watcher for Directory: ",
          previousWatcherDir
        );
        await watcher.close();
      } else {
        console.log("Watcher was Previously Null. Setting up watcher");
      }
      if (cleanedPaths.length !== 0) {
        console.log(`Initializing Watcher for ${cleanedPaths.length} Paths...`);
        watcher = chokidar.watch(cleanedPaths, {
          ignored: IGNORE_PATTERNS,
          persistent: true,
          ignoreInitial: false,
          usePolling: true,
          interval: 100,
          awaitWriteFinish: {
            stabilityThreshold: 500, // Wait 500ms after save to ensure file is done writing
            pollInterval: 100,
          },
        });
        attachWatchListeners(db, watcher, branchId);
      } else {
        console.log("Path Length is 0.");
        return res.json({
          success: true,
          fileCount: 0,
          paths: []
        })
      }
      res.json({
        success: true,
        fileCount: getFileCount(),
        paths: cleanedPaths,
      });
    }
  } catch (error) {
    console.error(`Error Updating Watcher for Selected Branch: ${error}`);
    res.json({
      success: false,
      fileCount: -1,
      error: error,
      path: [],
    });
  }
});

APP.post("/api/addWatchList", async (req, res) => {
  try {
    const { folderPath, currentSession } = req.body;
    console.log(
      `Folder Path : ${folderPath}, Current Session: ${currentSession}`
    );
    if (folderPath) {
      let stmt = db.prepare(
        "INSERT OR IGNORE INTO attachment_path (folder_path, session_id) VALUES (?, ?)"
      );
      stmt.run(folderPath, currentSession);
      stmt = db.prepare(
        "UPDATE sessions SET has_attachment = 1 WHERE id = ? AND has_attachment = ?"
      );
      stmt.run(currentSession, 0);
      // const attachmentId = stmt.pluck().get(folderPath, currentSession);
      console.log(`Statement Ran Successfully!`);
      let state;
      if (!watcher) {
        state = "Initailized Watcher";
        watcher = chokidar.watch(folderPath, {
          ignored: IGNORE_PATTERNS,
          persistent: true,
          ignoreInitial: false,
          usePolling: true,
          interval: 100,
          awaitWriteFinish: {
            stabilityThreshold: 500, // Wait 500ms after save to ensure file is done writing
            pollInterval: 100,
          },
        });
        console.log("====== Files Uploaded from Directory: =======");
        attachWatchListeners(db, watcher, currentSession);
      } else {
        state = "Added new Directory";
        watcher.add(folderPath);
        // watcher.on("addDir", (path) =>
        //   console.log(`Added Dir Path (${path}) Successful!`)
        // );
        console.log("=====Files Added to an Exisitng Watcher");
      }

      res.json({
        success: true,
        fileCount: getFileCount(),
        state: state,
      });
    }
  } catch (error) {
    console.error("Error Adding Directory Path, Error: ", error);
    res.json({
      success: false,
      state: `Error: ${error}`,
      filesCount: -1,
    });
  }
});

APP.delete("/api/removeWatchList", async (req, res) => {
  try {
    const { path, sessionId } = req.body;
    console.log(`Removing Watchlist for:
            - Path: ${path}
            - Session Id: ${sessionId}`);
    const stmt = db.prepare(
      "DELETE FROM attachment_path WHERE folder_path = ? AND session_id = ?"
    );
    stmt.run(path, sessionId);
    watcher.unwatch(path);
    res.json({
      success: true,
      fileCount: getFileCount(),
    });
  } catch (error) {
    console.error("Error Removing Watch List: ", error);
    res.json({
      success: false,
      fileCount: -1,
    });
  }
});


APP.post("/api/streamChat", async (req, res) => {
  try {
    const { messages, model } = req.body;

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "ForestMind Local",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter Error:", errorText);
      return res.status(response.status).send(errorText);
    }

    // 2. THE FIX: Convert the Web Stream to a Node Stream before piping
    if (response.body) {
      Readable.fromWeb(response.body).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// function handleFileDeletion(filePath) {
//   console.log(`Deleting ${filePath} from Vector Index...`);
//   let stmt = db.prepare("DELETE FROM vector_index WHERE file_path = ?");
//   stmt.run(filePath);
//   console.log(`Deleting ${filePath} from Code Map...`);
//   stmt = db.prepare("DELETE FROM code_map WHERE file_path = ?");
//   stmt.run(filePath);
// }

APP.post("/api/searchCodeMap", async (req, res) => {
  try {
    const { keywords } = req.body;
    const matches = searchCodeMap(keywords);

    // 1. Map returns an array of Promises
    const chunkPromises = matches.map(async (row) => {
      const snippet = await getSnippet(
        row.file_path,
        row.start_line,
        row.end_line
      );
      return `
Chunk For -> Filepath: (${row.file_path}), Lines:(${row.start_line}-${row.end_line}):
==================== 
${snippet}`;
    });

    // 2. WAIT for all promises to resolve into actual strings
    const finalChunks = await Promise.all(chunkPromises);

    console.log("Retrieved Chunks String:");
    finalChunks.forEach((chunk) => {
      console.log(chunk);
    });

    res.json({
      success: true,
      answer: finalChunks,
    });
  } catch (error) {
    res.json({
      success: false,
      answer: error,
    });
  }
});

APP.post("/api/getSemantic", async (req, res) => {
  try {
    const { prompt, sessionId } = req.body; // Extract data sent from TypeScript

    console.log(`Received question: ${prompt}`);

    // --- CALL YOUR BACKEND LOGIC  HERE ---
    const answer = await getVectorContext(prompt, sessionId);

    const cleanedString = answer.map((chunk) => {
      return `
            Chunk for -> Filepath:(${chunk.file})
            =============
            ${chunk.content} `;
    });
    console.log("Semantic Strings Retrieved:");
    cleanedString.forEach((string) => {
      console.log(`${string}`);
    });
    // Send the result back to the frontend
    res.json({ success: true, answer: cleanedString });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


APP.post("/api/getSystemPrompt", async (req, res) => {
  try {
    const { fileName } = req.body;
    const prompt = await loadSystemPrompt(fileName);
    res.json({
      prompt: prompt
    });
  } catch (error) {
    console.error("Failed to read SystemCore.txt:", error);
    res.status(500).send("Error loading system prompt");
  }
})
APP.post("/api/updateFeatureState", async (req, res) => {
  const { featureId, enabled } = req.body;
  const response = await updateFeatureState(featureId, enabled);
  res.json(response);
});

APP.delete("/api/deleteMessage/:sessionId/:messageId", async (req, res) => {
  // Params from URL are always strings, so we cast to Number
  try {
    const messageId = parseInt(req.params.messageId);
    const sessionId = req.params.sessionId;

    const stmt = db.prepare("DELETE FROM messages WHERE id = ? AND session_id = ?");

    stmt.run(messageId, sessionId);
    res.json({
      success: true
    });
  } catch (error) {
    res.json({
      success: false,
      error: error
    });
  }

});

APP.post("/api/chat", async (req, res) => {
  // 1. backend calls AI
  const { messages, model, systemPrompt, history } = req.body;
  const start = performance.now();
  const aiMessage = await chat(messages, model, systemPrompt, history);
  const end = performance.now();
  const timeTaken = end - start;
  console.log(`Response to SystemPrompt file of ${systemPrompt}.txt:
        ${aiMessage}`);
  //adjust the typescript payload according to this parameters

  // aiMessage is: { role: "assistant", content: "['login', 'db']" }

  // 2. backend sends to frontend
  res.json({
    response: aiMessage,
    timeTaken: timeTaken.toFixed(4),
  });
});

console.log("Checking for script.js at:", path.join(frontendPath, 'script.js'));

APP.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});
// app.listen(3000, () => console.log('Server running on port 3000'));
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
