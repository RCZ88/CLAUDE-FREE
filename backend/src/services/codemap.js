
import Python from "tree-sitter-python";
import TypeScript from "tree-sitter-typescript";
import HTML from "tree-sitter-html";
import CSS from "tree-sitter-css";
import Java from "tree-sitter-java";
import Parser from "tree-sitter";
import fs from "fs"; // Use the promise-based version
import path from "node:path";
import db from "../db/database.js"
import { processFileForVectors } from "../services/vectors.js"

export const Languages = {
    python: Python,
    java: Java,
    typescript: TypeScript.typescript, // Correctly accessing the .typescript property
    tsx: TypeScript.tsx, // Optional: for React typescript files
    html: HTML,
    css: CSS,
};

/**
 * The Extension Map
 * This handles the "Discovery" phase when you find a file on disk.
 */
export const languageMap = {
    ".py": Languages.python,
    ".java": Languages.java,
    ".ts": Languages.typescript,
    ".js": Languages.typescript, // TS parser is a superset of JS, works great for both
    ".html": Languages.html,
    ".htm": Languages.html,
    ".css": Languages.css,
    // '.xml': Languages.xml,
    // '.xaml': Languages.xml,      // XML parser works for XAML/SVG too
    // '.svg': Languages.xml
};

// "Regex for Code" - What are we looking for?
export const QueryMap = {
    typescript: `
    (method_definition name: (property_identifier) @name parameters: (formal_parameters) @params) @method
    (function_declaration name: (identifier) @name parameters: (formal_parameters) @params) @function
    (arrow_function parameters: (formal_parameters) @params) @function
    (variable_declarator name: (identifier) @name value: (arrow_function) @params) @variable
    (import_statement) @import
  `,

    python: `
    (function_definition name: (identifier) @name parameters: (parameters) @params) @function
    (class_definition name: (identifier) @name) @class
    (import_statement name: (dotted_name) @name) @import
    (import_from_statement module_name: (dotted_name) @name) @import
  `,

    // FIXED: Much simpler CSS query - just capture rule sets
    css: `
    (rule_set) @rule
  `,

    // FIXED: Simpler HTML query - just capture elements
    html: `
    (element) @element
  `,

    java: `
    (class_declaration name: (identifier) @name) @class
    (method_declaration name: (identifier) @name parameters: (formal_parameters) @params) @method
    (constructor_declaration name: (identifier) @name parameters: (formal_parameters) @params) @constructor
  `,
};

export async function handleFileChange(filePath, sessionId, attachmentId) {
    const parser = new Parser();
    const ext = path.extname(filePath);
    const langKey = languageMap[ext];

    if (!langKey) {
        console.log(`Skipping unsupported file type: ${ext}`);
        return; // Stop here before crashing
    }
    // Safer reverse lookup
    const languageString = Object.keys(Languages).find(
        (key) => Languages[key] === langKey
    );

    if (!languageString || !QueryMap[languageString]) {
        console.warn(`No query map found for language: ${languageString}`);
        return;
    }

    console.log(`\n\nPROCESSING FILE: ${filePath} (${languageString})\n`);

    console.log(`=====VECTOR_INDEX=====`);
    const chunks = await processFileForVectors(filePath);
    const insert = db.prepare(`
    INSERT INTO vector_index (file_path, chunk_index, chunk_hash, embedding, raw_content, session_id, attachment_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);

    const retrieve = db.prepare(`
    SELECT chunk_hash, chunk_index FROM vector_index 
    WHERE file_path = ? AND session_id = ? AND attachment_id = ?`);

    const updateRaw = db.prepare(`
    UPDATE vector_index SET raw_content = ?
    WHERE file_path = ? AND chunk_hash = ? AND session_id = ? AND attachment_id = ?`);

    const updateAll = db.prepare(`
    UPDATE vector_index SET raw_content = ?, chunk_hash = ?, embedding = ?
    WHERE file_path = ? AND chunk_index = ? AND session_id = ? AND attachment_id = ?`);

    const deletee = db.prepare(`
    DELETE FROM vector_index WHERE chunk_hash = ? AND chunk_index = ? AND session_id = ?`);

    let rows = retrieve.all(filePath, sessionId, attachmentId);
    const existingHashes = new Map(rows.map((r) => [r.chunk_hash, true]));
    const existingIndexes = new Map(rows.map((r) => [r.chunk_index, true]));

    let sameHashUpdate = 0;
    let sameIndexUpdate = 0;
    let newCommers = 0;
    let ghosts = 0;
    for (const chunk of chunks) {
        if (existingHashes.has(chunk.chunkHash)) {
            updateRaw.run(
                chunk.text,
                filePath,
                chunk.chunkHash,
                sessionId,
                attachmentId
            );
            rows = rows.filter((row) => {
                // We KEEP the row if it does NOT match both criteria
                return !(row.chunk_hash === chunk.chunkHash);
            });
            sameHashUpdate++;
        } else {
            if (existingIndexes.has(chunk.chunkIndex)) {
                updateAll.run(
                    chunk.text,
                    chunk.chunkHash,
                    JSON.stringify(chunk.vector),
                    filePath,
                    chunk.chunkIndex,
                    sessionId,
                    attachmentId
                );
                rows = rows.filter((row) => {
                    // We KEEP the row if it does NOT match both criteria
                    return !(row.chunk_index === chunk.chunkIndex);
                });
                sameIndexUpdate++;
            } else {
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
                    sessionId,
                    attachmentId
                );
                newCommers++;
            }
        }
    }
    ghosts = rows.length;
    for (const unused of rows) {
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
        const sourceCode = await fs.promises.readFile(filePath, "utf8");

        // CRITICAL FIX: Parser needs Buffer or string with proper encoding
        parser.setLanguage(langKey);

        console.log(`✓ Parser language set to: ${languageString}`);

        // FIX: Pass the source code directly as a string
        const tree = parser.parse(sourceCode);

        if (!tree || !tree.rootNode) {
            console.error(`❌ Failed to parse ${filePath} - no root node`);
            return;
        }

        console.log(
            `✓ Tree parsed successfully, root node type: ${tree.rootNode.type}`
        );

        // Create the query
        let query;
        try {
            query = new Parser.Query(langKey, QueryMap[languageString]);
        } catch (queryError) {
            console.error(
                `❌ Query creation failed for ${languageString}:`,
                queryError.message
            );
            return;
        }

        const matches = query.matches(tree.rootNode);

        console.log(`✓ Found ${matches.length} matches in ${filePath}`);

        if (matches.length === 0) {
            console.log(`⚠️ No symbols found in ${filePath}`);
        }

        // Prepare SQL statements
        const sInsert = db.prepare(`
      INSERT INTO code_map (file_path, type, name, start_line, end_line, signature, session_id, attachment_id) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

        const sUpdate = db.prepare(`
      UPDATE code_map SET start_line = ?, end_line = ? 
      WHERE file_path = ? AND signature = ? AND session_id = ? AND attachment_id = ?
    `);

        const sRetrieve = db.prepare(`
      SELECT signature FROM code_map 
      WHERE file_path = ? AND session_id = ? AND attachment_id = ?
    `);

        const sDelete = db.prepare(`
      DELETE FROM code_map 
      WHERE signature = ? AND file_path = ? AND session_id = ? AND attachment_id = ?
    `);

        // Get existing signatures
        const sRows = sRetrieve.all(filePath, sessionId, attachmentId);
        const sExistingSigs = new Map(sRows.map((r) => [r.signature, true]));

        let sStayers = 0,
            sNewcomers = 0,
            sGhosts = 0;

        // Process matches in a transaction
        const symbolSync = db.transaction((foundMatches) => {
            for (const match of foundMatches) {
                try {
                    let name, type, startLine, endLine, signature;

                    // Special handling for HTML and CSS
                    if (languageString === "html") {
                        // Find the element node
                        const elementNode = match.captures.find(
                            (c) => c.name === "element"
                        )?.node;
                        if (!elementNode) continue;

                        // Extract tag name from the element's start_tag
                        const startTag = elementNode.children.find(
                            (child) => child.type === "start_tag"
                        );
                        if (!startTag) continue;

                        const tagNode = startTag.children.find(
                            (child) => child.type === "tag_name"
                        );
                        if (!tagNode) continue;

                        name = tagNode.text;
                        type = "element";
                        startLine = elementNode.startPosition.row + 1;
                        endLine = elementNode.endPosition.row + 1;
                        signature = `${type}:${name}`;
                    } else if (languageString === "css") {
                        // Find the rule_set node
                        const ruleNode = match.captures.find(
                            (c) => c.name === "rule"
                        )?.node;
                        if (!ruleNode) continue;

                        // Extract selectors from the rule_set
                        const selectorsNode = ruleNode.children.find(
                            (child) => child.type === "selectors"
                        );
                        if (!selectorsNode) continue;

                        // Get the first selector's text (simplified)
                        const selectorText = selectorsNode.text
                            .trim()
                            .split("\n")[0]
                            .trim();

                        name =
                            selectorText.length > 50
                                ? selectorText.substring(0, 47) + "..."
                                : selectorText;
                        type = "rule";
                        startLine = ruleNode.startPosition.row + 1;
                        endLine = ruleNode.endPosition.row + 1;
                        signature = `${type}:${name}`;
                    } else {
                        // Handle TypeScript/Python/Java (your existing logic)
                        const nameNode = match.captures.find(
                            (c) => c.name === "name"
                        )?.node;
                        const typeCapture = match.captures.find(
                            (c) => c.name !== "name" && c.name !== "params"
                        );
                        const paramsNode = match.captures.find(
                            (c) => c.name === "params"
                        )?.node;

                        if (!nameNode || !typeCapture) continue;

                        name = nameNode.text;
                        type = typeCapture.name;
                        const typeNode = typeCapture.node;
                        startLine = typeNode.startPosition.row + 1;
                        endLine = typeNode.endPosition.row + 1;

                        const paramsText = paramsNode
                            ? paramsNode.text.replace(/[()\s]/g, "")
                            : "";

                        const isCallable = ["function", "method", "constructor"].includes(
                            type
                        );
                        signature = isCallable
                            ? `${type}:${name}(${paramsText})`
                            : `${type}:${name}`;
                    }

                    // Insert or update
                    if (sExistingSigs.has(signature)) {
                        if (sExistingSigs.get(signature) === true) {
                            sUpdate.run(
                                startLine,
                                endLine,
                                filePath,
                                signature,
                                sessionId,
                                attachmentId
                            );
                            sExistingSigs.set(signature, false);
                            sStayers++;
                        }
                    } else {
                        sInsert.run(
                            filePath,
                            type,
                            name,
                            startLine,
                            endLine,
                            signature,
                            sessionId,
                            attachmentId
                        );
                        sExistingSigs.set(signature, false);
                        sNewcomers++;
                    }
                } catch (matchError) {
                    console.error(`❌ Error processing match:`, matchError.message);
                }
            }

            // Delete ghosts
            for (const [sig, isGhost] of sExistingSigs) {
                if (isGhost) {
                    sDelete.run(sig, filePath, sessionId, attachmentId);
                    sGhosts++;
                }
            }
        });

        symbolSync(matches);

        console.log(`✅ Symbols Updated for ${path.basename(filePath)}:
      → Unchanged: ${sStayers}
      → New: ${sNewcomers}
      → Deleted: ${sGhosts}`);
    } catch (error) {
        console.error(`❌ Code Map Error for ${filePath}:`, error.message);
        console.error(error.stack);
    }
}

export function getCodeMappingOfFile(filepath, chatId) {
    const stmt = db.prepare(
        "SELECT type, signature FROM code_map WHERE file_path = ? AND session_id = ?"
    );
    const response = stmt.all(filepath, chatId);
    const formatted_map = response.map((row) => {
        return `
    - {
    Type: ${row.type}
    Signature: ${row.signature}
    }
    `;
    });
    if (formatted_map.length === 0) {
        return `No mappings found for: ${filepath}`;
    }
    const string = `Mappings from Path: ${filepath}: ${formatted_map.join("\n")}`;
    return string;
}

export function searchCodeMap(keywords) {
    if (!keywords || keywords.length == 0) {
        return [];
    }
    console.log(`Keywords: ${keywords}`);

    const whereClauses = keywords
        .map(() => `(name LIKE ? OR signature LIKE ?)`)
        .join(" OR ");

    const sql = `SELECT * FROM code_map WHERE ${whereClauses} LIMIT 20`;

    const params = keywords.flatMap((word) => [`%${word}%`, `%${word}%`]);

    try {
        const stmt = db.prepare(sql);

        const results = stmt.all(...params);
        return results;
    } catch (error) {
        console.log("SQL search Failed: ", error);
        return [];
    }
}
