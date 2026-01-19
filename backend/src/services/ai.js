import db from '../db/database.js';
import { getCodeMappingOfFile } from "../services/codemap.js"
import { generateHash } from "../services/vectors.js";
import fs from "fs";
import path from "node:path";
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", "..", "..", ".env") })
export async function chat(userPrompt, model, systemPromptFileName, history = []) {
    const systemTxt = await loadSystemPrompt(systemPromptFileName);

    const systemPrompt = {
        role: "system",
        content: systemTxt,
    };
    // console.log(`System Prompt:
    //   ${systemPrompt.content}`);
    let payload;
    if (history.length !== 0) {
        payload = [systemPrompt, ...history, userPrompt];
    } else {
        payload = [systemPrompt, userPrompt];
    }


    let response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "ForestMind Local",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: model,
            messages: payload,
            stream: false,
        }),
    });
    const result = await response.json();
    if (result.error) {
        console.error("OpenRouter Error:", result.error);
        throw new Error(`AI Search Failed: ${result.error.message}`);
    }

    if (!result.choices || result.choices.length === 0) {
        console.error("Unexpected API Response:", result);
        throw new Error("AI returned no results.");
    }
    return result.choices[0].message.content;
}
export async function loadSystemPrompt(fileName) {
    const filePath = path.join(__dirname, '..', '..', '..', "prompts", `${fileName}.txt`);
    return await fs.promises.readFile(filePath, "utf-8");
}

export async function updateCodeDescDB(chatId, path, attachmentId) {
    console.log("====== CODE DESCRIPTION ======");
    const insertSt = db.prepare(`
    INSERT INTO file_description (path, file_hash, ai_summary, session_id, attachment_id) 
    VALUES(?, ?, ?, ?, ?)`);

    const retrieveSt = db.prepare(`
    SELECT file_hash FROM file_description 
    WHERE session_id = ? AND path = ? AND attachment_id = ?`);

    const replaceSt = db.prepare(`
    UPDATE file_description SET ai_summary = ?, file_hash = ? 
    WHERE path = ? AND session_id = ? AND attachment_id = ?`);

    try {
        const codemapString = getCodeMappingOfFile(path, chatId);
        const userPrompt = `${codemapString}

Based on these symbols, what is the one-sentence technical summary of this file?`;
        // console.log("User prompt:\n", userPrompt);

        const content = fs.readFileSync(path);
        const fileHash = generateHash(content);
        const allMappings = retrieveSt.get(chatId, path, attachmentId);
        // console.log(`
        //   allMappings.file_hash: ${
        //     allMappings ? allMappings.file_hash : "allMappings is null"
        //   }
        //   fileHash: ${fileHash}`);
        if (allMappings && allMappings.file_hash === fileHash) {
            console.log(`Skipping ${path} - Hash matches.`);
            return;
        }
        console.log(`Proceed to Process Description for Path: ${path}`);
        const prompt = {
            role: "user",
            content: userPrompt,
        };

        const fileDesc = await chat(
            prompt,
            "xiaomi/mimo-v2-flash:free",
            "FileDescriptionSP"
        );

        if (!allMappings) {
            insertSt.run(path, fileHash, fileDesc, chatId, attachmentId);
        } else {
            replaceSt.run(fileDesc, fileHash, path, chatId, attachmentId);
        }
    } catch (error) {
        console.log("Error Transcribing File: ", error);
    }
}


