var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// 1. Import 'Marked' (Capital M)
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
const markdown = new Marked(markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
    }
}));
// 3. Use your instance to parse
export function renderMarkdown(markdownText) {
    return __awaiter(this, void 0, void 0, function* () {
        // Note: In v11+, .parse() can return a Promise, so it's safer to await it
        // or cast it if you are sure it's synchronous.
        return markdown.parse(markdownText);
    });
}
let systemPrompt = "";
// 2. Function to load the text file (Run this when page loads)
function loadTxtFiles() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch("/static/SystemCore.txt");
            systemPrompt = yield response.text();
            console.log("System Prompt loaded!", systemPrompt.length, "chars");
        }
        catch (error) {
            console.error("Could not load prompt guide:", error);
            // Fallback if file fails
        }
    });
}
// 1. UPDATE YOUR MODEL LIST
const claudeModels = [
    'tngtech/deepseek-r1t2-chimera:free', // Good for reasoning
    'kwaipilot/kat-coder-pro:free', // Good for code
    'openai/gpt-oss-20b:free', // General purpose
    'nvidia/nemotron-nano-12b-v2-vl:free', // Fast
    'mistralai/devstral-2512:free', //excels in agentic coding.
    'kwaipilot/kat-coder-pro:free' //tops SWE-Bench benchmarks.
];
// 2. SET THE DEFAULT (Must match one of the above)
let currentModel = "tngtech/deepseek-r1t2-chimera:free";
let currentSessionId = "";
const sendButton = document.querySelector('#sendBtn');
const userPromptInput = document.querySelector('#messageInput');
const inputActions = document.querySelector('.input-actions');
const messagesContainer = document.querySelector('#messagesContainer');
const modelSelect = document.querySelector('#modelDropdown');
const newChat = document.querySelector('#newChatBtn');
const attachFilesBtn = document.querySelector('#attachFilesBtn');
const attachFolderBtn = document.querySelector('#attachFolderBtn');
const fileInput = document.querySelector('#fileInput');
const folderInput = document.querySelector('#folderInput');
const toggleSidebar = document.querySelector('#toggleSidebar');
const homePage = document.querySelector('#logoTitle');
const sidebarContainer = document.querySelector('.container');
const scrollButton = document.querySelector('#scrollToBottomBtn');
const expandChatInput = document.querySelector('#heightUp');
const shrinkChatInput = document.querySelector('#heightDown');
const HEIGHT_STEPS = [60, 120, 200, 350];
const username = "You";
let currentPage = 'Home';
let AI = currentModel.toUpperCase();
const userNames = {
    "user": username,
    "ai": AI
};
const contextLengthMax = 10;
let HISTORY_CHAT_CONTEXT = [];
document.addEventListener('DOMContentLoaded', () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log("1. Starting...");
        switchToHomeMode();
        // If this function has a bug, the code dies here
        prepareModelOptions();
        console.log("2. Options prepared.");
        yield loadTxtFiles();
        console.log("3. System Prompt Loaded.");
        yield loadSidebar();
        console.log("4. Sidebar loaded!");
    }
    catch (error) {
        // THIS is what you need to see
        console.error("CRITICAL ERROR DURING STARTUP:", error);
    }
}));
homePage === null || homePage === void 0 ? void 0 : homePage.addEventListener('click', () => switchToHomeMode());
toggleSidebar === null || toggleSidebar === void 0 ? void 0 : toggleSidebar.addEventListener('click', () => {
    sidebarContainer === null || sidebarContainer === void 0 ? void 0 : sidebarContainer.classList.toggle('sidebar-hidden');
    const icon = toggleSidebar.querySelector('i');
    if (icon) {
        if (sidebarContainer === null || sidebarContainer === void 0 ? void 0 : sidebarContainer.classList.contains('sidebar-hidden')) {
            icon.classList.replace('fa-bars', 'fa-arrow-right');
        }
        else {
            icon.classList.replace('fa-arrow-right', 'fa-bars');
        }
    }
});
scrollButton === null || scrollButton === void 0 ? void 0 : scrollButton.addEventListener('click', () => {
    messagesContainer === null || messagesContainer === void 0 ? void 0 : messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: 'smooth'
    });
});
messagesContainer === null || messagesContainer === void 0 ? void 0 : messagesContainer.addEventListener('scroll', () => {
    const threshold = 300;
    const distanceFromBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight;
    if (scrollButton) {
        if (distanceFromBottom > threshold) {
            scrollButton.style.display = 'flex';
        }
        else {
            scrollButton.style.display = 'none';
        }
    }
});
let manualMinStepIndex = 0;
function adjustInputHeight() {
    if (!userPromptInput || !inputActions)
        return;
    // 1. Reset height to auto so we can correctly measure the new scrollHeight
    userPromptInput.style.height = 'auto';
    const contentHeight = userPromptInput.scrollHeight;
    // 2. Calculate which step the CONTENT technically needs
    let contentStepIndex = 0;
    HEIGHT_STEPS.forEach((step, index) => {
        if (contentHeight > step - 20) {
            contentStepIndex = index;
        }
    });
    // 3. The Winner is the larger of the two: 
    //    What the text needs vs. What the user manually forced.
    let finalStepIndex = Math.max(contentStepIndex, manualMinStepIndex);
    // Safety clamp (prevent going out of bounds)
    finalStepIndex = Math.min(finalStepIndex, HEIGHT_STEPS.length - 1);
    const targetHeight = HEIGHT_STEPS[finalStepIndex];
    // 4. Apply dimensions
    inputActions.style.height = `${targetHeight}px`;
    userPromptInput.style.height = `${targetHeight - 15}px`;
    // 5. UX Polish: If content is actually larger than our max step (350px),
    //    we must turn on the scrollbar so they can still see it.
    if (contentHeight > targetHeight) {
        userPromptInput.style.overflowY = 'auto';
    }
    else {
        userPromptInput.style.overflowY = 'hidden';
    }
}
userPromptInput === null || userPromptInput === void 0 ? void 0 : userPromptInput.addEventListener('input', adjustInputHeight);
function handleExpand() {
    // Increase step, but don't go past the last option
    console.log("Expand!");
    if (manualMinStepIndex < HEIGHT_STEPS.length - 1) {
        manualMinStepIndex++;
        adjustInputHeight(); // Force update immediately
    }
}
function handleShrink() {
    // Decrease step, but don't go below 0
    console.log("Shrink!");
    if (manualMinStepIndex > 0) {
        manualMinStepIndex--;
        adjustInputHeight(); // Force update immediately
    }
}
if (expandChatInput && shrinkChatInput) {
    console.log("expandChatInput && shrinkChatInput");
    expandChatInput.addEventListener('click', () => {
        handleExpand();
    });
    shrinkChatInput.addEventListener('click', () => {
        handleShrink();
    });
}
else {
    console.log("Buttons failed to load!");
}
// --- 1. CLICK HANDLERS ---
if (attachFilesBtn && fileInput) {
    attachFilesBtn.addEventListener('click', () => fileInput.click());
}
if (attachFolderBtn && folderInput) {
    attachFolderBtn.addEventListener('click', () => folderInput.click());
}
// --- 2. FILE SELECTION HANDLERS ---
if (fileInput) {
    fileInput.addEventListener('change', (e) => handleFileSelection(e));
}
if (folderInput) {
    folderInput.addEventListener('change', (e) => handleFileSelection(e));
}
function addProcessDiv(stepList) {
    const statusDiv = document.createElement('div');
    statusDiv.className = 'processing-container';
    statusDiv.id = 'ai-processing-status';
    stepList.forEach(step => {
        const stepEl = document.createElement('div');
        stepEl.className = 'step';
        stepEl.id = `step-${step.id}`;
        stepEl.innerHTML = `<i class="fas ${step.icon}"></i> <span>${step.label}</span>`;
        statusDiv.appendChild(stepEl);
    });
    return statusDiv;
}
function updateStatusStep(stepId, state) {
    var _a, _b;
    const el = document.getElementById(`step-${stepId}`);
    if (!el)
        return;
    const iconContainer = el.querySelector('i') || el.querySelector('.dot-loader');
    if (!iconContainer)
        return;
    el.classList.remove('active', 'completed');
    el.classList.add(state);
    if (state === 'active') {
        // Replace icon with pulsing dots
        el.innerHTML = `
            <div class="dot-loader"><span></span><span></span><span></span></div>
            <span>${(_a = el.querySelector('span')) === null || _a === void 0 ? void 0 : _a.innerText}</span>
        `;
    }
    else if (state === 'completed') {
        // Replace dots with a green checkmark
        el.innerHTML = `
            <i class="fas fa-check"></i>
            <span>${(_b = el.querySelector('span')) === null || _b === void 0 ? void 0 : _b.innerText}</span>
        `;
    }
}
function handleFileSelection(e) {
    return __awaiter(this, void 0, void 0, function* () {
        const input = e.target;
        const files = Array.from(input.files || []);
        if (files.length === 0)
            return;
        const formData = new FormData();
        files.forEach(file => {
            // 'files' is the key the backend will look for
            formData.append('files', file);
        });
        try {
            const response = yield fetch('/api/upload', {
                method: 'POST',
                body: formData, // No headers needed, browser sets 'multipart/form-data' automatically
            });
            const result = yield response.json();
            console.log("Upload success:", result);
        }
        catch (err) {
            console.error("Upload failed:", err);
        }
    });
}
// Listen for changes
modelSelect === null || modelSelect === void 0 ? void 0 : modelSelect.addEventListener("change", (event) => {
    const selectedElement = event.target;
    currentModel = selectedElement.value;
    AI = selectedElement.value.toUpperCase();
    userNames['ai'] = AI;
    console.log(`Model switched to: ${AI}`);
});
function prepareModelOptions() {
    if (!modelSelect) {
        console.error("CRITICAL ERROR: Could not find 'modelSelect' in the HTML!");
        return;
    }
    console.log("Preparing Models...");
    for (const model of claudeModels) {
        const modelOption = document.createElement("option");
        modelOption.value = model;
        modelOption.textContent = model;
        console.log("Added Model: ", model);
        modelSelect === null || modelSelect === void 0 ? void 0 : modelSelect.appendChild(modelOption);
    }
}
const welcomeScreen = document.getElementById('welcome-screen');
function appendMessage(text_1, sender_1) {
    return __awaiter(this, arguments, void 0, function* (text, sender, processList = [], timestamp = new Date().toISOString(), retrival = false) {
        /*
        div class="message message-ai">
                        <div class="message-avatar avatar-ai">
                            <i class="fas fa-tree"></i>
                        </div>
                        <div class="message-content">
                            <div class="message-sender">ForestMind AI</div>
                            <div class="message-text">Hello! I'm your AI assistant powered by Claude 3.5 Sonnet. I can help you with a variety of tasks. How can I assist you today?</div>
                            <div class="message-time">10:24 AM</div>
                        </div>
                    </div>
        */
        if (!messagesContainer) {
            // Fallback: return a dummy element so code doesn't crash if container is 
            console.log("Message Container Not Found!");
            return document.createElement("div");
        }
        const messageDiv = document.createElement("div");
        messageDiv.classList.add("message", `message-${sender}`);
        const avatarDiv = document.createElement("div");
        avatarDiv.classList.add("message-avatar", `avatar-${sender}`);
        const img = document.createElement("img");
        img.src = `/static/avatar-${sender}.png`; // Placeholder Forest Spirit
        img.alt = sender.toUpperCase();
        img.classList.add("custom-avatar");
        avatarDiv.appendChild(img);
        messageDiv.appendChild(avatarDiv);
        /*
        Message Content DIV---
        */
        const contentDiv = document.createElement("div");
        contentDiv.classList.add("message-content");
        const messageSenderDiv = document.createElement("div");
        messageSenderDiv.classList.add("message-sender");
        messageSenderDiv.innerText = userNames[sender];
        contentDiv.appendChild(messageSenderDiv);
        if (sender === 'ai' && !retrival) {
            const stepsDiv = addProcessDiv(processList);
            contentDiv.appendChild(stepsDiv);
        }
        const messageText = document.createElement("div");
        messageText.classList.add("message-text");
        if (sender == 'ai') {
            const htmlContent = yield renderMarkdown(text);
            messageText.innerHTML = htmlContent;
        }
        else if (sender == 'user') {
            messageText.innerText = text;
        }
        contentDiv.appendChild(messageText);
        const timeAppendDiv = document.createElement("div");
        timeAppendDiv.classList.add("message-time");
        const now = new Date();
        timeAppendDiv.innerText = now.toLocaleTimeString();
        contentDiv.appendChild(timeAppendDiv);
        messageDiv.appendChild(contentDiv);
        messagesContainer.appendChild(messageDiv);
        // messagesContainer.scrollIntoView({ behavior: 'smooth' });
        return messageText;
    });
}
function fetchSemanticContext(userPrompt) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch('api/getSemantic', {
                method: 'POST',
                headers: {
                    'Content-type': 'application/json'
                },
                body: userPrompt
            });
            if (!response.ok)
                throw new Error('Network response was not ok');
            const data = yield response.json();
            console.log('Response Data Retrieved:\n', data.answer);
            return data.answer;
        }
        catch (error) {
            console.error('Error Calling Server: ', error);
            return [];
        }
    });
}
function fetchStructuralContext(prompt) {
    return __awaiter(this, void 0, void 0, function* () {
        const promptTailored = `
    =============================
    Below is the prompt to Extract the SQL keywords into JSON format:
    ${prompt}`;
        const userPrompt = {
            'role': 'user',
            'content': promptTailored
        };
        const jsonWords = yield callLLM(userPrompt, "nvidia/nemotron-nano-12b-v2-vl:free", "Code Map Context", "CodeMapSP.txt");
        try {
            const keywords = JSON.parse(jsonWords);
            const response = yield fetch('api/searchCodeMap/', {
                method: 'POST',
                headers: {
                    'Content-type': 'application/json'
                },
                body: JSON.stringify(keywords)
            });
            const recieved = yield response.json();
            if (!response.ok)
                throw new Error('Network response was not ok');
            return recieved.answer;
        }
        catch (error) {
            console.log(`Failed to Parse AI Response of JSONs. Error: ${error}`);
            return [];
        }
    });
}
function streamAiResponse(prompt, codemap, semantic) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        console.log(`🚀 Sending to OpenRouter... Model: ${currentModel}`);
        // Create the UI bubble
        const bubbleElement = yield appendMessage("...", "ai");
        let fullText = "";
        const codemapString = codemap.join('\n');
        const semanticString = semantic.join('\n');
        const constFullSystemPrompt = systemPrompt
            .replace('{{codeMap}}', codemapString || 'No relevant code functions found.')
            .replace('{{vectorContext}}', semanticString || 'No relevant semantic chunks found.');
        // Prepare the messages array (System + Context + User)
        const messages = [
            { role: "system", content: constFullSystemPrompt || "You are a helpful AI." },
            ...HISTORY_CHAT_CONTEXT, // Your existing chat history variable
            { role: "user", content: prompt }
        ];
        try {
            // Call YOUR local server (which calls OpenRouter)
            const response = yield fetch("http://localhost:3000/api/streamChat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: currentModel,
                    messages: messages
                })
            });
            if (!response.ok)
                throw new Error("Network response was not ok");
            if (!response.body)
                throw new Error("Response body is null");
            // Handle the Stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            if (messagesContainer)
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            while (true) {
                const { done, value } = yield reader.read();
                if (done)
                    break;
                const chunk = decoder.decode(value, { stream: true });
                // OpenRouter sends data lines like "data: {...}"
                const lines = chunk.split("\n");
                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const jsonStr = line.slice(6);
                        if (jsonStr.trim() === "[DONE]")
                            continue;
                        try {
                            const json = JSON.parse(jsonStr);
                            const content = ((_c = (_b = (_a = json.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.delta) === null || _c === void 0 ? void 0 : _c.content) || "";
                            fullText += content;
                            // Update UI
                            bubbleElement.innerHTML = yield renderMarkdown(fullText);
                        }
                        catch (e) {
                            // Partial JSON chunks are normal in streams, ignore them
                        }
                    }
                }
            }
            console.log("🏁 Finished. Response length:", fullText.length);
            return fullText;
        }
        catch (error) {
            console.error("❌ Error:", error);
            bubbleElement.innerHTML = "<i>Error: Could not connect to AI server. Ensure 'node server.js' is running.</i>";
            return "";
        }
    });
}
// 4. The Logic
function handleMessage() {
    return __awaiter(this, void 0, void 0, function* () {
        // Safety check: if input is missing, stop.
        console.log("Enter");
        if (!userPromptInput)
            return;
        if (currentPage == 'Home') {
            yield createNewBranch();
        }
        //TODO: needs to handle that the append message method.
        //TODO: handle the size adjusting buttons for the user input.
        //todo: i want to add like minimizing of the user input to a button.
        const text = userPromptInput.value.trim();
        if (text === "")
            return;
        const userMessage = {
            "role": "user",
            "content": text
        };
        const ctx = {
            userInput: text
        };
        HISTORY_CHAT_CONTEXT.push(userMessage);
        yield appendMessage(text, 'user');
        userPromptInput.value = "";
        const stepList = [
            { id: 'title', icon: 'fa-heading', label: 'Generating Branch Title...',
                method: (ctx) => __awaiter(this, void 0, void 0, function* () {
                    if (needSessionTitle[currentSessionId]) {
                        console.log("Need of Session Title");
                        needSessionTitle[currentSessionId].innerText = yield getBranchTitle(text);
                        ctx.chatTitle = needSessionTitle[currentSessionId].innerText;
                        yield apiUpdateSession(currentSessionId, needSessionTitle[currentSessionId].innerText);
                        delete needSessionTitle[currentSessionId];
                    }
                })
            },
            { id: 'enhance', icon: 'fa-sparkles', label: 'Enhancing Prompt...',
                method: (ctx) => __awaiter(this, void 0, void 0, function* () {
                    ctx.enhancedPrompt = yield enhancePrompt(text);
                })
            },
            { id: 'semantic', icon: 'fa-search', label: 'Semantic Search...',
                method: (ctx) => __awaiter(this, void 0, void 0, function* () {
                    ctx.semanticResults = yield fetchSemanticContext(text);
                    console.log(`Semantics Chunks Loading Successfull! Chunks Loaded: ${ctx.semanticResults.length}`);
                })
            },
            { id: 'codemap', icon: 'fa-sitemap', label: 'Mapping Codebase...',
                method: (ctx) => __awaiter(this, void 0, void 0, function* () {
                    ctx.codeMapData = yield fetchStructuralContext(text);
                    console.log(`Code Map Chunks Loading Successfull! Chunks Loaded: ${ctx.codeMapData.length}`);
                })
            }
        ];
        yield appendMessage("", 'ai', stepList);
        yield apiSaveMessage(currentSessionId, text, 'user');
        // let currentProcessId:string;
        // stepList.forEach(async (step) =>{
        //     if(step){
        //         if(currentProcessId){
        //             updateStatusStep(currentProcessId, 'completed');
        //         }
        //     }
        // });
        for (const step of stepList) {
            if (step && step.method) {
                updateStatusStep(step.id, 'active');
                yield step.method(ctx);
                updateStatusStep(step.id, 'completed');
            }
        }
        yield removeProcessDiv();
        console.log("Sending Prompt with History: ", HISTORY_CHAT_CONTEXT);
        const fullResponse = yield streamAiResponse(ctx.userInput, ctx.codeMapData || [], ctx.semanticResults || []);
        const aiMessage = {
            "role": "assistant",
            "content": fullResponse
        };
        apiSaveMessage(currentSessionId, fullResponse, "ai");
        HISTORY_CHAT_CONTEXT.push(aiMessage);
        if (HISTORY_CHAT_CONTEXT.length > (2 * contextLengthMax)) {
            HISTORY_CHAT_CONTEXT.shift();
            HISTORY_CHAT_CONTEXT.shift();
        }
    });
}
function removeProcessDiv() {
    return __awaiter(this, void 0, void 0, function* () {
        const statusBox = document.getElementById('ai-processing-status');
        if (statusBox) {
            // Optional: Add a fade-out class before removing for a smooth UI
            statusBox.style.opacity = '0';
            // Wait for the fade (0.3s) then remove
            setTimeout(() => {
                statusBox.remove();
                // 2. Start the real AI response in the canvas
                // aiMessageCanvas.innerHTML = "Starting response...";
            }, 300);
        }
    });
}
sendButton === null || sendButton === void 0 ? void 0 : sendButton.addEventListener("click", handleMessage);
userPromptInput === null || userPromptInput === void 0 ? void 0 : userPromptInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleMessage();
    }
});
const API_URL = "http://127.0.0.1:8000";
function apiCreateSession(sessionId) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Creating Session of id: ", sessionId);
        yield fetch(`${API_URL}/sessions/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: sessionId })
        });
    });
}
function apiSaveMessage(sessionId, text, sender) {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield fetch(`${API_URL}/sessions/${sessionId}/messages/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: text, sender: sender })
        });
    });
}
function apiGetSessions() {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield fetch(`${API_URL}/sessions/`);
        return yield response.json();
    });
}
function apiGetMessages(session_id_1) {
    return __awaiter(this, arguments, void 0, function* (session_id, limit = 0) {
        let url = `${API_URL}/sessions/${session_id}/messages/`;
        if (limit > 0) {
            url += `?limit=${limit}`;
        }
        console.log("Fetching URL:", url);
        const response = yield fetch(url);
        const data = yield response.json();
        console.log("DEBUG DATA:", data);
        return data === null || data === void 0 ? void 0 : data.map((msg) => ({
            id: msg.id.toString(),
            text: msg.content,
            sender: msg.sender,
            timestamp: msg.timestamp
        }));
    });
}
function createNewBranch() {
    return __awaiter(this, void 0, void 0, function* () {
        const chatId = "chat_" + Date.now().toString() + crypto.randomUUID();
        console.log("Chat Id Created:", chatId);
        currentSessionId = chatId;
        yield apiCreateSession(chatId);
        if (messagesContainer)
            messagesContainer.innerHTML = '';
        const chatBranch = yield loadBranchHtml(chatId, true);
        yield selectBranch(chatId, chatBranch);
    });
}
var branchCount;
const chatBranches = document.querySelector('#chatBranches');
function formatTimestamp(isoString) {
    const date = new Date(isoString);
    // Check if date is valid
    if (isNaN(date.getTime()))
        return "";
    return date.toLocaleString('en-US', {
        month: 'short', // "Oct"
        day: 'numeric', // "12"
        hour: 'numeric', // "2"
        minute: '2-digit', // "30"
        hour12: true // "PM"
    });
}
var selectedBranch;
function createAxeIcon() {
    const img = document.createElement('img');
    img.src = "/static/axe.png";
    img.alt = "Delete Branch";
    img.classList.add("delete-icon");
    return img;
}
let needSessionTitle = {};
function loadSidebar() {
    return __awaiter(this, arguments, void 0, function* (isNewChat = false) {
        console.log("Loading Sidebar:");
        let response = yield apiGetSessions();
        console.log(response);
        if (chatBranches != null) {
            chatBranches.innerHTML = "";
        }
        branchCount = response.length;
        console.log(branchCount);
        for (let i = 0; i < branchCount; i++) {
            const branch = response[i];
            var title = branch['title'];
            var date = formatTimestamp(branch['created_at']);
            var preview = branch['chat_preview'];
            yield loadBranchHtml(branch['id'], false, title, date, preview);
        }
    });
}
function loadBranchHtml(sessionId_1) {
    return __awaiter(this, arguments, void 0, function* (sessionId, newChat = false, title = "New Chat", date = formatTimestamp(new Date().toISOString()), preview = "No Preview") {
        console.log(`Title: ${title}, Date: ${date}, Preview: ${preview}`);
        const chatBranch = document.createElement("div");
        chatBranch.classList.add("chat-branch");
        // chatBranch.setAttribute("data-id", i.toString());
        const deleteBranch = createAxeIcon();
        deleteBranch.addEventListener("click", (event) => __awaiter(this, void 0, void 0, function* () {
            event.stopPropagation();
            chatBranches === null || chatBranches === void 0 ? void 0 : chatBranches.removeChild(chatBranch);
            try {
                yield fetch(`${API_URL}/sessions/${sessionId}/`, {
                    method: "DELETE"
                });
                if (messagesContainer) {
                    messagesContainer.innerHTML = "";
                }
                console.log("Deleted successfully");
            }
            catch (error) {
                console.error("Failed to delete", error);
            }
        }));
        chatBranch.appendChild(deleteBranch);
        const chatTitle = document.createElement("div");
        chatTitle.classList.add("chat-branch-title");
        chatTitle.innerText = title;
        if (newChat || title.toLowerCase() == "new chat") {
            needSessionTitle[sessionId] = chatTitle;
        }
        chatBranch.appendChild(chatTitle);
        const chatPreview = document.createElement("div");
        chatPreview.classList.add("chat-branch-preview");
        chatPreview.innerText = preview;
        chatBranch.appendChild(chatPreview);
        const chatDate = document.createElement("div");
        chatDate.classList.add("chat-branch-date");
        chatDate.innerText = date;
        chatBranch.appendChild(chatDate);
        chatBranch.addEventListener("click", (event) => __awaiter(this, void 0, void 0, function* () {
            selectBranch(sessionId, chatBranch);
        }));
        if (newChat && chatBranches) {
            chatBranches.insertBefore(chatBranch, chatBranches.firstChild);
        }
        else {
            chatBranches === null || chatBranches === void 0 ? void 0 : chatBranches.appendChild(chatBranch);
        }
        return chatBranch;
    });
}
function switchToChatMode() {
    // Hide the welcome 
    currentPage = 'Chat';
    if (welcomeScreen) {
        welcomeScreen.style.display = 'none';
    }
    // Show the messages container
    if (messagesContainer) {
        messagesContainer.style.display = 'flex'; // Use 'flex' to keep your layout alignment
    }
    document.body.classList.add('chat-mode');
}
function switchToHomeMode() {
    currentPage = 'Home';
    if (messagesContainer) {
        messagesContainer.style.display = 'none';
        messagesContainer.innerHTML = ''; // Optional: Clear old messages from screen
    }
    if (welcomeScreen) {
        welcomeScreen.style.display = 'flex';
    }
    if (selectedBranch) {
        selectedBranch.classList.remove("active");
    }
    document.body.classList.remove('chat-mode');
}
function selectBranch(sessionId, chatBranch) {
    return __awaiter(this, void 0, void 0, function* () {
        const branchSelectedId = sessionId;
        console.log(`Branch Selected: ${branchSelectedId}`);
        switchToChatMode();
        const messages = yield apiGetMessages(branchSelectedId);
        // console.log(JSON.stringify(messages));
        if (messagesContainer) {
            messagesContainer.innerHTML = "";
        }
        if (selectedBranch) {
            selectedBranch.classList.remove("active");
        }
        chatBranch.classList.add("active");
        selectedBranch = chatBranch;
        currentSessionId = sessionId;
        if (messages.length != 0 && messages) {
            console.log(`Session Length: ${messages.length}`);
            messages.forEach((msg) => __awaiter(this, void 0, void 0, function* () {
                console.log(`Retrieving Message ID: ${msg.id}`);
                yield appendMessage(msg.text, msg.sender, [], msg.timestamp, true);
            }));
        }
        else {
            console.log("Chat Session Empty!");
        }
        getHistoryChats();
    });
}
newChat === null || newChat === void 0 ? void 0 : newChat.addEventListener("click", (event) => {
    console.log("Create a new Chat");
    switchToHomeMode();
});
function getHistoryChats() {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield apiGetMessages(currentSessionId, contextLengthMax);
        const cleanedData = response.map((item) => {
            let roleType;
            if (item.sender == "user") {
                roleType = "user";
            }
            else {
                roleType = "assistant";
            }
            return {
                role: roleType,
                content: item.text
            };
        });
        HISTORY_CHAT_CONTEXT = cleanedData;
    });
}
function apiUpdateSession(sessionId, title, preview) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`Updating session ${sessionId}...`);
        // Create the body object dynamically
        const bodyData = {};
        if (title)
            bodyData.title = title;
        if (preview)
            bodyData.chat_preview = preview;
        try {
            const response = yield fetch(`${API_URL}/sessions/${sessionId}`, {
                method: "PATCH", // <--- matches the @app.patch in Python
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyData)
            });
            if (!response.ok)
                throw new Error("Failed to update session");
            console.log("Session updated successfully!");
        }
        catch (error) {
            console.error("Error updating session:", error);
        }
    });
}
function enhancePrompt(prompt) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Enhancing Prompt...");
        // 1. Prepare Payload
        const userInput = {
            role: "user",
            content: `
            Here is the prompt I need you to improve. 
            Please analyze it according to the "Prompt Engineering Guide" provided in the system instructions.
            
            IMPORTANT: Output the improved prompt text directly. 
            The improved prompt itself should ask for a standard Markdown response, NOT JSON.

            <input_prompt>
            "${prompt}"
            </input_prompt>
        `
        };
        return yield callLLM(userInput, currentModel, "Prompt Enhancing", "PESystemPrompt.txt");
        // 2. Start the Request (Talk to Local Server)
    });
}
function callLLM(prompt, model, taskName, fileName) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch("http://localhost:3000/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    // Use a 'smart' model for enhancement, or just use currentModel
                    model: model,
                    messages: prompt
                })
            });
            const result = yield response.json();
            console.log(`${taskName} complete. result: ${result}`);
            return result;
        }
        catch (error) {
            console.error(`${taskName} failed. Error:${error}`);
            // Fallback: If enhancement fails, just use the user's original prompt
            return "";
        }
    });
}
function getBranchTitle(prompt) {
    return __awaiter(this, void 0, void 0, function* () {
        const userInput = {
            role: "user",
            content: `
        ---------------------------------
        THE PROMPT TO TURN INTO THE TITLE: "${prompt}"`
        };
        return yield callLLM(userInput, "nvidia/nemotron-nano-12b-v2-vl:free", "Get Branch Title", "ChatTitleSP.txt");
    });
}
