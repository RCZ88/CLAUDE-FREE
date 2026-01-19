import Database from 'better-sqlite3';
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve path to the sqlite file
const dbPath = path.resolve(__dirname, "..", "..", "forestmind.sqlite");

// 1. Initialize the database connection (Synchronous)
// verbose: console.log prints every query to the terminal (good for debugging)
const db = new Database(dbPath, { verbose: console.log });

// 2. Set high-performance mode (WAL) immediately
db.pragma('journal_mode = WAL');

export function initDB() {
    // In better-sqlite3, queries run sequentially by default.
    // We do NOT need db.serialize().

    const tables = [
        `CREATE TABLE IF NOT EXISTS file_description (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL, 
            file_hash TEXT, 
            ai_summary TEXT,
            session_id TEXT,
            attachment_id INTEGER,
            UNIQUE(session_id, path, file_hash, attachment_id)
        )`,
        `CREATE TABLE IF NOT EXISTS vector_index (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT,
            chunk_index INTEGER,
            chunk_hash TEXT,
            embedding BLOB, 
            raw_content TEXT,
            session_id TEXT,
            attachment_id INTEGER,
            UNIQUE(file_path, chunk_index, session_id, attachment_id)
        )`,
        `CREATE TABLE IF NOT EXISTS code_map(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT NOT NULL,
            type TEXT NOT NULL,
            name TEXT NOT NULL,
            start_line INTEGER,
            end_line INTEGER,
            signature TEXT NOT NULL, 
            session_id TEXT,
            attachment_id INTEGER,
            UNIQUE(file_path, signature, session_id, attachment_id)
        )`,
        `CREATE TABLE IF NOT EXISTS attachment_path(
            id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            folder_path TEXT NOT NULL,
            session_id INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS agentic_flow (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            step_number INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT
        )`
    ];

    // Run all table creations
    tables.forEach(sql => db.prepare(sql).run());

    console.log("✅ Database tables initialized at:", dbPath);
}

/**
 * Helper to execute SELECT queries (returning rows)
 * Kept compatible with your previous code structure.
 */
export const query = (sql, params = []) => {
    try {
        // .all() returns an array of rows directly
        return db.prepare(sql).all(params);
    } catch (err) {
        console.error("SQL Error (query):", err);
        throw err;
    }
};

/**
 * Helper to execute INSERT/UPDATE/DELETE queries
 * Returns { id: lastInsertRowid, changes: rowsAffected }
 */
export const run = (sql, params = []) => {
    try {
        // .run() returns an object: { changes: number, lastInsertRowid: number | bigint }
        const result = db.prepare(sql).run(params);
        return {
            id: result.lastInsertRowid,
            changes: result.changes
        };
    } catch (err) {
        console.error("SQL Error (run):", err);
        throw err;
    }
};

// Initialize tables immediately on load (optional, but ensures DB is ready)
initDB();

export default db;