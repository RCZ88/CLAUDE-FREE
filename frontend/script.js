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
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
function apiAddress(address) {
    return `http://localhost:3000/api/${address}`;
}
const markdown = new Marked(markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : "plaintext";
        return hljs.highlight(code, { language }).value;
    },
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
            const response = yield fetch(apiAddress("getSystemPrompt"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    fileName: "SystemCore"
                })
            });
            systemPrompt = (yield response.json()).prompt;
            console.log("System Prompt loaded!", systemPrompt.length, "chars");
        }
        catch (error) {
            console.error("Could not load prompt guide:", error);
            // Fallback if file fails
        }
    });
}
// Call this immediately
// 1. UPDATE YOUR MODEL LIST
const LLMModels = [
    "nvidia/nemotron-nano-12b-v2-vl:free", // Fast
    "mistralai/devstral-2512:free", //excels in agentic coding.
    "xiaomi/mimo-v2-flash:free",
    "nvidia/nemotron-3-nano-30b-a3b:free"
];
const SLM = "nvidia/nemotron-3-nano-30b-a3b:free"; //small language model - FAST
// 2. SET THE DEFAULT (Must match one of the above)
let currentModel = LLMModels[0];
let currentSessionId = "";
// @ts-expect-error - 'io' is provided by the script tag above
const socket = io("http://localhost:3000", {
    transports: ["websocket"], // Force it to use WebSocket immediately
    upgrade: false // Don't try to "upgrade" from polling
});
const sendButton = document.querySelector("#sendBtn");
const userPromptInput = document.querySelector("#messageInput");
const inputActions = document.querySelector(".input-actions");
const messagesContainer = document.querySelector("#messagesContainer");
const modelSelect = document.querySelector("#modelDropdown");
const newChat = document.querySelector("#newChatBtn");
const attachFolderBtn = document.querySelector("#attachFolderBtn");
const toggleSidebar = document.querySelector("#toggleSidebar");
const homePage = document.querySelector("#logoTitle");
const sidebarContainer = document.querySelector(".container");
const scrollButton = document.querySelector("#scrollToBottomBtn");
const expandChatInput = document.querySelector("#heightUp");
const shrinkChatInput = document.querySelector("#heightDown");
const openDrawerButton = document.querySelector("#openDrawerBtn");
const folderModalOverlay = document.querySelector("#folderModalOverlay");
const closeModalBtn = document.querySelector("#closeModalBtn");
const folderList = document.querySelector("#folderList");
const emptyState = document.querySelector("#emptyFolderState");
const fileCountBadge = document.querySelector("#fileCountBadge");
const modalAddFolderBtn = document.querySelector("#modalAddFolderBtn");
const toggleViewSettings = document.querySelector("#setting-show-toggle");
const optimizationSettings = document.querySelector("#feature-toggles-container");
const chevron = document.querySelector("#toggle-chevron");
// Initialize features only ONCE when the app loads
initFeatures();
toggleViewSettings === null || toggleViewSettings === void 0 ? void 0 : toggleViewSettings.addEventListener("click", () => {
    if (optimizationSettings && chevron) {
        // Toggle the 'collapsed' class
        const isCollapsed = optimizationSettings.classList.toggle("collapsed");
        // Rotate the chevron
        chevron.classList.toggle("chevron-rotate", isCollapsed);
        console.log(isCollapsed ? "Panel Closed" : "Panel Opened");
    }
});
openDrawerButton === null || openDrawerButton === void 0 ? void 0 : openDrawerButton.addEventListener("click", () => __awaiter(void 0, void 0, void 0, function* () {
    folderModalOverlay === null || folderModalOverlay === void 0 ? void 0 : folderModalOverlay.classList.add("active");
    yield renderFolders();
}));
closeModalBtn === null || closeModalBtn === void 0 ? void 0 : closeModalBtn.addEventListener("click", () => {
    folderModalOverlay === null || folderModalOverlay === void 0 ? void 0 : folderModalOverlay.classList.remove("active");
});
folderModalOverlay === null || folderModalOverlay === void 0 ? void 0 : folderModalOverlay.addEventListener("click", (e) => {
    if (e.target == folderModalOverlay) {
        folderModalOverlay === null || folderModalOverlay === void 0 ? void 0 : folderModalOverlay.classList.remove("active");
    }
});
modalAddFolderBtn === null || modalAddFolderBtn === void 0 ? void 0 : modalAddFolderBtn.addEventListener("click", () => __awaiter(void 0, void 0, void 0, function* () {
    const success = yield selectAttachment();
    if (success) {
        yield handleAttachedFolder();
        yield renderFolders();
    }
}));
messagesContainer === null || messagesContainer === void 0 ? void 0 : messagesContainer.addEventListener("click", (event) => {
    const target = event.target;
    // Check if the user clicked on the sender's name
    if (target.classList.contains("message-sender")) {
        // Find the parent 'message-content' to toggle the collapsed state
        const contentDiv = target.closest(".message-content");
        if (contentDiv) {
            contentDiv.classList.toggle("collapsed");
        }
    }
});
let foldersAbsPath = [];
function renderFolders() {
    return __awaiter(this, void 0, void 0, function* () {
        if (folderList) {
            folderList.innerHTML = "";
        }
        else {
            console.error(`Folder List Element not found`);
            return;
        }
        if (foldersAbsPath.length === 0) {
            emptyState === null || emptyState === void 0 ? void 0 : emptyState.classList.remove("hidden");
        }
        else {
            emptyState === null || emptyState === void 0 ? void 0 : emptyState.classList.add("hidden");
            foldersAbsPath.forEach((folderPath) => {
                console.log(`Folder Path: ${folderPath}`);
                const folderName = folderPath.split(/[\\/]/).filter(Boolean).pop();
                const li = document.createElement("li");
                li.classList.add("folder-item");
                li.innerHTML = `
                <div class="folder-info">
                    <span class="folder-name">${folderName}</span>
                    <span class="folder-path">${folderPath}</span>
                </div>
            `;
                const icon = document.createElement("i");
                icon.classList.add("fas", "fa-trash-alt");
                const deleteFolderButton = document.createElement("button");
                deleteFolderButton.classList.add("remove-folder-btn");
                deleteFolderButton.appendChild(icon);
                deleteFolderButton.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
                    yield removeAttachment(folderPath);
                    yield handleAttachedFolder();
                    yield renderFolders();
                }));
                li.appendChild(deleteFolderButton);
                //todo: create the remove folder button.
                folderList.appendChild(li);
            });
        }
    });
}
function removeAttachment(path) {
    return __awaiter(this, void 0, void 0, function* () {
        const payload = yield fetch(apiAddress("removeWatchList"), {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                path: path,
                sessionId: currentSessionId,
            }),
        });
        yield payload.json();
    });
}
function scrollToBottom(smooth) {
    if (messagesContainer) {
        console.log(`scrolling!`);
        if (smooth) {
            messagesContainer.scrollTo({
                top: messagesContainer.scrollHeight,
                behavior: "smooth",
            });
        }
        else {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }
}
const HEIGHT_STEPS = [60, 120, 200, 350];
const username = "You";
let currentPage = "Home";
let AI = currentModel.toUpperCase();
const userNames = {
    user: username,
    ai: AI,
};
const contextLengthMax = 10;
let HISTORY_CHAT_CONTEXT = [];
// Select the dropdown
// Tell TS that the 'marked' library exists
document.addEventListener("DOMContentLoaded", () => __awaiter(void 0, void 0, void 0, function* () {
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
homePage === null || homePage === void 0 ? void 0 : homePage.addEventListener("click", () => switchToHomeMode());
toggleSidebar === null || toggleSidebar === void 0 ? void 0 : toggleSidebar.addEventListener("click", () => {
    sidebarContainer === null || sidebarContainer === void 0 ? void 0 : sidebarContainer.classList.toggle("sidebar-hidden");
    const icon = toggleSidebar.querySelector("i");
    if (icon) {
        if (sidebarContainer === null || sidebarContainer === void 0 ? void 0 : sidebarContainer.classList.contains("sidebar-hidden")) {
            icon.classList.replace("fa-bars", "fa-arrow-right");
        }
        else {
            icon.classList.replace("fa-arrow-right", "fa-bars");
        }
    }
});
scrollButton === null || scrollButton === void 0 ? void 0 : scrollButton.addEventListener("click", () => {
    scrollToBottom(true);
});
messagesContainer === null || messagesContainer === void 0 ? void 0 : messagesContainer.addEventListener("scroll", () => {
    const threshold = 300;
    const distanceFromBottom = messagesContainer.scrollHeight -
        messagesContainer.scrollTop -
        messagesContainer.clientHeight;
    if (scrollButton) {
        if (distanceFromBottom > threshold) {
            scrollButton.classList.add("visible");
        }
        else {
            scrollButton.classList.remove("visible");
            scrollButton.classList.remove("has-new");
        }
    }
});
function notifyNewMessage(fullResponse) {
    return __awaiter(this, void 0, void 0, function* () {
        const aiMessage = {
            role: "assistant",
            content: fullResponse,
        };
        yield apiSaveMessage(currentSessionId, fullResponse, "ai", currentModel);
        HISTORY_CHAT_CONTEXT.push(aiMessage);
        if (HISTORY_CHAT_CONTEXT.length > 2 * contextLengthMax) {
            HISTORY_CHAT_CONTEXT.shift();
            HISTORY_CHAT_CONTEXT.shift();
        }
        if (scrollButton) {
            if (scrollButton.classList.contains("visible")) {
                scrollButton.classList.add("has-new");
            }
        }
    });
}
let manualMinStepIndex = 0;
function adjustInputHeight() {
    if (!userPromptInput || !inputActions)
        return;
    // 1. Measure the text
    userPromptInput.style.height = "auto";
    const contentHeight = userPromptInput.scrollHeight;
    // 2. Final height is strictly what the manual index says
    // We don't overwrite manualMinStepIndex here anymore!
    const finalStepIndex = Math.min(manualMinStepIndex, HEIGHT_STEPS.length - 1);
    const targetHeight = HEIGHT_STEPS[finalStepIndex];
    // 3. Apply dimensions
    inputActions.style.height = `${targetHeight}px`;
    userPromptInput.style.height = `${targetHeight - 15}px`;
    // 4. Scrollbar Logic: Always allow scrolling if text is bigger than the box
    if (contentHeight > (targetHeight - 15)) {
        userPromptInput.style.overflowY = "auto";
    }
    else {
        userPromptInput.style.overflowY = "hidden";
    }
}
userPromptInput === null || userPromptInput === void 0 ? void 0 : userPromptInput.addEventListener("input", adjustInputHeight);
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
    expandChatInput.addEventListener("click", () => {
        handleExpand();
    });
    shrinkChatInput.addEventListener("click", () => {
        handleShrink();
    });
}
else {
    console.log("Buttons failed to load!");
}
const featureState = {
    enhance_prompt: false,
    use_codemap: false,
    use_semantic: false,
    agent_supreme: false
};
function initFeatures() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch('./chatFeatures.json');
            const data = yield response.json();
            const container = document.getElementById('feature-toggles-container');
            data.features.forEach((feature) => {
                featureState[feature.id] = feature.enabled;
                const item = document.createElement('div');
                item.className = 'feature-item';
                item.innerHTML = `
                <div class="feature-info">
                    <label>${feature.label}</label>
                    <small>${feature.description}</small>
                </div>
                <label class="switch">
                    <input type="checkbox" id="${feature.id}" ${feature.enabled ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            `;
                container === null || container === void 0 ? void 0 : container.appendChild(item);
                const input = item.querySelector('input');
                input === null || input === void 0 ? void 0 : input.addEventListener('change', (e) => {
                    const target = e.target;
                    const isChecked = target.checked;
                    const currentId = feature.id;
                    featureState[currentId] = isChecked;
                    updateFeatureJson(currentId, isChecked);
                    // SCENARIO 1: Agent Supreme is turned ON
                    if (currentId === 'agent_supreme' && isChecked) {
                        forceToggle('use_codemap', true);
                        forceToggle('use_semantic', true);
                    }
                    // SCENARIO 2: A dependency is turned OFF while Agent Supreme is ON
                    if ((currentId === 'use_codemap' || currentId === 'use_semantic') && !isChecked) {
                        if (featureState['agent_supreme']) {
                            forceToggle('agent_supreme', false);
                            console.log("Agent Supreme disabled: Missing required context.");
                        }
                    }
                    /*
                    const featureState: Record<featuresId, boolean> = {
              enhance_prompt: false,
              use_codemap: false,
              use_semantic: false,
              agent_supreme: false
            };
                    */
                    const featuresString = featureStateToString(featureState);
                    console.log("Features State:\n", featuresString);
                });
            });
        }
        catch (err) {
            console.error("Feature initialization failed", err);
        }
    });
}
function updateFeatureJson(id, enabled) {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield fetch(apiAddress("updateFeatureState"), {
            method: "POST",
            headers: {
                "Content-type": "application/json",
            },
            body: JSON.stringify({
                featureId: id, enabled: enabled
            })
        });
        const payload = yield response.json();
        if (!payload.success) {
            console.error("Failed to Update Json, error: ", payload.error);
            return;
        }
        console.log("Success Updating Feature JSON!");
    });
}
function featureStateToString(state) {
    let result = "";
    const keys = Object.keys(state); // Cast to featuresId array
    for (const key of keys) {
        result += `${key}: ${state[key]}, `;
    }
    return result.slice(0, -2); // Remove trailing comma and space
}
// Helper to auto-toggle required settings
function forceToggle(id, shouldBeActive) {
    const checkbox = document.getElementById(id);
    if (checkbox && checkbox.checked !== shouldBeActive) {
        checkbox.checked = shouldBeActive;
        featureState[id] = shouldBeActive;
        updateFeatureJson(id, shouldBeActive);
        // Visual feedback
        const parent = checkbox.closest('.feature-item');
        if (parent) {
            parent.style.backgroundColor = shouldBeActive
                ? 'rgba(90, 140, 90, 0.2)' // Light green pulse for enabling
                : 'rgba(193, 124, 84, 0.2)'; // Light clay/red pulse for disabling
            setTimeout(() => parent.style.backgroundColor = 'transparent', 600);
        }
    }
}
function handleFolderSelection() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // 1. Check if API exists first
            if (!window.electronAPI) {
                console.warn("Electron API not detected. Are you running in a browser?");
                return null;
            }
            // 2. Open the dialog
            const absolutePath = yield window.electronAPI.selectFolder();
            // 3. Handle Cancellation
            // If the user clicks Cancel, 'absolutePath' will usually be null, undefined, or ""
            if (!absolutePath) {
                console.log("User cancelled folder selection.");
                return null; // Return null to indicate cancellation
            }
            console.log(`Selected Path: ${absolutePath}`);
            return absolutePath;
        }
        catch (error) {
            console.error("Failed to open folder picker:", error);
            return null;
        }
    });
}
// --- 1. CLICK HANDLERS ---
if (attachFolderBtn) {
    attachFolderBtn.addEventListener("click", () => __awaiter(void 0, void 0, void 0, function* () {
        const success = yield selectAttachment();
        if (success) {
            console.log("now handle attach folder");
            yield handleAttachedFolder();
            // await renderFolders();
        }
    }));
}
function selectAttachment() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Add Folder Clicked!");
        const path = yield handleFolderSelection();
        if (path) {
            console.log("Path Selected: ", path);
            const response = yield fetch(apiAddress("addWatchList"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    folderPath: path,
                    currentSession: currentSessionId,
                }),
            });
            if (!response.ok)
                throw new Error("Network response was not ok");
            const result = yield response.json();
            console.log(JSON.stringify(result));
            return true;
        }
        return false;
    });
}
function addProcessDiv(stepList) {
    const statusDiv = document.createElement("div");
    statusDiv.className = "processing-container";
    statusDiv.id = "ai-processing-status";
    stepList.forEach((step) => {
        const stepEl = document.createElement("div");
        stepEl.className = "step";
        stepEl.id = `step-${step.id}`;
        stepEl.innerHTML = `<i class="fas ${step.icon}"></i> <span>${step.label}</span>`;
        statusDiv.appendChild(stepEl);
    });
    return statusDiv;
}
function updateStatusStep(stepId, state) {
    var _a;
    const el = document.getElementById(`step-${stepId}`);
    if (!el)
        return;
    const iconContainer = el.querySelector("i") || el.querySelector(".dot-loader");
    if (!iconContainer)
        return;
    const labelSpan = el.querySelector(":scope > span");
    // Now TypeScript will allow .innerText or .textContent
    const currentText = (_a = labelSpan === null || labelSpan === void 0 ? void 0 : labelSpan.innerText) !== null && _a !== void 0 ? _a : "";
    el.classList.remove("active", "completed");
    el.classList.add(state);
    if (state === "active") {
        // Replace icon with pulsing dots
        el.innerHTML = `
            <div class="dot-loader"><span></span><span></span><span></span></div>
            <span>${currentText}</span>
        `;
    }
    else if (state === "completed") {
        // Replace dots with a green checkmark
        el.innerHTML = `
            <i class="fas fa-check"></i>
            <span>${currentText}</span>
        `;
    }
}
// async function handleFileSelection(e:Event){
//     const input = e.target as HTMLInputElement;
//     const files = Array.from(input.files || []);
//     if (files.length === 0) return ;
//     const formData = new FormData();
//     files.forEach(file => {
//         // 'files' is the key the backend will look for
//         formData.append('files', file);
//     });
//     try {
//         const response = await fetch('/api/upload', {
//             method: 'POST',
//             body: formData, // No headers needed, browser sets 'multipart/form-data' automatically
//         });
//         const result = await response.json();
//         console.log("Upload success:", result);
//     } catch (err) {
//         console.error("Upload failed:", err);
//     }
// }
// Listen for changes
modelSelect === null || modelSelect === void 0 ? void 0 : modelSelect.addEventListener("change", (event) => {
    const selectedElement = event.target;
    currentModel = selectedElement.value;
    AI = selectedElement.value.toUpperCase();
    userNames["ai"] = AI;
    console.log(`Model switched to: ${AI}`);
});
function prepareModelOptions() {
    if (!modelSelect) {
        console.error("CRITICAL ERROR: Could not find 'modelSelect' in the HTML!");
        return;
    }
    console.log("Preparing Models...");
    for (const model of LLMModels) {
        const modelOption = document.createElement("option");
        modelOption.value = model;
        modelOption.textContent = model;
        console.log("Added Model: ", model);
        modelSelect === null || modelSelect === void 0 ? void 0 : modelSelect.appendChild(modelOption);
    }
}
const welcomeScreen = document.getElementById("welcome-screen");
function loadAssetPath(fileName) {
    return __awaiter(this, void 0, void 0, function* () {
        return `http://localhost:3000/api/getAssets/${fileName}`;
    });
}
let currentMessageId;
function selectBranch(sessionId, chatBranch) {
    return __awaiter(this, void 0, void 0, function* () {
        const branchSelectedId = sessionId;
        console.log(`Branch Selected: ${branchSelectedId}`);
        switchToChatMode();
        const messages = yield apiGetMessages(branchSelectedId);
        // console.log(JSON.stringify(messages));
        if (!messagesContainer)
            return;
        messagesContainer.innerHTML = "";
        if (selectedBranch) {
            selectedBranch.classList.remove("active");
        }
        chatBranch.classList.add("active");
        selectedBranch = chatBranch;
        currentSessionId = sessionId;
        if (messages.length != 0 && messages) {
            console.log(`Session Length: ${messages.length}`);
            currentMessageId = messages[messages.length - 1].id;
            for (const msg of messages) {
                //   console.log(`Retrieving Message ID: ${msg.id}`);
                yield appendMessage(msg.text, msg.sender, msg.id, msg.senderName, [], msg.timestamp, true);
            }
        }
        else {
            console.log("Chat Session Empty!");
        }
        scrollToBottom(false);
        getHistoryChats();
        yield handleAttachedFolder();
    });
}
function appendMessage(text_1, sender_1) {
    return __awaiter(this, arguments, void 0, function* (text, sender, messageId = ++currentMessageId, senderName = "", processList = [], timestamp = new Date().toISOString(), retrival = false) {
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
        messageDiv.classList.add("message-bubble");
        messageDiv.classList.add("message", `message-${sender}`);
        if (!retrival) {
            messageDiv.classList.add("latest-bubble");
        }
        else {
            if (currentMessageId === messageId) {
                messageDiv.classList.add("latest-bubble");
            }
        }
        messageDiv.id = messageId.toString();
        const avatarDiv = document.createElement("div");
        avatarDiv.classList.add("message-avatar", `avatar-${sender}`);
        const img = document.createElement("img");
        img.src = yield loadAssetPath(`avatar-${sender}`); // Placeholder Forest Spirit
        img.alt = sender.toUpperCase();
        img.classList.add("custom-avatar");
        avatarDiv.appendChild(img);
        messageDiv.appendChild(avatarDiv);
        /*
          Message Content DIV---
          */
        const contentDiv = document.createElement("div");
        contentDiv.classList.add("message-content");
        addActionsToBubble(contentDiv, sender);
        const messageSenderDiv = document.createElement("div");
        messageSenderDiv.classList.add("message-sender");
        messageSenderDiv.innerHTML = "<span>▼</span>";
        messageSenderDiv.innerText = senderName || userNames[sender];
        contentDiv.appendChild(messageSenderDiv);
        if (sender === "ai" && !retrival) {
            const stepsDiv = addProcessDiv(processList);
            contentDiv.appendChild(stepsDiv);
        }
        const messageText = document.createElement("div");
        messageText.classList.add("message-text");
        if (sender == "ai") {
            const htmlContent = yield renderMarkdown(text);
            messageText.innerHTML = htmlContent;
        }
        else if (sender == "user") {
            messageText.innerText = text;
        }
        contentDiv.appendChild(messageText);
        const timeAppendDiv = document.createElement("div");
        timeAppendDiv.classList.add("message-time");
        timeAppendDiv.innerText = timestamp;
        contentDiv.appendChild(timeAppendDiv);
        messageDiv.appendChild(contentDiv);
        messagesContainer.appendChild(messageDiv);
        // messagesContainer.scrollIntoView({ behavior: 'smooth' });
        return messageText;
    });
}
const actionHandlers = {
    collapse: (bubble) => {
        const content = bubble.querySelector('.message-content');
        if (content) {
            content.classList.toggle('collapsed');
        }
    },
    delete: (bubble) => __awaiter(void 0, void 0, void 0, function* () {
        if (confirm('Delete this message?')) {
            bubble.remove();
            yield deleteMessage(bubble);
        }
    }),
    copy: (bubble) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const contentString = ((_a = bubble.querySelector('.message-text')) === null || _a === void 0 ? void 0 : _a.textContent) || "";
        yield navigator.clipboard.writeText(contentString);
        const btn = bubble.querySelector('#copy-btn');
        console.log("Btn:", btn);
        const originalSvg = btn.innerHTML;
        btn.innerHTML =
            `
      <svg viewBox="0 0 24 24" fill="none" stroke="#4BB543" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;
        btn.style.transform = 'scale(1.2)';
        setTimeout(() => {
            btn.innerHTML = originalSvg;
            btn.style.transform = 'scale(1)';
        }, 1000);
    }),
    pin: (bubble) => {
        const contentClone = bubble.cloneNode(true);
        console.log(contentClone.innerHTML);
        const buttonsInClone = contentClone.querySelector(".message-actions");
        if (buttonsInClone)
            buttonsInClone.remove();
        localStorage.setItem('pinnedMessageHtml', contentClone.innerHTML);
        // 2. Tell Electron to open the window NATIVELY
        // This bypasses the 20-second "window.open" timeout
        if (window.electronAPI) {
            window.electronAPI.openPinnedWindow();
        }
        else {
            console.error("Electron API not detected.");
        }
    },
    edit: (bubble) => {
        enterEditMode(bubble);
    }
};
function enterEditMode(messageBubble) {
    var _a;
    const contentEl = messageBubble.querySelector('.message-text');
    if (!contentEl)
        return;
    const originalText = contentEl.innerText;
    // --- NEW: WIDTH LOCK LOGIC ---
    // 1. Measure the exact width of the content before we hide it
    const currentWidth = contentEl.getBoundingClientRect().width;
    // 2. Measure the bubble's max-available width (to prevent overflow on small screens)
    // We use the parent's width as a safety cap
    const parentWidth = ((_a = messageBubble.parentElement) === null || _a === void 0 ? void 0 : _a.clientWidth) || window.innerWidth;
    // 3. Hide the original content
    contentEl.style.display = 'none';
    // 4. Create Container
    const editContainer = document.createElement('div');
    editContainer.className = 'edit-container';
    // --- APPLY WIDTH ---
    // We set the width to match the original text, but ensure a minimum usability size (e.g. 150px)
    // and ensure it doesn't exceed the screen/parent width.
    const targetWidth = Math.max(currentWidth, 150);
    editContainer.style.width = `${Math.min(targetWidth, parentWidth)}px`;
    editContainer.innerHTML = `
        <textarea class="edit-textarea">${originalText}</textarea>
        <div class="edit-actions">
            <button class="edit-btn cancel-btn">Cancel</button>
            <button class="edit-btn save-btn">Save</button>
        </div>
    `;
    // 5. Insert
    contentEl.insertAdjacentElement('afterend', editContainer);
    // 6. Focus and cursor at end
    const textarea = editContainer.querySelector('textarea');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    // Auto-adjust height to fit text lines
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
    // --- EVENT LISTENERS ---
    editContainer.querySelector('.cancel-btn').addEventListener('click', () => {
        editContainer.remove();
        contentEl.style.display = '';
    });
    editContainer.querySelector('.save-btn').addEventListener('click', () => __awaiter(this, void 0, void 0, function* () {
        const newText = textarea.value.trim();
        if (newText === originalText) {
            editContainer.remove();
            contentEl.style.display = '';
            return;
        }
        // Optimistic update
        contentEl.innerText = newText;
        contentEl.style.display = '';
        editContainer.remove();
        // TODO: Add your DB save logic here
    }));
}
function deleteMessage(bubble) {
    return __awaiter(this, void 0, void 0, function* () {
        const id = bubble.id;
        const url = apiAddress(`deleteMessage/${currentSessionId}/${id}`);
        const response = yield fetch(url, {
            method: 'DELETE',
            headers: {
                "Content-Type": "application/json",
            }
            // NO BODY NEEDED
        });
        const payload = yield response.json();
        if (payload.success) {
            console.log("Message deleted Successfully!");
            bubble.remove(); // Remove from UI
        }
        else {
            console.error("Delete failed:", payload.message);
        }
    });
}
document.addEventListener('click', (event) => {
    console.log("Actually clicked on:", event.target);
    const btn = event.target.closest('.action-btn');
    console.log("Button Selected: ", btn);
    const action = btn === null || btn === void 0 ? void 0 : btn.dataset.action;
    if (!btn) {
        return;
    }
    if (action && actionHandlers[action]) {
        actionHandlers[action](btn.closest('.message-bubble'));
    }
});
function addActionsToBubble(bubble, sender) {
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    if (sender === 'user') {
        actions.innerHTML = `
        <button class="action-btn" title="Edit message" data-action="edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>`;
    }
    actions.innerHTML += `
        <button class="action-btn" title="Copy text" data-action="copy" id="copy-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>

        <button class="action-btn" title="Pin to window" data-action="pin">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="17" x2="12" y2="22"></line>
            <path d="M5 17h14v-2l-1.5-2 .5-4a6 6 0 1 0-12 0l.5 4-1.5 2v2z"></path>
          </svg>
        </button>
        <button class="action-btn collapse-btn" title="Collapse" data-action="collapse">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 14 10 14 10 20"></polyline>
            <polyline points="20 10 14 10 14 4"></polyline>
          </svg>
        </button>
        <button class="action-btn delete-btn" title="Delete" data-action="delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"></path>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
  `;
    bubble.appendChild(actions);
}
function fetchSemanticContext(userPrompt) {
    return __awaiter(this, void 0, void 0, function* () {
        //Vector - Layer 1
        try {
            const response = yield fetch(apiAddress("getSemantic"), {
                method: "POST",
                headers: {
                    "Content-type": "application/json",
                },
                body: JSON.stringify({
                    prompt: userPrompt,
                    sessionId: currentSessionId,
                }),
            });
            if (!response.ok)
                throw new Error("Network response was not ok");
            const data = yield response.json();
            console.log("Response Data Retrieved:\n", data.answer);
            return data.answer;
        }
        catch (error) {
            console.error("Error Calling Server: ", error);
            return [];
        }
    });
}
function cleanJsonString(aiResponse) {
    return aiResponse
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .replace(/'/g, '"') // Handle single quotes
        .trim();
}
function fetchStructuralContext(prompt) {
    return __awaiter(this, void 0, void 0, function* () {
        //CodeMap - Layer 2
        const promptTailored = `
    =============================
    Below is the prompt to Extract the SQL keywords into JSON format:
    ${prompt}`;
        const userPrompt = {
            role: "user",
            content: promptTailored,
        };
        const response = yield callLLM(userPrompt, SLM, "Code Map Context", "CodeMapSP");
        console.log("CodeMap AI Response Pre Cleaning: ", response.response);
        const jsonWords = cleanJsonString(response.response);
        console.log(`AI Response on JSON keywords for CodeMap Retrieval: "${jsonWords}"`);
        try {
            const keywords = JSON.parse(jsonWords);
            const response = yield fetch(apiAddress("searchCodeMap"), {
                method: "POST",
                headers: {
                    "Content-type": "application/json",
                },
                body: JSON.stringify({
                    keywords: keywords,
                }),
            });
            const recieved = yield response.json();
            if (!response.ok)
                throw new Error("Network response was not ok");
            return recieved.answer;
        }
        catch (error) {
            console.log(`Failed to Parse AI Response of JSONs. Error: ${error}`);
            return [];
        }
    });
}
socket.on("discovery_complete", (data) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Agent is Done Discussing Problem!");
    yield streamResponse(data.prompt, data.result, "", "");
}));
function prepareAIPrompt(prompt, codemap, semantic) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Preparing, Cleaning, Constructin for Prompt:\n", prompt);
        // Create the UI bubble
        const codemapString = (codemap === null || codemap === void 0 ? void 0 : codemap.join("\n")) || "";
        const semanticString = (semantic === null || semantic === void 0 ? void 0 : semantic.join("\n")) || "";
        // sessionId,
        // userPrompt,
        // codeMap,
        // semantic,
        // model
        if (featureState.agent_supreme) {
            console.log("Starting Agent Discovery..");
            socket.emit("start_discovery", currentSessionId, prompt, codemapString, semanticString, SLM);
        }
        else {
            yield streamResponse(prompt, "", codemapString, semanticString);
        }
    });
}
function streamResponse(userPrompt, agentProcess, codemap, semantic) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        console.log("═══════════════════════════════════════");
        console.log("🎬 streamResponse CALLED");
        console.log("📝 userPrompt length:", (userPrompt === null || userPrompt === void 0 ? void 0 : userPrompt.length) || 0);
        console.log("🤖 agentProcess length:", (agentProcess === null || agentProcess === void 0 ? void 0 : agentProcess.length) || 0);
        console.log("🗺️ codemap length:", (codemap === null || codemap === void 0 ? void 0 : codemap.length) || 0);
        console.log("🔍 semantic length:", (semantic === null || semantic === void 0 ? void 0 : semantic.length) || 0);
        console.log("═══════════════════════════════════════");
        yield removeProcessDiv(currentProcessDiv);
        const bubbleElement = yield appendMessage("...", "ai");
        const textContainer = bubbleElement.querySelector('.message-text') || bubbleElement;
        let finalUP = `
    # OBJECTIVE
    ${userPrompt}`;
        if (agentProcess) {
            finalUP += `# EXECUTION TRACE
${agentProcess}`;
        }
        else {
            if (codemap) {
                finalUP += `#CODEMAP:\n=========\n${codemap}\n`;
            }
            if (semantic) {
                finalUP += `#SEMANTIC:\n=========\n${semantic}`;
            }
        }
        finalUP += `
  # SYNTHESIS DIRECTIVE
Synthesize a comprehensive response based on the execution trace and codebase context provided.

**Output Constraints:**
- **Technical Depth**: Prioritize completeness over brevity. If the user asks for an implementation or a bug fix, provide the full necessary code and logic.
- **Tone & Style**: Direct, objective, and technical.
- **Clean UI**: 
    - Absolutely no conversational filler (e.g., "Certainly!", "I have analyzed...", "Hope this helps").
    - Start immediately with the headers defined in the Response Structure.
- **File References**: Use the "filepath: line_number" format exclusively for evidence.
- **Code Standards**: 
    - Use GitHub-flavored Markdown with correct language tags.
    - Implement defensive patterns: include error boundaries, null checks, and input validation.
    - [cite_start]Use inline comments for non-obvious logic[cite: 80].

**Synthesize now.**
  `;
        console.log("═══════════════════════════════════════");
        console.log("📤 CONSTRUCTED FINAL PROMPT");
        console.log("📏 Total length:", finalUP.length);
        console.log("📋 First 200 chars:", finalUP.substring(0, 200));
        console.log("═══════════════════════════════════════");
        // Prepare the messages array (System + Context + User)
        const messages = [
            {
                role: "system",
                content: systemPrompt
            },
            ...HISTORY_CHAT_CONTEXT, // Your existing chat history variable
            {
                role: "user",
                content: finalUP
            }
        ];
        console.log("📦 MESSAGES ARRAY PREPARED");
        console.log("   - System prompt length:", (systemPrompt === null || systemPrompt === void 0 ? void 0 : systemPrompt.length) || 0);
        console.log("   - History messages:", (HISTORY_CHAT_CONTEXT === null || HISTORY_CHAT_CONTEXT === void 0 ? void 0 : HISTORY_CHAT_CONTEXT.length) || 0);
        console.log("   - Total messages:", messages.length);
        try {
            const apiUrl = apiAddress("streamChat");
            console.log("🚀 INITIATING FETCH");
            console.log("   - URL:", apiUrl);
            console.log("   - Model:", currentModel);
            const fetchStartTime = performance.now();
            const response = yield fetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: currentModel,
                    messages: messages
                }),
            });
            const fetchEndTime = performance.now();
            console.log(`⏱️ Fetch completed in ${(fetchEndTime - fetchStartTime).toFixed(2)}ms`);
            console.log("📡 RESPONSE RECEIVED");
            console.log("   - Status:", response.status, response.statusText);
            console.log("   - Headers:", Object.fromEntries(response.headers.entries()));
            if (!response.ok) {
                const errorBody = yield response.text();
                console.error(`❌ API FAILED: ${response.status} ${response.statusText}`);
                console.error("Error Details:", errorBody);
                if (response.status === 413) {
                    textContainer.innerHTML = "<b>Error:</b> Prompt is too long for the AI. Truncating history...";
                }
                else {
                    textContainer.innerHTML = `<b>Error ${response.status}:</b> ${errorBody}`;
                }
                return "";
            }
            if (!response.body) {
                console.error("❌ NO RESPONSE BODY");
                throw new Error("ReadableStream not supported.");
            }
            console.log("✅ Response body exists, starting to read stream...");
            let fullText = "";
            let buffer = "";
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let processDone = false;
            while (!processDone) {
                const { done, value } = yield reader.read();
                processDone = done;
                // 1. Decode and add to buffer
                if (value) {
                    buffer += decoder.decode(value, { stream: true });
                }
                // 2. Split by ANY newline (handle \r\n or \n)
                const lines = buffer.split(/\r?\n/);
                // If not done, keep the last partial line in the buffer
                if (!done) {
                    buffer = lines.pop() || "";
                }
                else {
                    const finalChunk = decoder.decode();
                    if (finalChunk) {
                        buffer += finalChunk;
                        // Re-split and process any new lines
                        const finalLines = buffer.split(/\r?\n/);
                        lines.push(...finalLines);
                    }
                    // Now clear buffer since stream is truly finished
                    buffer = "";
                }
                for (const line of lines) {
                    // console.log(`[LINE] "${line}" | trimmed: "${line.trim()}"`);
                    const trimmed = line.trim();
                    // More robust heartbeat detection
                    if (!trimmed || trimmed.startsWith(':')) {
                        // console.log(`[SKIP] Heartbeat/empty: "${trimmed}"`);
                        continue;
                    }
                    // Allow for 'data:' with no space, or extra whitespace
                    const dataMatch = trimmed.match(/^data:\s*(.+)$/);
                    if (!dataMatch) {
                        // console.log(`[SKIP] Not a data line: "${trimmed}"`);
                        continue;
                    }
                    const jsonStr = dataMatch[1].trim();
                    if (jsonStr === "[DONE]")
                        continue;
                    try {
                        const json = JSON.parse(jsonStr);
                        const delta = (_b = (_a = json.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.delta;
                        // CAPTURE BOTH: DeepSeek uses reasoning_content for thinking
                        const text = (delta === null || delta === void 0 ? void 0 : delta.content) || (delta === null || delta === void 0 ? void 0 : delta.reasoning_content) || "";
                        if (text) {
                            fullText += text;
                            // Immediate UI update
                            textContainer.innerHTML = yield renderMarkdown(fullText);
                        }
                    }
                    catch (e) {
                        console.log(`Error: ${e}`);
                        // Ignore partial JSON errors during streaming
                    }
                }
            }
            // 3. FINAL VALIDATION
            if (fullText.length === 0 && buffer.length > 0) {
                // Emergency fallback: If the AI didn't follow SSE format but sent text
                fullText = buffer;
                textContainer.innerHTML = yield renderMarkdown(fullText);
            }
            yield notifyNewMessage(fullText);
            console.log("Final Response Length:", fullText.length);
            return fullText;
        }
        catch (error) {
            console.error("Error: ", error);
            return "";
        }
    });
}
let currentProcessDiv;
// 4. The Logic
function handleMessage() {
    return __awaiter(this, arguments, void 0, function* (input = "") {
        // Safety check: if input is missing, stop.
        let text = input;
        if (!text) {
            console.log("Enter");
            if (!userPromptInput)
                return;
            if (currentPage == "Home") {
                yield createNewBranch();
            }
            //TODO: needs to handle that the append message method.
            //TODO: handle the size adjusting buttons for the user input.
            //todo: i want to add like minimizing of the user input to a button.
            text = userPromptInput.value.trim();
            if (text === "")
                return;
            userPromptInput.value = "";
        }
        const userMessage = {
            role: "user",
            content: text,
        };
        const ctx = {
            userInput: text,
        };
        HISTORY_CHAT_CONTEXT.push(userMessage);
        if (!input) {
            yield appendMessage(text, "user", -1);
        }
        const stepList = [
            {
                id: "title",
                icon: "fa-heading",
                label: "Generating Branch Title...",
                method: (ctx) => __awaiter(this, void 0, void 0, function* () {
                    if (needSessionTitle[currentSessionId]) {
                        console.log("Need of Session Title");
                        needSessionTitle[currentSessionId].innerText = yield getBranchTitle(text);
                        ctx.chatTitle = needSessionTitle[currentSessionId].innerText;
                        yield apiUpdateSession(currentSessionId, needSessionTitle[currentSessionId].innerText);
                        delete needSessionTitle[currentSessionId];
                    }
                }),
            },
        ];
        if (featureState.enhance_prompt) {
            stepList.push({
                id: "enhance",
                icon: "fa-sparkles",
                label: "Enhancing Prompt...",
                method: (ctx) => __awaiter(this, void 0, void 0, function* () {
                    ctx.enhancedPrompt = yield enhancePrompt(text);
                }),
            });
        }
        if (foldersAbsPath.length !== 0) {
            if (featureState.use_codemap) {
                stepList.push({
                    id: "codemap",
                    icon: "fa-sitemap",
                    label: "Mapping Codebase...",
                    method: (ctx) => __awaiter(this, void 0, void 0, function* () {
                        ctx.codeMapData = yield fetchStructuralContext(text);
                        console.log(`Code Map Chunks Loading Successfull! Chunks Loaded: ${ctx.codeMapData.length}`);
                    }),
                });
            }
            if (featureState.use_semantic) {
                stepList.push({
                    id: "semantic",
                    icon: "fa-search",
                    label: "Semantic Search...",
                    method: (ctx) => __awaiter(this, void 0, void 0, function* () {
                        ctx.semanticResults = yield fetchSemanticContext(text);
                        console.log(`Semantics Chunks Loading Successfull! Chunks Loaded: ${ctx.semanticResults.length}`);
                    }),
                });
            }
        }
        const processDiv = yield appendMessage("", "ai", -1, "", stepList);
        currentProcessDiv = processDiv;
        yield apiSaveMessage(currentSessionId, text, "user", "You");
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
                console.log(`Currently Working on ${step.id}...`);
                updateStatusStep(step.id, "active");
                yield step.method(ctx);
                updateStatusStep(step.id, "completed");
                console.log(`${step.id} Step Finished!`);
            }
        }
        console.log("Sending Prompt with History: ", HISTORY_CHAT_CONTEXT);
        yield prepareAIPrompt(ctx.enhancedPrompt || ctx.userInput, ctx.codeMapData || [], ctx.semanticResults || []);
    });
}
function removeProcessDiv(targetElement) {
    return __awaiter(this, void 0, void 0, function* () {
        if (targetElement) {
            // FIX: Find the actual message bubble (parent with class 'message')
            const targetBubble = targetElement.closest('.message');
            if (!targetBubble) {
                console.warn("Could not find parent message bubble");
                return;
            }
            // Smooth fade out
            targetBubble.style.transition = "opacity 0.3s ease, transform 0.3s ease";
            targetBubble.style.opacity = "0";
            targetBubble.style.transform = "translateY(10px)";
            setTimeout(() => {
                targetBubble.remove();
                console.log("Processing bubble removed successfully.");
            }, 300);
        }
    });
}
sendButton === null || sendButton === void 0 ? void 0 : sendButton.addEventListener("click", () => __awaiter(void 0, void 0, void 0, function* () {
    yield handleMessage();
}));
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
            body: JSON.stringify({ id: sessionId }),
        });
    });
}
function apiSaveMessage(sessionId, text, sender, senderName) {
    return __awaiter(this, void 0, void 0, function* () {
        yield fetch(`${API_URL}/sessions/${sessionId}/messages/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: text, sender: sender, name: senderName }),
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
            id: msg.id,
            text: msg.content,
            sender: msg.sender,
            senderName: msg.name,
            timestamp: msg.timestamp,
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
            messagesContainer.innerHTML = "";
        const chatBranch = yield loadBranchHtml(chatId, true);
        yield selectBranch(chatId, chatBranch);
    });
}
let branchCount;
const chatBranches = document.querySelector("#chatBranches");
function formatTimestamp(isoString) {
    const date = new Date(isoString);
    // Check if date is valid
    if (isNaN(date.getTime()))
        return "";
    return date.toLocaleString("en-US", {
        month: "short", // "Oct"
        day: "numeric", // "12"
        hour: "numeric", // "2"
        minute: "2-digit", // "30"
        hour12: true, // "PM"
    });
}
let selectedBranch;
function createAxeIcon() {
    return __awaiter(this, void 0, void 0, function* () {
        const img = document.createElement("img");
        img.src = yield loadAssetPath("axe");
        img.alt = "Delete Branch";
        img.classList.add("delete-icon");
        return img;
    });
}
const needSessionTitle = {};
function loadSidebar() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Loading Sidebar:");
        const response = yield apiGetSessions();
        console.log(response);
        if (chatBranches != null) {
            chatBranches.innerHTML = "";
        }
        branchCount = response.length;
        console.log(branchCount);
        for (let i = 0; i < branchCount; i++) {
            const branch = response[i];
            const title = branch["title"];
            const date = formatTimestamp(branch["created_at"]);
            const preview = branch["chat_preview"];
            yield loadBranchHtml(branch["id"], false, title, date, preview);
        }
    });
}
function loadBranchHtml(sessionId_1) {
    return __awaiter(this, arguments, void 0, function* (sessionId, newChat = false, title = "New Chat", date = formatTimestamp(new Date().toISOString()), preview = "No Preview") {
        console.log(`Title: ${title}, Date: ${date}, Preview: ${preview}`);
        const chatBranch = document.createElement("div");
        chatBranch.classList.add("chat-branch");
        // chatBranch.setAttribute("data-id", i.toString());
        const deleteBranch = yield createAxeIcon();
        deleteBranch.addEventListener("click", (event) => __awaiter(this, void 0, void 0, function* () {
            event.stopPropagation();
            chatBranches === null || chatBranches === void 0 ? void 0 : chatBranches.removeChild(chatBranch);
            try {
                yield fetch(`${API_URL}/sessions/${sessionId}/`, {
                    method: "DELETE",
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
        chatBranch.addEventListener("click", () => __awaiter(this, void 0, void 0, function* () {
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
    currentPage = "Chat";
    if (welcomeScreen) {
        welcomeScreen.style.display = "none";
    }
    // Show the messages container
    if (messagesContainer) {
        messagesContainer.style.display = "flex"; // Use 'flex' to keep your layout alignment
    }
    document.body.classList.add("chat-mode");
}
function switchToHomeMode() {
    currentPage = "Home";
    if (messagesContainer) {
        messagesContainer.style.display = "none";
        messagesContainer.innerHTML = ""; // Optional: Clear old messages from screen
    }
    if (welcomeScreen) {
        welcomeScreen.style.display = "flex";
    }
    if (selectedBranch) {
        selectedBranch.classList.remove("active");
    }
    document.body.classList.remove("chat-mode");
}
function handleAttachedFolder() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch(apiAddress("selectBranch"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    branchId: currentSessionId,
                }),
            });
            const answer = yield response.json();
            if (answer.success) {
                foldersAbsPath = answer.paths;
                if (fileCountBadge) {
                    fileCountBadge.textContent = answer.paths.length.toString();
                }
                console.log(`Chat ${currentSessionId}'s Folders Attach Count: ${foldersAbsPath.length}`);
                if (foldersAbsPath.length !== 0) {
                    foldersAbsPath.forEach((path) => {
                        console.log(path);
                    });
                }
            }
            else {
                console.error("Attachment Retrieval Failed! Error: ", answer.error);
            }
        }
        catch (error) {
            console.error("API Error Fetching Attached Folder: ", error);
        }
    });
}
newChat === null || newChat === void 0 ? void 0 : newChat.addEventListener("click", () => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Create a new Chat");
    yield createNewBranch();
}));
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
                content: item.text,
            };
        });
        HISTORY_CHAT_CONTEXT = cleanedData;
    });
}
function apiUpdateSession(sessionId, title, preview) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`Updating session ${sessionId}...`);
        // Create the body object dynamically
        const bodyData = { title: title || "Chat Session", chat_preview: preview || "Chat Preview" };
        try {
            const response = yield fetch(`${API_URL}/sessions/${sessionId}`, {
                method: "PATCH", // <--- matches the @app.patch in Python
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyData),
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
        `,
        };
        return (yield callLLM(userInput, SLM, "Prompt Enhancing", "PromptSP", HISTORY_CHAT_CONTEXT))
            .response;
        // 2. Start the Request (Talk to Local Server)
    });
}
function callLLM(prompt_1, model_1, taskName_1, fileName_1) {
    return __awaiter(this, arguments, void 0, function* (prompt, model, taskName, fileName, history = []) {
        try {
            const response = yield fetch(apiAddress("chat"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    // Use a 'smart' model for enhancement, or just use currentModel
                    model: model,
                    messages: prompt,
                    systemPrompt: fileName,
                    history: history
                }),
            });
            const result = yield response.json();
            console.log(`${taskName} completed in ${result.timeTaken} milliseconds. Result: \n${result.response}`);
            return result;
        }
        catch (error) {
            console.error(`${taskName} failed. Error:${error}`);
            // Fallback: If enhancement fails, just use the user's original prompt
            return {
                response: "",
                timeTaken: "",
            };
        }
    });
}
function getBranchTitle(prompt) {
    return __awaiter(this, void 0, void 0, function* () {
        const userInput = {
            role: "user",
            content: `
        ---------------------------------
        THE PROMPT TO TURN INTO THE TITLE: "${prompt}"`,
        };
        return (yield callLLM(userInput, SLM, "Get Branch Title", "ChatTitleSP"))
            .response;
    });
}
socket.on("agent-log", (data) => {
    if (!currentProcessDiv)
        return;
    // 1. Setup the main container styles once
    currentProcessDiv.style.fontFamily = "var(--font-primary)";
    currentProcessDiv.style.backgroundColor = "var(--color-sand)";
    currentProcessDiv.classList.add("agent-process-active");
    // 2. Find or Create the Loop Box (The grouping for Iteration #X)
    let loopBox = currentProcessDiv.querySelector(`[data-loop-id="${data.loop}"]`);
    if (!loopBox) {
        loopBox = document.createElement("div");
        loopBox.className = "agent-loop-box";
        loopBox.setAttribute("data-loop-id", data.loop.toString());
        loopBox.innerHTML = `<div class="loop-title">Iteration Loop ${data.loop}</div>`;
        currentProcessDiv.appendChild(loopBox);
    }
    // 3. Create the Event Card
    const card = document.createElement("div");
    // Assign classes based on status and agent type
    card.className = `process-card status-${data.status} agent-${data.agent.toLowerCase().replace(/\s/g, '-')}`;
    // Format the message: Bold headers and handle newlines
    const formattedMsg = data.message
        .trim()
        .replace(/\n/g, "<br>")
        .replace(/(A\.|B\.|Parsed Instruction:|Manager Response:)/g, "<strong>$1</strong>");
    card.innerHTML = `
    <div class="card-header">
      <span class="badge-agent">${data.agent}</span>
      <span class="badge-stage">${data.stage}</span>
    </div>
    <div class="card-content">${formattedMsg}</div>
  `;
    loopBox.appendChild(card);
    // 4. Smooth scroll to the newest activity
    currentProcessDiv.scrollTo({
        top: currentProcessDiv.scrollHeight,
        behavior: 'smooth'
    });
});
