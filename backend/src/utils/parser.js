export const IGNORE_PATTERNS = (pathString) => {
    // Normalize path for Windows compatibility
    const p = pathString.replace(/\\/g, "/");

    return (
        // 1. Folders (The heavy stuff)
        p.includes("node_modules") ||
        p.includes("venv") ||
        p.includes("__pycache__") ||
        p.includes(".git") ||
        // 2. Databases (CRITICAL: prevents infinite loops)
        p.endsWith(".sqlite") ||
        p.includes(".sqlite-") || // Catches .sqlite-wal and .sqlite-shm
        p.endsWith(".db") || // Catches chat_history.db
        // 3. Binary Assets (The "unreadable" files)
        p.endsWith(".png") ||
        p.endsWith(".jpg") ||
        p.endsWith(".jpeg") ||
        p.endsWith(".ico") ||
        // 4. Config & Metadata (Non-code logic)
        p.endsWith(".json") ||
        p.endsWith(".txt") || // Ignores your SystemCore.txt, etc.
        p.includes(".env") ||
        p.endsWith(".gitignore") ||
        p.endsWith(".md")
    );
};
export function parseAction(aiResponse) {
    // This regex looks for ACTION, skips the pipe/PARAMS, and grabs the JSON
    const regex = /ACTION:\s*([A-Z_]+)\s*\|\s*PARAMS:\s*({.*)/i;

    const match = aiResponse.match(regex);

    if (match) {
        let jsonStr = match[2].trim();

        // FIX for Example 3: If the AI cut off the closing brace, add it back
        if (jsonStr.startsWith('{') && !jsonStr.endsWith('}')) {
            jsonStr += '}';
        }

        try {
            return {
                tool: match[1].trim().toLowerCase(),
                arg: JSON.parse(jsonStr), // Return a real object, not a string
            };
        } catch (e) {
            console.error("Found action, but JSON was malformed:", jsonStr);
            console.error("Error: ", e);
            return {
                tool: null,
                arg: null
            };
        }
    }
    return {
        tool: null,
        arg: null
    };
}
export function parseManagerResponse(response) {
    // 1. Extract STATUS
    const statusRegex = /STATUS:\s*(?:\[)?(CONTINUE|MISSION_COMPLETE)(?:\])?/i;
    const statusMatch = response.match(statusRegex);
    const status = statusMatch ? statusMatch[1].toUpperCase() : "CONTINUE";

    // 2. Extract THOUGHTS
    const thoughtsRegex = /THOUGHTS:\s*([\s\S]*?)(?=(?:TASK_LIST|TASKS):|$)/i;
    const thoughtsMatch = response.match(thoughtsRegex);
    const thoughts = thoughtsMatch ? thoughtsMatch[1].trim() : "Analysis provided.";

    // 3. Extract TASK_LIST (The Multi-Line Fix)
    const tasks = [];
    const taskSectionRegex = /(?:TASK_LIST|TASKS):\s*([\s\S]+)/i;
    const taskMatch = response.match(taskSectionRegex);

    if (taskMatch) {
        const rawList = taskMatch[1];

        // FIX: Split by numbers followed by a dot (e.g., "1.", "2.") 
        // using a positive lookahead so we don't lose the number.
        const taskBlocks = rawList.split(/\n\s*\d+\.\s+/);

        for (let block of taskBlocks) {
            block = block.trim();
            if (block.length > 10) {
                // We keep the whole block (ACTION, PATH, etc.) as one string
                tasks.push(block);
            }
        }
    }

    return {
        status: status,
        thoughts: thoughts,
        tasks: tasks.slice(0, 5), // Keep the top 5 multi-line tasks
    };
}