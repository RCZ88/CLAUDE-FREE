import { pipeline } from '@xenova/transformers';
import crypto from 'node:crypto';
import fs from 'fs';

// We initialize the AI model once so it stays in memory (like a static singleton)
const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');


function generateHash(text) {
    return crypto
        .createHash('sha256') // 1. Choose the algorithm
        .update(text)         // 2. Feed in the data
        .digest('hex');       // 3. Output as a readable hex string
}


export async function generateEmbedding(text) {
    // 1. Initialize the pipeline if it doesn't exist (Singleton pattern)
    if (!extractor) {
        // 'all-MiniLM-L6-v2' is a standard, lightweight model (approx 80MB)
        extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }

    // 2. Generate the embedding
    const output = await extractor(text, { pooling: 'mean', normalize: true });

    // 3. Convert the Tensor object to a standard JavaScript Array
    return Array.from(output.data);
}

export async function processFileForVectors(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // 1. CHUNKING: Split the file into 50-line blocks
    const lines = content.split('\n');
    const results = [];
    let chunkIndex = 0;
    for (let i = 0; i < lines.length; i += 40) { // 40-line jumps for 10-line overlap
        const chunkText = lines.slice(i, i + 50).join('\n')
        const output = await extractor(chunkText, { pooling: 'mean', normalize: true });
        const vector = Array.from(output.data);
        const chunkHash = generateHash(chunkText);
        results.push({
            filePath:filePath,
            text:chunkText,
            vector:vector,
            chunkIndex:chunkIndex,
            chunkHash:chunkHash
        });
        chunkIndex++;
        if(i+50 >= lines.length){
            break;
        }
    }


    return results; // Return the list of "meanings" back to the caller
}