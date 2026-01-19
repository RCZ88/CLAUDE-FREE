import { pipeline } from "@xenova/transformers";
import crypto from "node:crypto";
import fs from "fs";
import db from "../db/database.js";

export function cosineSimilarity(vecA, vecB) {
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

export async function getVectorContext(userQuery, sessionId, limit = 3) {
    const queryVector = await generateEmbedding(userQuery);

    const allRows = db
        .prepare(
            "SELECT file_path, raw_content, embedding FROM vector_index WHERE session_id = ?"
        )
        .all(sessionId);

    const results = allRows.map((row) => {
        const rowVector = JSON.parse(row.embedding);
        return {
            file: row.file_path,
            content: row.raw_content,
            score: cosineSimilarity(queryVector, rowVector),
        };
    });

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function handleFileDeletion(filePath) {
    console.log(`Deleting ${filePath} from Vector Index...`);
    let stmt = db.prepare("DELETE FROM vector_index WHERE file_path = ?");
    stmt.run(filePath);
    console.log(`Deleting ${filePath} from Code Map...`);
    stmt = db.prepare("DELETE FROM code_map WHERE file_path = ?");
    stmt.run(filePath);
}

export let extractor = await pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2"
);

export function generateHash(text) {
    return crypto
        .createHash("sha256") // 1. Choose the algorithm
        .update(text) // 2. Feed in the data
        .digest("hex"); // 3. Output as a readable hex string
}

export async function generateEmbedding(text) {
    // 1. Initialize the pipeline if it doesn't exist (Singleton pattern)
    if (!extractor) {
        // 'all-MiniLM-L6-v2' is a standard, lightweight model (approx 80MB)
        extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    }

    // 2. Generate the embedding
    const output = await extractor(text, { pooling: "mean", normalize: true });

    // 3. Convert the Tensor object to a standard JavaScript Array
    return Array.from(output.data);
}

export async function processFileForVectors(filePath) {
    const content = fs.readFileSync(filePath, "utf8");

    // 1. CHUNKING: Split the file into 50-line blocks
    const lines = content.split("\n");
    const results = [];
    let chunkIndex = 0;
    for (let i = 0; i < lines.length; i += 40) {
        // 40-line jumps for 10-line overlap
        const chunkText = lines.slice(i, i + 50).join("\n");
        const output = await extractor(chunkText, {
            pooling: "mean",
            normalize: true,
        });
        const vector = Array.from(output.data);
        const chunkHash = generateHash(chunkText);
        results.push({
            filePath: filePath,
            text: chunkText,
            vector: vector,
            chunkIndex: chunkIndex,
            chunkHash: chunkHash,
        });
        chunkIndex++;
        if (i + 50 >= lines.length) {
            break;
        }
    }

    return results; // Return the list of "meanings" back to the caller
}