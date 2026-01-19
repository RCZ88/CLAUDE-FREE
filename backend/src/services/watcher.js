import { handleFileChange } from "./codemap.js";
import { updateCodeDescDB } from "../services/ai.js";
import { handleFileDeletion } from "../services/vectors.js";


export function attachWatchListeners(db, watcher, branchId) {
    let processingQueue = new Map();
    let debounceTimer = null;
    const DEBOUNCE_DELAY = 1000;

    // --- 1. THE DEBOUNCED HANDLER WITH DIAGNOSTICS ---
    const handleEvent = (path) => {
        // Add to queue
        processingQueue.set(path, Date.now());

        // Reset timer
        if (debounceTimer) clearTimeout(debounceTimer);

        // 🔍 DIAGNOSTIC: Log when we START waiting
        // console.time('debounce-wait'); 

        debounceTimer = setTimeout(async () => {
            // 🔍 DIAGNOSTIC: End the wait timer
            // console.timeEnd('debounce-wait');

            console.log(`🚀 Starting batch for ${processingQueue.size} files...`);

            // 🔍 DIAGNOSTIC: Capture Memory & CPU BEFORE processing
            const MEMORY_BEFORE = process.memoryUsage();
            const TIME_BEFORE = process.hrtime();

            // Run the actual work
            await processQueue();

            // 🔍 DIAGNOSTIC: Capture Memory & CPU AFTER processing
            const MEMORY_AFTER = process.memoryUsage();
            const TIME_AFTER = process.hrtime();

            // 🔍 DIAGNOSTIC: Calculate and Print Results
            const timeDiffMs = (TIME_AFTER[0] * 1e3 + TIME_AFTER[1] / 1e6) -
                (TIME_BEFORE[0] * 1e3 + TIME_BEFORE[1] / 1e6);

            const memoryDiffKb = (MEMORY_AFTER.heapUsed - MEMORY_BEFORE.heapUsed) / 1024;

            console.log(`📊 STATS: Batch took ${timeDiffMs.toFixed(2)}ms`);
            console.log(`📊 STATS: Memory change: ${memoryDiffKb.toFixed(2)} KB`);

        }, DEBOUNCE_DELAY);
    };

    // --- 2. THE QUEUE WORKER WITH TIMING ---
    const processQueue = async () => {
        // 🔍 DIAGNOSTIC: Start a stopwatch for the specific function
        console.time('process-queue-logic');

        const pathsToProcess = Array.from(processingQueue.keys());
        processingQueue.clear();

        for (const path of pathsToProcess) {
            try {
                // ... (Your existing logic to get ID and update DB) ...
                const attachmentId = getAttachmentIdForPath(db, path, branchId); // Ensure 'branchId' is available in scope or passed in
                if (attachmentId) {
                    await handleFileChange(path, branchId, attachmentId);
                    await updateCodeDescDB(branchId, path, attachmentId);
                }
            } catch (error) {
                console.error(`❌ Error on ${path}:`, error);
            }
        }

        // 🔍 DIAGNOSTIC: Stop the stopwatch
        console.timeEnd('process-queue-logic');
        console.log("✅ Batch complete.");
    };

    // --- 4. YOUR WATCHER SETUP (Same as before) ---
    watcher.on("add", handleEvent);
    watcher.on("change", handleEvent);
    watcher.on("unlink", (path) => { // Note: 'unlink' is the standard chokidar event for delete
        // You probably want to handle deletions immediately or add them to a separate queue
        handleFileDeletion(path);
    });
}

export function getFileCount(watcher) {
    if (watcher) {
        const watched = watcher.getWatched();
        return Object.values(watched).reduce(
            (total, files) => total + files.length,
            0
        );
    } else {
        return -1;
    }
}

export function getAttachmentIdForPath(db, filePath, sessionId) {
    // Find the attachment_path record where the folder_path is a prefix of our file path
    // We sort by length DESC to catch the most specific folder first (if folders are nested)
    const stmt = db.prepare(`
    SELECT id FROM attachment_path 
    WHERE session_id = ? 
    AND ? LIKE folder_path || '%'
    ORDER BY LENGTH(folder_path) DESC 
    LIMIT 1
  `);

    const result = stmt.get(sessionId, filePath);
    return result ? result.id : null;
}

export function listAttachments(db, sessionId) {
    const stmt = db.prepare(
        "SELECT folder_path FROM attachment_path WHERE session_id = ?"
    );
    const response = stmt.all(sessionId);
    const listOfPaths = response
        .map((row) => {
            return row.attachment_path;
        })

    return listOfPaths;
}