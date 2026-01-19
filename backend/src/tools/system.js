import fs from "fs";
import path from "node:path";
import { parseAction } from "../utils/parser.js";
import { getProjectSkeleton } from "../utils/formatting.js"

export async function handleAIAction(stringRes) {
    const { tool, arg } = parseAction(stringRes);
    if (!tool || !arg) {
        console.log("Fail to Parse Proccess AI's Request!");
        return;
    }
    switch (tool) {
        case "list_files":
            return await getProjectSkeleton(arg.path);

        case "read_file_range":
            // Fix: Return the actual result of the snippet
            return await getSnippet(
                arg.path,
                arg.start,
                arg.end
            );

        case "search_project":
            return await searchProject(arg.regex, arg.dirpath);

        default:
            return `Unknown tool: ${tool}`;
    }
}

export async function getSnippet(filePath, startLine, endLine) {
    console.log(`Retrieving Snippet from: ${filePath} (${startLine}-${endLine})`);

    try {
        // 1. Check if the path is provided and is a string
        if (!filePath || typeof filePath !== 'string') {
            return `ERROR: Invalid path provided. Received: ${filePath}`;
        }

        // 2. Check if path exists and is a file
        const stats = await fs.promises.stat(filePath);
        if (!stats.isFile()) {
            return `ERROR: Path is not a file: ${filePath}`;
        }

        // 3. Read content
        const content = await fs.promises.readFile(filePath, "utf-8");
        const lines = content.split(/\r?\n/); // Handle both Windows and Unix line endings
        const totalLines = lines.length;

        // 4. Validate Line Numbers
        const start = Math.max(1, parseInt(startLine) || 1);
        const end = Math.min(totalLines, parseInt(endLine) || totalLines);

        if (start > totalLines) {
            return `ERROR: Start line (${start}) exceeds file length (${totalLines}).`;
        }

        if (start > end) {
            return `ERROR: Start line (${start}) cannot be greater than end line (${end}).`;
        }

        // 5. Slice and return
        const snippet = lines.slice(start - 1, end).join("\n");

        return `FILE: ${filePath}\nLINES: ${start}-${end}\n---\n${snippet}`;

    } catch (error) {
        // Handle "File not found" (ENOENT) and other system errors
        if (error.code === 'ENOENT') {
            return `ERROR: File does not exist: ${filePath}`;
        }
        return `ERROR: Failed to read file: ${error.message}`;
    }
}

export async function searchProject(regex, dir = ".", results = [], limit = 50) {
    // 1. STOP EARLY: If we already hit the limit, don't even open the next folder
    if (results.length >= limit) return results;

    try {
        const files = await fs.promises.readdir(dir);
        const pattern = new RegExp(regex, "i");

        for (const file of files) {
            if (results.length >= limit) break; // Stop loop if limit reached

            const fullPath = path.join(dir, file);
            const stat = await fs.promises.stat(fullPath);

            if (stat.isDirectory()) {
                if (["node_modules", ".git", ".venv", "_pycache_", "dist", "build"].includes(file)) continue;
                await searchProject(regex, fullPath, results, limit);
            } else {
                // 2. FILE TYPE & SIZE FILTER: Don't read huge binaries or non-text files
                if (/\.(js|ts|py|html|css|json|md|txt)$/.test(file) && stat.size < 500000) {
                    const content = await fs.promises.readFile(fullPath, "utf8");
                    const lines = content.split(/\r?\n/);

                    for (let i = 0; i < lines.length; i++) {
                        if (pattern.test(lines[i])) {
                            results.push({
                                file: fullPath,
                                line: i + 1,
                                // 3. FIX: Only take the MATCHING line, trimmed to 200 chars max
                                content: lines[i].trim().substring(0, 200)
                            });
                        }
                        if (results.length >= limit) break;
                    }
                }
            }
        }
    } catch (e) {
        // Silently continue on permission errors or busy files
        console.error("Error: ", e);
    }

    // 4. Final Formatting: This ensures the output is a clean, short string
    if (dir === "." || dir.includes(":\\")) { // Only format at the root/initial call
        return results
            .map(res => `[MATCH] ${path.basename(res.file)}:${res.line} -> ${res.content}`)
            .join("\n") || "No matches found.";
    }

    return results;
}