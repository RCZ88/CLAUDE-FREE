// server.js
// import { processFileForVectors } from './indexer.js';
// 1. Core Logic (Note the mandatory .js extension for local files)
import { processFileForVectors, generateEmbedding } from './indexer.js';

// 2. Environment Variables (The most efficient way in ESM)
import 'dotenv/config';
import multer from 'multer';
// 3. Third-party Libraries
import cors from 'cors';
import express from 'express';
import http from 'http';
import chokidar from 'chokidar';
import Database from 'better-sqlite3';

import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import TypeScript from 'tree-sitter-typescript';
import HTML from 'tree-sitter-html';
import CSS from 'tree-sitter-css';
import Java from 'tree-sitter-java';

// 4. Node.js Built-in Modules
import fs from 'node:fs/promises'; // Use the promise-based version
import path from 'node:path';       // Modern prefix
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { WebSocketServer } from 'ws';
// ✅ CORRECT IMPORT
import { pipeline, env } from '@xenova/transformers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = path.join(import.meta.dirname, 'forestmind.sqlite');
const db = new Database(dbPath, {
    timeout:20000,
    verbose:console.log
});

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Create a table to store "Where things are"
db.exec(`
  CREATE TABLE IF NOT EXISTS code_map(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    start_line INTEGER,
    end_line INTEGER,
    signature TEXT NOT NULL,
    UNIQUE(file_path, signature)
)
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS vector_index (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT,
    chunk_index INTEGER, -- e.g., 0 for lines 1-50, 1 for lines 41-90
    chunk_hash TEXT,    -- The fingerprint of those 50 lines
    embedding BLOB,
    raw_content TEXT,
    UNIQUE(file_path, chunk_index) -- Prevents duplicate data points for the same text
);
`);

console.log("✅ Database Schema Initialized: vector_index table is ready.");

// const loadLang = (pkgName) => {
//     try {
//         const langModule = require(pkgName);
//         return langModule.typescript || langModule.python || langModule; 
//     } catch (err) {
//         console.warn(`⚠️  Warning: Could not load language ${pkgName}`);
//         return null;
//     }
// };

const Languages = {
    'python': Python,
    'java': Java,
    'typescript': TypeScript.typescript, // Correctly accessing the .typescript property
    'tsx': TypeScript.tsx,               // Optional: for React typescript files
    'html': HTML,
    'css': CSS
};

/**
 * The Extension Map
 * This handles the "Discovery" phase when you find a file on disk.
 */
const languageMap = {
    '.py': Languages.python,
    '.java': Languages.java,
    '.ts': Languages.typescript,
    '.js': Languages.typescript, // TS parser is a superset of JS, works great for both
    '.html': Languages.html,
    '.htm': Languages.html,
    '.css': Languages.css,
    // '.xml': Languages.xml,
    // '.xaml': Languages.xml,      // XML parser works for XAML/SVG too
    // '.svg': Languages.xml
};

// "Regex for Code" - What are we looking for?
const QueryMap = {
    'typescript': `
        (method_definition 
            name: (property_identifier) @name
            parameters: (formal_parameters) @params
        ) @method
        (function_declaration 
            name: (identifier) @name
            parameters: (formal_parameters) @params
        ) @function
    `,
    'python': `
        (function_definition 
            name: (identifier) @name
            parameters: (parameters) @params
        ) @function
    `,
    'java': `
        (method_declaration 
            name: (identifier) @name
            parameters: (formal_parameters) @params
        ) @method
    `,
    'html': `
        (element (start_tag (tag_name) @name)) @element
        (attribute (attribute_name) @attr_name (quoted_attribute_value) @name) 
    `,
    'css': `
        (class_selector (class_name) @name) @class
        (id_selector (id_name) @name) @id
        (tag_name) @tag
    `,
    'xml': `
        (element (start_tag name: (tag_name) @name)) @tag
        (attribute name: (attribute_name) @attr_name value: (quoted_attribute_value) @name)
    `
};

const parser = new Parser();

console.log("1. Initial Node.js")

const IGNORE_PATTERNS = (pathString) => {
    // Normalize path for Windows compatibility
    const p = pathString.replace(/\\/g, '/');

    return (
        // 1. Folders (The heavy stuff)
        p.includes('node_modules') || 
        p.includes('venv') || 
        p.includes('__pycache__') ||
        p.includes('.git') ||

        // 2. Databases (CRITICAL: prevents infinite loops)
        p.endsWith('.sqlite') || 
        p.includes('.sqlite-') || // Catches .sqlite-wal and .sqlite-shm
        p.endsWith('.db') ||      // Catches chat_history.db

        // 3. Binary Assets (The "unreadable" files)
        p.endsWith('.png') || 
        p.endsWith('.jpg') || 
        p.endsWith('.jpeg') || 
        p.endsWith('.ico') ||

        // 4. Config & Metadata (Non-code logic)
        p.endsWith('.json') || 
        p.endsWith('.txt') ||     // Ignores your SystemCore.txt, etc.
        p.includes('.env') ||
        p.endsWith('.gitignore') ||
        p.endsWith('.md')
    );
};
console.log("2. Set Variables")

let  watcher;

console.log("3. Watcher Initialized!")




// 4. THE HANDLER (Placeholder for now)
async function handleFileChange(filePath, sessionId) {

    const ext = path.extname(filePath);
    const langKey = languageMap[ext];

    if (!langKey) {
        console.log(`Skipping unsupported file type: ${ext}`);
        return; // Stop here before crashing
    }
    // Safer reverse lookup
    const languageString = Object.keys(Languages).find(key => Languages[key] === langKey);

    if (!languageString || !QueryMap[languageString]) {
        console.warn(`No query map found for language: ${languageString}`);
        return;
    }

    console.log(`\n\nPROCESSING FILE: ${filePath} (${languageString})\n`)

    console.log(`=====VECTOR_INDEX=====`)
    const chunks = await processFileForVectors(filePath);
    const insert = db.prepare(`
        INSERT INTO vector_index (file_path, chunk_index, chunk_hash, embedding, raw_content, session_id)
        VALUES (?, ?, ?, ?, ?, ?)`);
    const retrieve = db.prepare(`
        SELECT chunk_hash, chunk_index FROM vector_index 
        WHERE file_path = ? AND session_id = ?`);
    const updateRaw = db.prepare(`
        UPDATE vector_index SET raw_content = ?
        WHERE file_path = ? AND chunk_hash = ? AND session_id = ?`);
    const updateAll = db.prepare(`
        UPDATE vector_index SET raw_content = ?, chunk_hash = ?, embedding = ?
        WHERE file_path = ? AND chunk_index = ? AND session_id = ?`)
    const deletee = db.prepare(`
        DELETE FROM vector_index 
        WHERE chunk_hash = ? AND file_path = ? AND session_id = ?`);
    
    let rows = retrieve.all(filePath, sessionId);
    const existingHashes = new Map(rows.map(r => [r.chunk_hash, true]));
    const existingIndexes = new Map(rows.map(r =>[r.chunk_index, true]));
    
    let sameHashUpdate = 0
    let sameIndexUpdate = 0;
    let newCommers = 0;
    let ghosts = 0;
    for(const chunk of chunks){
        if(existingHashes.has(chunk.chunkHash)){
            updateRaw.run(chunk.text, filePath, chunk.chunkHash, sessionId);
            rows = rows.filter(row => {
                // We KEEP the row if it does NOT match both criteria
                return !(row.chunk_hash === chunk.chunkHash);
            });
            sameHashUpdate++;
        }else{
            if(existingIndexes.has(chunk.chunkIndex)){
                updateAll.run(chunk.text, chunk.chunkHash, JSON.stringify(chunk.vector), filePath, chunk.chunkIndex, sessionId);
                rows = rows.filter(row => {
                    // We KEEP the row if it does NOT match both criteria
                    return !(row.chunk_index === chunk.chunkIndex);
                });
                sameIndexUpdate++;
            }else{
                /*
                const insert = db.prepare(`
        INSERT INTO vector_index (file_path, chunk_index, chunk_hash, embedding, raw_content, session_id)
        VALUES (?, ?, ?, ?, ?, ?)`);
                */
                insert.run(
                    chunk.filePath,
                    chunk.chunkIndex,
                    chunk.chunkHash,
                    JSON.stringify(chunk.vector),
                    chunk.text,
                    sessionId
                );
                newCommers++;
            }
            
        }
    }
    ghosts = rows.length;
    for(const unused of rows){
        deletee.run(unused.chunk_hash, unused.chunk_index, sessionId);
    }

    console.log(`Chunks Updated:
    -> Same Hash (Update Content): ${sameHashUpdate}
    -> Same Index (Update All except Index & Filepath): ${sameIndexUpdate};
    -> Brand New Chunks (Just Added): ${newCommers}
    -> Removed Chunks (Unused): ${ghosts}`);

    

    // If we don't speak this language, ignore it
    if (!langKey) return;

    console.log(`\n===== CODE MAP =====`);
    try {
        const sourceCode = await fs.readFile(filePath, 'utf8');
        parser.setLanguage(langKey);
        const tree = parser.parse(sourceCode);
        const query = new Parser.Query(langKey, QueryMap[languageString]);
        const matches = query.matches(tree.rootNode);

        // Prepare Symbols Statements
        const sInsert = db.prepare(`INSERT INTO code_map (file_path, type, name, start_line, end_line, signature, session_id) VALUES (?, ?, ?, ?, ?, ?, ?)`);
        const sUpdate = db.prepare(`UPDATE code_map SET start_line = ?, end_line = ? WHERE file_path = ? AND signature = ? AND session_id = ?`);
        const sRetrieve = db.prepare(`SELECT signature FROM code_map WHERE file_path = ? AND session_id = ?`);
        const sDelete = db.prepare(`DELETE FROM code_map WHERE signature = ? AND file_path = ? AND session_id = ?`);

        // Get existing signatures for Ghost hunting
        const sRows = sRetrieve.all(filePath, sessionId);
        const sExistingSigs = new Map(sRows.map(r => [r.signature, true]));

        let sStayers = 0, sNewcomers = 0, sGhosts = 0;

        // Transaction for speed
        const symbolSync = db.transaction((foundMatches) => {
            for (const match of foundMatches) {
                // Extracting Nodes from Tree-sitter Capture
                const nameNode = match.captures.find(c => c.name === 'name')?.node;
                const typeCapture = match.captures.find(c => c.name !== 'name' && c.name !== 'params');
                const paramsNode = match.captures.find(c => c.name === 'params')?.node;

                if (!nameNode || !typeCapture) continue;

                const name = nameNode.text;
                const type = typeCapture.name; // e.g. "function", "class"
                const typeNode = typeCapture.node; // The whole block

                const startLine = typeNode.startPosition.row + 1;
                const endLine = typeNode.endPosition.row + 1;
                
                // Clean params for the signature
                const paramsText = paramsNode ? paramsNode.text.replace(/[\(\)\s]/g, '') : "";
                const signature = `${type}:${name}(${paramsText})`;

                if (sExistingSigs.has(signature)) {
                    sUpdate.run(startLine, endLine, filePath, signature, sessionId);
                    sExistingSigs.delete(signature);
                    sStayers++;
                } else {
                    sInsert.run(filePath, type, name, startLine, endLine, signature, sessionId);
                    sNewcomers++;
                }
            }
            
            sGhosts = sExistingSigs.size;
            for (const [ghostSig] of sExistingSigs) {
                sDelete.run(ghostSig, filePath, sessionId);
            }
        });

        symbolSync(matches);

        console.log(`   Symbols Updated:
        -> Unchanged Symbols: ${sStayers}
        -> New Symbols: ${sNewcomers}
        -> Deleted Symbols: ${sGhosts}`);

    } catch (error) {
        console.error("   ❌ Code Map Error:", error.message);
    }
    
}

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// app.post('/api/addFile', async (req, res)=>{
//     try{
//         const file
//     }
// })
app.post('/api/selectBranch',  async (req, res)=> {
    try{
        const {branchId} = req.body;
        if(branchId){
            let stmt = db.prepare("SELECT folder_path FROM attachment_path WHERE session_id = ?");
            const response = stmt.all(branchId);
            const cleanedPaths = response.map((path) => path.folder_path);                         
            console.log('Paths for Session ID: ', branchId);
            for(let i = 0; i<cleanedPaths.length; i++){
                console.log(`${cleanedPaths[i]}`);
            }
            if(watcher){
                const previousWatcherDir = watcher.getWatched();
                console.log("Closing Previous Session's Watcher for Directory: ", previousWatcherDir);
                await watcher.close();
            }else{
                console.log("Watcher was Previously Null. Setting up watcher");
            }
            if(cleanedPaths.length !== 0){
                console.log(`Initializing Watcher for ${cleanedPaths.length} Paths...`)
                watcher = chokidar.watch(cleanedPaths, {
                    ignored: IGNORE_PATTERNS,
                    persistent: true,
                    ignoreInitial: false,
                    usePolling: true, 
                    interval: 100,
                    awaitWriteFinish:{
                        stabilityThreshold: 500, // Wait 500ms after save to ensure file is done writing
                        pollInterval: 100
                    }
                });
                attachWatchListeners(branchId);
            }else{
                console.log('Path Length is 0.')
            }
            res.json({
                success:true,
                fileCount:getFileCount(),
                paths:cleanedPaths
            });
        }
    }catch(error){
        console.error(`Error Updating Watcher for Selected Branch: ${error}`);
        res.json({
            success:false,
            fileCount:-1,
            error: error,
            path:[]
        });
    }
});

app.post('/api/addWatchList', async (req, res) => {
    try{
        const {folderPath, currentSession}= req.body;
        console.log(`Folder Path : ${folderPath}, Current Session: ${currentSession}`)
        if(folderPath){
            let stmt = db.prepare('INSERT OR IGNORE INTO attachment_path (folder_path, session_id) VALUES (?, ?)');
            stmt.run(folderPath, currentSession);
            stmt = db.prepare('SELECT id FROM attachment_path WHERE folder_path = ? AND session_id = ?')
            const folderId = stmt.pluck().get(folderPath, currentSession);
            console.log(`Statement Ran Successfully!`)
            let state;
            if(!watcher){
                state = 'Initailized Watcher';
                watcher = chokidar.watch(folderPath, {
                    ignored: IGNORE_PATTERNS,
                    persistent: true,
                    ignoreInitial: false,
                    usePolling: true, 
                    interval: 100,
                    awaitWriteFinish:{
                        stabilityThreshold: 500, // Wait 500ms after save to ensure file is done writing
                        pollInterval: 100
                    }
                });
                console.log("====== Files Uploaded from Directory: =======")
                attachWatchListeners(currentSession); 
            }else{
                state = 'Added new Directory';
                watcher.add(folderPath);
                watcher.on('addDir', (path)=> console.log(`Added Dir Path (${path}) Successful!`));
            }
            
            res.json({
                success:true,
                fileCount:getFileCount(),
                state: state
            });
        }
    }catch(error){
        console.error("Error Adding Directory Path, Error: ", error);
        res.json({
            success:false,
            state: `Error: ${error}`,
            filesCount: -1
        });
    }
    
});

function getFileCount(){
    if(watcher){
        const watched = watcher.getWatched();
        return Object.values(watched).reduce((total, files) => total + files.length, 0);
    }else{
        return -1;
    } 
}

function attachWatchListeners(branchId){
    watcher.on('add', (path)=>{
        handleFileChange(path, branchId);
        console.log(`- ${path}`);
    });
    watcher.on('change', (path) => {
        handleFileChange(path, branchId);
    });
    watcher.on('detach', (path)=>{
        handleFileDeletion(path);
    });
}

app.delete('/api/removeWatchList', async (req, res)=>{
    try{
        const {path, sessionId} = req.body;
        console.log(`Removing Watchlist for:
            - Path: ${path}
            - Session Id: ${sessionId}`)
        const stmt = db.prepare('DELETE FROM attachment_path WHERE folder_path = ? AND session_id = ?');
        stmt.run(path, sessionId);
        watcher.unwatch(path);
        res.json({
            success:true,
            fileCount:getFileCount()
        });
    }catch(error){
        console.error("Error Removing Watch List: ", error);
        res.json({
            success:false,
            fileCount:-1
        });
    }
});

app.post('/api/streamChat', async (req, res) => {
    try {
        const { messages, model } = req.body;

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "ForestMind Local",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                stream: true 
            })
        });

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

function handleFileDeletion(filePath){
    console.log(`Deleting ${filePath} from Vector Index...`);
    let stmt = db.prepare('DELETE FROM vector_index WHERE file_path = ?');
    stmt.run(filePath);
    console.log(`Deleting ${filePath} from Code Map...`);
    stmt = db.prepare('DELETE FROM code_map WHERE file_path = ?');
    stmt.run(filePath);
}

async function loadSytemPrompt(fileName) {
    const filePath = path.join(__dirname, 'prompts', `${fileName}.txt`);
    return await fs.readFile(filePath, 'utf-8');
}

function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function getVectorContext(userQuery, sessionId, limit=3){
    const queryVector = await generateEmbedding(userQuery);

    const allRows = db.prepare('SELECT file_path, raw_content, embedding FROM vector_index WHERE session_id = ?').all(sessionId);

    const results = allRows.map(row=>{
        const rowVector = JSON.parse(row.embedding);
        return{
            file: row.file_path,
            content: row.raw_content,
            score: cosineSimilarity(queryVector, rowVector)
        };
    });

    return results.sort((a,b) =>b.score - a.score).slice(0, limit);
}

async function chat(userPrompt, model, systemPromptFileName){
    
    const systemTxt = await loadSytemPrompt(systemPromptFileName);

    const systemPrompt = {
        'role': 'system',
        'content': systemTxt
    }

    const payload = [systemPrompt, userPrompt];

    let response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method:"POST",
        headers: {
                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "ForestMind Local",
                "Content-Type": "application/json"
            },
        body: JSON.stringify({
            model: model,
            messages: payload,
            stream: false
        })
    });
    const result = await response.json();
    return result.choices[0].message.content;
}

function serachCodeMap(keywords){
    if(!keywords || keywords.length== 0){
        return [];
    }

    const whereClauses = keywords.map(()=> `(name LIKE ? OR signature LIKE ?)`).join(' OR ')

    const sql = `SELECT * FROM code_map WHERE ${whereClauses} LIMIT 20`;
    
    const params = keywords.flatMap(word => [`%${word}`, `%${word}`]);

    try{
        const stmt = db.prepare(sql);

        const results = stmt.all(...params);
        return results;
    }catch(error){
        console.log('SQL search Failed: ', error);
        return[]
    }

}

async function getSnippet(filePath, startLine, endLine) {
    console.log(`Retrieving Snippet from:
        Filepath: ${filePath}
        Line: ${startLine} - ${endLine}`)
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    // Slice the array to get exactly the lines we need
    // (Line numbers are usually 1-indexed, arrays are 0-indexed)
    return lines.slice(startLine - 1, endLine).join('\n');
}

app.post('/api/searchCodeMap', async (req, res) =>{
    try{
        const {keywords} = req.body;
        const matches = serachCodeMap(keywords);
        
        const chunks = matches.map(async (row) => {
            return `
            Chunk For -> Filepath: (${row.file_path}), Lines:(${row.start_line}-${row.end_line}):
            ==================== 
            ${await getSnippet(row.file_path, row.start_line, row.end_line)}`;
        });
        console.log("Retrieved Chunks String:")
        chunks.forEach((chunk)=>{
            console.log(chunk)
        });

        res.json({
            success:true,
            answer:chunks
        });

    }catch(error){
        res.json({
            success:false,
            answer:error
        })
    }
    
});

app.post('/api/getSemantic', async (req, res) => {
    try {
        const {prompt, sessionId} = req.body; // Extract data sent from TypeScript
        
        console.log(`Received question: ${prompt}`);

        // --- CALL YOUR BACKEND LOGIC  HERE ---
        const answer = await getVectorContext(prompt, sessionId);
    

        const cleanedString = answer.map(chunk =>{
            return`
            Chunk for -> Filepath:(${chunk.file})
            =============
            ${chunk.content} `
        })
        console.log('Semantic Strings Retrieved:');
        cleanedString.forEach((string)=>{
            console.log(`${string}`)
        })
        // Send the result back to the frontend
        res.json({ success: true, answer: cleanedString });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
app.post('/api/chat', async (req, res) => {
    // 1. backend calls AI
    const {messages, model, systemPrompt} = req.body;
    const start = performance.now();
    const aiMessage = await chat(messages, model, systemPrompt);
    const end = performance.now();
    const timeTaken = end-start;
    console.log(`Response to SystemPrompt file of ${systemPrompt}.txt:
        ${aiMessage}`)
    //adjust the typescript payload according to this parameters

    // aiMessage is: { role: "assistant", content: "['login', 'db']" }

    // 2. backend sends to frontend
    res.json({
        response: aiMessage,
        timeTaken:timeTaken.toFixed(4)
    }); 
});



// app.listen(3000, () => console.log('Server running on port 3000'));
server.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
})