import fs from "fs";
import path from "node:path";

export async function getProjectSkeleton(dirPath) {
    // FIX 1: Safety check. If dirPath is missing or null, default to current directory "."
    const rootPath = dirPath || ".";

    async function buildTree(currentPath, depth = 0) {
        const EXCLUDE = [
            "node_modules", ".git", "dist", ".DS_Store",
            ".venv", ".env", "__pycache__", ".vscode"
        ];

        // FIX 2: Check if currentPath is valid before calling lstat
        if (!currentPath) return null;

        const stats = await fs.promises.lstat(currentPath);
        const node = {
            name: path.basename(currentPath) || currentPath,
            type: stats.isDirectory() ? "folder" : "file",
            children: [],
        };

        // Depth limit to prevent crashing on massive projects
        if (stats.isDirectory() && depth < 3) {
            const files = await fs.promises.readdir(currentPath);
            for (const file of files) {
                if (EXCLUDE.includes(file)) continue;

                const childNode = await buildTree(path.join(currentPath, file), depth + 1);
                if (childNode) node.children.push(childNode);
            }
        }
        return node;
    }

    function formatTree(node, prefix = "", isLast = true, isRoot = true) {
        if (!node) return "";

        const connector = isRoot ? "" : (isLast ? "└── " : "├── ");
        let result = `${prefix}${connector}${node.type === "folder" ? "📁 " : "📄 "}${node.name}\n`;

        const newPrefix = isRoot ? "" : prefix + (isLast ? "    " : "│   ");

        node.children.forEach((child, index) => {
            const childIsLast = index === node.children.length - 1;
            result += formatTree(child, newPrefix, childIsLast, false);
        });

        return result;
    }

    try {
        const treeData = await buildTree(rootPath);
        return `PROJECT SKELETON:\n${"=".repeat(20)}\n${formatTree(treeData)}`;
    } catch (err) {
        return `Error generating skeleton for ${rootPath}: ${err.message}`;
    }
}
export function missionWorker(tasks, results) {
    if (tasks.length != results.length) {
        return;
    }
    let string = "";
    for (let i = 0; i < tasks.length; i++) {
        string += `
    TASK (${i + 1}): 
    ======
    ${tasks[i]}
    
    RESULT: 
    ${results[i]}\n`;
    }
    return string;
}

export function constructMissionHistory(count, role, body, missionHistory) {
    let tagline;
    if (role === "WORKER") {
        tagline = "WORKER FINDINGS";
    } else if (role === "LOOPMANAGER") {
        tagline = "DETECTIVE EVALUATION";
    } else if (role === "INITIALMANAGER") {
        tagline = "INITIAL STRATEGY - LEAD ARCHITECT";
    }
    const missionStructure = `
[TURN ${count}: ${tagline}]
${body}
`;
    missionHistory.push(missionStructure);
}