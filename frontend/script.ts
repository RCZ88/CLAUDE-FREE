// 1. Import 'Marked' (Capital M)
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";


// import { io, Socket } from "socket.io-client";

// import 'highlight.js/styles/github-dark.css';


// 2. WE DRAW THE CONTAINER
// The variable 'puter' isn't just the AI; it's a wrapper object.
interface ChatMessage {
  role: "system" | "user" | "assistant"; // Restrict to these 3 specific values
  content: string;
}

export interface IElectronAPI {
  selectFolder: () => Promise<string | null>;
  openPinnedWindow: () => void;
}
declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}


function apiAddress(address: string): string {
  return `http://localhost:3000/api/${address}`;
}
const markdown = new Marked(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language }).value;
    },
  })
);

// 3. Use your instance to parse
export async function renderMarkdown(markdownText: string): Promise<string> {
  // Note: In v11+, .parse() can return a Promise, so it's safer to await it
  // or cast it if you are sure it's synchronous.
  return markdown.parse(markdownText) as string;
}

let systemPrompt: string = "";

// 2. Function to load the text file (Run this when page loads)
async function loadTxtFiles(fileName: string) {
  try {
    const response = await fetch(apiAddress("getSystemPrompt"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fileName: fileName
      })
    });

    console.log("System Prompt loaded!", systemPrompt.length, "chars");
    return (await response.json()).prompt;
  } catch (error) {
    console.error("Could not load prompt guide:", error);
    // Fallback if file fails
  }
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
let currentModel: string = LLMModels[0];

let currentSessionId: string = "";

// @ts-expect-error - 'io' is provided by the script tag above
const socket = io("http://localhost:3000", {
  transports: ["websocket"], // Force it to use WebSocket immediately
  upgrade: false             // Don't try to "upgrade" from polling
});

type SenderType = "user" | "ai";
type PageLoc = "Home" | "Chat";

const sendButton = document.querySelector<HTMLButtonElement>("#sendBtn");
const userPromptInput =
  document.querySelector<HTMLTextAreaElement>("#messageInput");
const inputActions = document.querySelector<HTMLElement>(".input-actions");
const messagesContainer =
  document.querySelector<HTMLDivElement>("#messagesContainer");
const modelSelect = document.querySelector<HTMLSelectElement>("#modelDropdown");
const newChat = document.querySelector<HTMLButtonElement>("#newChatBtn");
const attachFolderBtn =
  document.querySelector<HTMLButtonElement>("#attachFolderBtn");
const toggleSidebar =
  document.querySelector<HTMLButtonElement>("#toggleSidebar");
const homePage = document.querySelector<HTMLDivElement>("#logoTitle");
const sidebarContainer = document.querySelector<HTMLElement>(".container");
const scrollButton =
  document.querySelector<HTMLButtonElement>("#scrollToBottomBtn");
const expandChatInput = document.querySelector<HTMLButtonElement>("#heightUp");
const shrinkChatInput =
  document.querySelector<HTMLButtonElement>("#heightDown");
const openDrawerButton =
  document.querySelector<HTMLButtonElement>("#openDrawerBtn");
const folderModalOverlay = document.querySelector<HTMLDivElement>(
  "#folderModalOverlay"
);
const closeModalBtn =
  document.querySelector<HTMLButtonElement>("#closeModalBtn");
const folderList = document.querySelector<HTMLUListElement>("#folderList");
const emptyState = document.querySelector<HTMLDivElement>("#emptyFolderState");
const fileCountBadge =
  document.querySelector<HTMLSpanElement>("#fileCountBadge");
const modalAddFolderBtn =
  document.querySelector<HTMLButtonElement>("#modalAddFolderBtn");
const toggleViewSettings = document.querySelector<HTMLDivElement>("#setting-show-toggle");
const optimizationSettings = document.querySelector<HTMLDivElement>("#feature-toggles-container");
const chevron = document.querySelector<HTMLElement>("#toggle-chevron");

// Initialize features only ONCE when the app loads
initFeatures();

toggleViewSettings?.addEventListener("click", () => {
  if (optimizationSettings && chevron) {
    // Toggle the 'collapsed' class
    const isCollapsed = optimizationSettings.classList.toggle("collapsed");

    // Rotate the chevron
    chevron.classList.toggle("chevron-rotate", isCollapsed);

    console.log(isCollapsed ? "Panel Closed" : "Panel Opened");
  }
});

openDrawerButton?.addEventListener("click", async () => {
  folderModalOverlay?.classList.add("active");
  await renderFolders();
});
closeModalBtn?.addEventListener("click", () => {
  folderModalOverlay?.classList.remove("active");
});
folderModalOverlay?.addEventListener("click", (e) => {
  if (e.target == folderModalOverlay) {
    folderModalOverlay?.classList.remove("active");
  }
});

modalAddFolderBtn?.addEventListener("click", async () => {
  const success: boolean = await selectAttachment();
  if (success) {
    await handleAttachedFolder();
    await renderFolders();
  }
});

messagesContainer?.addEventListener("click", (event: MouseEvent) => {
  const target = event.target as HTMLElement;

  // Check if the user clicked on the sender's name
  if (target.classList.contains("message-sender")) {
    // Find the parent 'message-content' to toggle the collapsed state
    const contentDiv = target.closest(".message-content");
    if (contentDiv) {
      contentDiv.classList.toggle("collapsed");
    }
  }
});

let foldersAbsPath: string[] = [];

async function renderFolders() {
  if (folderList) {
    folderList.innerHTML = "";
  } else {
    console.error(`Folder List Element not found`);
    return;
  }

  if (foldersAbsPath.length === 0) {
    emptyState?.classList.remove("hidden");
  } else {
    emptyState?.classList.add("hidden");
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
      deleteFolderButton.addEventListener("click", async () => {
        await removeAttachment(folderPath);
        await handleAttachedFolder();
        await renderFolders();
      });
      li.appendChild(deleteFolderButton);
      //todo: create the remove folder button.
      folderList.appendChild(li);
    });
  }
}

async function removeAttachment(path: string) {
  const payload = await fetch(apiAddress("removeWatchList"), {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path: path,
      sessionId: currentSessionId,
    }),
  });
  await payload.json();
}



function scrollToBottom(smooth: boolean) {
  if (messagesContainer) {
    console.log(`scrolling!`);
    if (smooth) {
      messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: "smooth",
      });
    } else {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }
}

const HEIGHT_STEPS = [60, 120, 200, 350];

const username = "You";
let currentPage: PageLoc = "Home";
let AI = currentModel.toUpperCase();

const userNames: Record<string, string> = {
  user: username,
  ai: AI,
};

const contextLengthMax = 10;
let HISTORY_CHAT_CONTEXT: ChatMessage[] = [];

// Select the dropdown

// Tell TS that the 'marked' library exists

document.addEventListener("DOMContentLoaded", async () => {
  try {
    console.log("1. Starting...");
    switchToHomeMode();

    // If this function has a bug, the code dies here
    prepareModelOptions();
    console.log("2. Options prepared.");

    systemPrompt = await loadTxtFiles("SystemCore");
    console.log("3. System Prompt Loaded.");

    await loadSidebar();
    console.log("4. Sidebar loaded!");
  } catch (error) {
    // THIS is what you need to see
    console.error("CRITICAL ERROR DURING STARTUP:", error);
  }
});

homePage?.addEventListener("click", () => switchToHomeMode());

toggleSidebar?.addEventListener("click", () => {
  sidebarContainer?.classList.toggle("sidebar-hidden");
  const icon = toggleSidebar.querySelector("i");
  if (icon) {
    if (sidebarContainer?.classList.contains("sidebar-hidden")) {
      icon.classList.replace("fa-bars", "fa-arrow-right");
    } else {
      icon.classList.replace("fa-arrow-right", "fa-bars");
    }
  }
});
scrollButton?.addEventListener("click", () => {
  scrollToBottom(true);
});

messagesContainer?.addEventListener("scroll", () => {
  const threshold = 300;
  const distanceFromBottom =
    messagesContainer.scrollHeight -
    messagesContainer.scrollTop -
    messagesContainer.clientHeight;

  if (scrollButton) {
    if (distanceFromBottom > threshold) {
      scrollButton.classList.add("visible");
    } else {
      scrollButton.classList.remove("visible");
      scrollButton.classList.remove("has-new");
    }
  }
});

async function notifyNewMessage(fullResponse: string) {
  const aiMessage: ChatMessage = {
    role: "assistant",
    content: fullResponse,
  };
  await apiSaveMessage(currentSessionId, fullResponse, "ai", currentModel);
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
}

let manualMinStepIndex = 0;
function adjustInputHeight() {
  if (!userPromptInput || !inputActions) return;

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
  } else {
    userPromptInput.style.overflowY = "hidden";
  }
}
userPromptInput?.addEventListener("input", adjustInputHeight);

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
} else {
  console.log("Buttons failed to load!");
}

type featuresId = "use_codemap" | "use_semantic" | "agent_supreme" | "enhance_prompt";


interface ChatFeatures {
  /*
  {
      "id": "use_semantic",
      "label": "Semantic Leads",
      "description": "Includes high-level logic descriptions to help the AI navigate code intent.",
      "enabled": false
    },
  */
  id: featuresId,
  label: string,
  description: string,
  enabled: boolean
}
const featureState: Record<featuresId, boolean> = {
  enhance_prompt: false,
  use_codemap: false,
  use_semantic: false,
  agent_supreme: false
};
async function initFeatures() {
  try {
    const response = await fetch('./chatFeatures.json');
    const data = await response.json();
    const container = document.getElementById('feature-toggles-container');

    data.features.forEach((feature: ChatFeatures) => {
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
      container?.appendChild(item);

      const input = item.querySelector<HTMLInputElement>('input');
      input?.addEventListener('change', (e: Event) => {
        const target = e.target as HTMLInputElement;
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
  } catch (err) {
    console.error("Feature initialization failed", err);
  }
}
async function updateFeatureJson(id: string, enabled: boolean) {
  const response = await fetch(apiAddress("updateFeatureState"), {
    method: "POST",
    headers: {
      "Content-type": "application/json",
    },
    body: JSON.stringify({
      featureId: id, enabled: enabled
    })
  });
  const payload = await response.json();
  if (!payload.success) {
    console.error("Failed to Update Json, error: ", payload.error);
    return;
  }
  console.log("Success Updating Feature JSON!");
}

function featureStateToString(state: Record<featuresId, boolean>): string {
  let result = "";
  const keys = Object.keys(state) as Array<featuresId>; // Cast to featuresId array
  for (const key of keys) {
    result += `${key}: ${state[key]}, `;
  }
  return result.slice(0, -2); // Remove trailing comma and space
}

// Helper to auto-toggle required settings
function forceToggle(id: featuresId, shouldBeActive: boolean) {
  const checkbox = document.getElementById(id) as HTMLInputElement | null;
  if (checkbox && checkbox.checked !== shouldBeActive) {
    checkbox.checked = shouldBeActive;
    featureState[id] = shouldBeActive;
    updateFeatureJson(id, shouldBeActive);

    // Visual feedback
    const parent = checkbox.closest('.feature-item') as HTMLElement;
    if (parent) {
      parent.style.backgroundColor = shouldBeActive
        ? 'rgba(90, 140, 90, 0.2)' // Light green pulse for enabling
        : 'rgba(193, 124, 84, 0.2)'; // Light clay/red pulse for disabling

      setTimeout(() => parent.style.backgroundColor = 'transparent', 600);
    }
  }
}


async function handleFolderSelection(): Promise<string | null> {
  try {
    // 1. Check if API exists first
    if (!window.electronAPI) {
      console.warn("Electron API not detected. Are you running in a browser?");
      return null;
    }

    // 2. Open the dialog
    const absolutePath = await window.electronAPI.selectFolder();

    // 3. Handle Cancellation
    // If the user clicks Cancel, 'absolutePath' will usually be null, undefined, or ""
    if (!absolutePath) {
      console.log("User cancelled folder selection.");
      return null; // Return null to indicate cancellation
    }

    console.log(`Selected Path: ${absolutePath}`);
    return absolutePath;
  } catch (error) {
    console.error("Failed to open folder picker:", error);
    return null;
  }
}

// --- 1. CLICK HANDLERS ---
if (attachFolderBtn) {
  attachFolderBtn.addEventListener("click", async () => {
    const success: boolean = await selectAttachment();
    if (success) {
      console.log("now handle attach folder");
      await handleAttachedFolder();
      // await renderFolders();
    }
  });
}

async function selectAttachment(): Promise<boolean> {
  console.log("Add Folder Clicked!");
  const path = await handleFolderSelection();
  if (path) {
    console.log("Path Selected: ", path);
    const response = await fetch(apiAddress("addWatchList"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        folderPath: path,
        currentSession: currentSessionId,
      }),
    });
    if (!response.ok) throw new Error("Network response was not ok");
    const result = await response.json();
    console.log(JSON.stringify(result));
    return true;
  }
  return false;
}

interface ProcessingContext {
  userInput: string;
  enhancedPrompt?: string; // Result from enhancePrompt()
  semanticResults?: string[]; // Result from semanticSearch()
  codeMapData?: string[]; // Result from codeMap()
  chatTitle?: string; // Result from generateTitle()
}

interface ProcessStep {
  id: string;
  label: string;
  icon: string; // FontAwesome class like 'fa-search'
  method?: (ctx: ProcessingContext) => Promise<void>;
}

function addProcessDiv(stepList: ProcessStep[]) {
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

function updateStatusStep(stepId: string, state: "active" | "completed") {
  const el = document.getElementById(`step-${stepId}`);
  if (!el) return;

  const iconContainer =
    el.querySelector("i") || el.querySelector(".dot-loader");
  if (!iconContainer) return;

  const labelSpan = el.querySelector(":scope > span") as HTMLElement | null;

  // Now TypeScript will allow .innerText or .textContent
  const currentText = labelSpan?.innerText ?? "";

  el.classList.remove("active", "completed");
  el.classList.add(state);

  if (state === "active") {
    // Replace icon with pulsing dots
    el.innerHTML = `
            <div class="dot-loader"><span></span><span></span><span></span></div>
            <span>${currentText}</span>
        `;
  } else if (state === "completed") {
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
modelSelect?.addEventListener("change", (event) => {
  const selectedElement = event.target as HTMLSelectElement;
  currentModel = selectedElement.value;
  AI = selectedElement.value.toUpperCase();
  userNames["ai"] = AI;
  console.log(`Model switched to: ${AI}`);
});

function prepareModelOptions(): void {
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
    modelSelect?.appendChild(modelOption);
  }
}

const welcomeScreen = document.getElementById("welcome-screen");


async function loadAssetPath(fileName: string): Promise<string> {
  return `http://localhost:3000/api/getAssets/${fileName}`;
}
let currentMessageId: number;
async function selectBranch(sessionId: string, chatBranch: HTMLDivElement) {
  const branchSelectedId = sessionId;
  console.log(`Branch Selected: ${branchSelectedId}`);
  switchToChatMode();

  const messages = await apiGetMessages(branchSelectedId);
  // console.log(JSON.stringify(messages));
  if (!messagesContainer) return;
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
      await appendMessage(msg.text, msg.sender, msg.id, msg.senderName, [], msg.timestamp, true);
    }
  } else {
    console.log("Chat Session Empty!");
  }
  scrollToBottom(false);
  getHistoryChats();
  await handleAttachedFolder();
}

async function appendMessage(
  text: string,
  sender: SenderType,
  messageId: number = ++currentMessageId,
  senderName: string = "",
  processList: ProcessStep[] = [],
  timestamp: string = new Date().toISOString(),
  retrival = false
): Promise<HTMLDivElement> {

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
  } else {
    if (currentMessageId === messageId) {
      messageDiv.classList.add("latest-bubble");
    }
  }
  messageDiv.id = messageId.toString();



  const avatarDiv = document.createElement("div");
  avatarDiv.classList.add("message-avatar", `avatar-${sender}`);

  const img = document.createElement("img");
  img.src = await loadAssetPath(`avatar-${sender}`); // Placeholder Forest Spirit
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
    const htmlContent = await renderMarkdown(text);
    messageText.innerHTML = htmlContent;
  } else if (sender == "user") {
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
}



interface MessageAction {
  type: 'collapse' | 'delete' | 'copy' | 'pin' | 'edit';
  handler: (bubble: HTMLElement) => void;
}

const actionHandlers: Record<MessageAction['type'], MessageAction['handler']> = {
  collapse: (bubble) => {
    const content = bubble.querySelector('.message-content');
    if (content) {
      content.classList.toggle('collapsed');
    }
  },
  delete: async (bubble) => {
    if (confirm('Delete this message?')) {
      bubble.remove();
      await deleteMessage(bubble);
    }
  },
  copy: async (bubble) => {
    const contentString = bubble.querySelector('.message-text')?.textContent || "";
    await navigator.clipboard.writeText(contentString);

    const btn = (bubble as HTMLElement).querySelector('#copy-btn') as HTMLButtonElement;
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
  },
  pin: (bubble) => {
    const contentClone = bubble.cloneNode(true) as HTMLElement;
    console.log(contentClone.innerHTML);
    const buttonsInClone = contentClone.querySelector(".message-actions");
    if (buttonsInClone) buttonsInClone.remove();

    localStorage.setItem('pinnedMessageHtml', contentClone.innerHTML);

    // 2. Tell Electron to open the window NATIVELY
    // This bypasses the 20-second "window.open" timeout
    if (window.electronAPI) {
      window.electronAPI.openPinnedWindow();
    } else {
      console.error("Electron API not detected.");
    }
  },
  edit: (bubble) => {
    enterEditMode(bubble);
  }

};

function enterEditMode(messageBubble: HTMLElement) {
  const contentEl = messageBubble.querySelector('.message-text') as HTMLElement;
  if (!contentEl) return;

  const originalText = contentEl.innerText;

  // --- NEW: WIDTH LOCK LOGIC ---
  // 1. Measure the exact width of the content before we hide it
  const currentWidth = contentEl.getBoundingClientRect().width;

  // 2. Measure the bubble's max-available width (to prevent overflow on small screens)
  // We use the parent's width as a safety cap
  const parentWidth = messageBubble.parentElement?.clientWidth || window.innerWidth;

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
  const textarea = editContainer.querySelector('textarea') as HTMLTextAreaElement;
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  // Auto-adjust height to fit text lines
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';

  // --- EVENT LISTENERS ---

  editContainer.querySelector('.cancel-btn')!.addEventListener('click', () => {
    editContainer.remove();
    contentEl.style.display = '';
  });

  editContainer.querySelector('.save-btn')!.addEventListener('click', async () => {
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
  });
}




async function deleteMessage(bubble: HTMLElement): Promise<void> {
  const id = bubble.id;
  const url = apiAddress(`deleteMessage/${currentSessionId}/${id}`);

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      "Content-Type": "application/json",
    }
    // NO BODY NEEDED
  });

  const payload = await response.json();

  if (payload.success) {
    console.log("Message deleted Successfully!");
    bubble.remove(); // Remove from UI
  } else {
    console.error("Delete failed:", payload.message);
  }
}

document.addEventListener('click', (event) => {
  console.log("Actually clicked on:", event.target);
  const btn = (event.target as HTMLElement).closest('.action-btn') as HTMLElement | null;
  console.log("Button Selected: ", btn);
  const action = (btn as HTMLElement)?.dataset.action as MessageAction['type'];
  if (!btn) {
    return;
  }
  if (action && actionHandlers[action]) {
    actionHandlers[action](btn.closest('.message-bubble')!);
  }
});


function addActionsToBubble(bubble: HTMLDivElement, sender: SenderType) {
  const actions = document.createElement('div');
  actions.className = 'message-actions';
  if (sender === 'user') {
    actions.innerHTML = `
        <button class="action-btn" title="Edit message" data-action="edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>`
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




async function fetchSemanticContext(userPrompt: string): Promise<string[]> {
  //Vector - Layer 1
  try {
    const response = await fetch(apiAddress("getSemantic"), {
      method: "POST",
      headers: {
        "Content-type": "application/json",
      },
      body: JSON.stringify({
        prompt: userPrompt,
        sessionId: currentSessionId,
      }),
    });
    if (!response.ok) throw new Error("Network response was not ok");

    const data = await response.json();
    console.log("Response Data Retrieved:\n", data.answer);
    return data.answer;
  } catch (error) {
    console.error("Error Calling Server: ", error);
    return [];
  }
}

interface llmResponse {
  response: string;
  timeTaken: string;
}

function cleanJsonString(aiResponse: string) {
  return aiResponse
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/'/g, '"') // Handle single quotes
    .trim();
}
async function fetchStructuralContext(prompt: string): Promise<string[]> {
  //CodeMap - Layer 2
  const promptTailored = `
    =============================
    Below is the prompt to Extract the SQL keywords into JSON format:
    ${prompt}`;
  const userPrompt: ChatMessage = {
    role: "user",
    content: promptTailored,
  };
  const response = await callLLM(
    userPrompt,
    SLM,
    "Code Map Context",
    "CodeMapSP"
  );
  console.log("CodeMap AI Response Pre Cleaning: ", response.response);
  const jsonWords = cleanJsonString(response.response);
  console.log(
    `AI Response on JSON keywords for CodeMap Retrieval: "${jsonWords}"`
  );
  try {
    const keywords = JSON.parse(jsonWords);
    const response = await fetch(apiAddress("searchCodeMap"), {
      method: "POST",
      headers: {
        "Content-type": "application/json",
      },
      body: JSON.stringify({
        keywords: keywords,
      }),
    });
    const recieved = await response.json();
    if (!response.ok) throw new Error("Network response was not ok");
    return recieved.answer;
  } catch (error) {
    console.log(`Failed to Parse AI Response of JSONs. Error: ${error}`);
    return [];
  }
}

socket.on("discovery_complete", async (data: { result: string, prompt: string }) => {
  console.log("Agent is Done Discussing Problem!");
  await streamResponse(data.prompt, data.result, "", "");
});

async function prepareAIPrompt(
  prompt: string,
  codemap: string[],
  semantic: string[]
) {
  console.log("Preparing, Cleaning, Constructin for Prompt:\n", prompt)

  // Create the UI bubble


  const codemapString = codemap?.join("\n") || "";
  const semanticString = semantic?.join("\n") || "";



  // sessionId,
  // userPrompt,
  // codeMap,
  // semantic,
  // model

  if (featureState.agent_supreme) {
    console.log("Starting Agent Discovery..")
    socket.emit("start_discovery", currentSessionId, prompt, codemapString, semanticString, SLM);
  } else {
    await streamResponse(prompt, "", codemapString, semanticString);
  }


}



async function streamResponse(userPrompt: string, agentProcess: string, codemap: string, semantic: string) {
  console.log("═══════════════════════════════════════");
  console.log("🎬 streamResponse CALLED");
  console.log("📝 userPrompt length:", userPrompt?.length || 0);
  console.log("🤖 agentProcess length:", agentProcess?.length || 0);
  console.log("🗺️ codemap length:", codemap?.length || 0);
  console.log("🔍 semantic length:", semantic?.length || 0);
  console.log("═══════════════════════════════════════");
  await removeProcessDiv(currentProcessDiv);
  const bubbleElement = await appendMessage("...", "ai");
  const textContainer = bubbleElement.querySelector('.message-text') || bubbleElement;

  let finalUP = `
    # OBJECTIVE
    ${userPrompt}`;
  if (agentProcess) {
    finalUP += `# EXECUTION TRACE
${agentProcess}`;
  } else {
    if (codemap) {
      finalUP += `#CODEMAP:\n=========\n${codemap}\n`;
    }
    if (semantic) {
      finalUP += `#SEMANTIC:\n=========\n${semantic}`
    }
  }

  finalUP += await loadTxtFiles("MainUp");
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
  console.log("   - System prompt length:", systemPrompt?.length || 0);
  console.log("   - History messages:", HISTORY_CHAT_CONTEXT?.length || 0);
  console.log("   - User Prompt length:", messages[messages.length - 1].content);

  try {
    const apiUrl = apiAddress("streamChat");
    console.log("🚀 INITIATING FETCH");
    console.log("   - URL:", apiUrl);
    console.log("   - Model:", currentModel);

    const fetchStartTime = performance.now();

    const response = await fetch(apiUrl, {
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
      const errorBody = await response.text();
      console.error(`❌ API FAILED: ${response.status} ${response.statusText}`);
      console.error("Error Details:", errorBody);

      if (response.status === 413) {
        textContainer.innerHTML = "<b>Error:</b> Prompt is too long for the AI. Truncating history...";
      } else {
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
      const { done, value } = await reader.read();
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
      } else {
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
        if (jsonStr === "[DONE]") continue;

        try {
          const json = JSON.parse(jsonStr);
          const delta = json.choices?.[0]?.delta;

          // CAPTURE BOTH: DeepSeek uses reasoning_content for thinking
          const text = delta?.content || delta?.reasoning_content || "";

          if (text) {
            fullText += text;
            // Immediate UI update
            textContainer.innerHTML = await renderMarkdown(fullText);
          }
        } catch (e) {
          console.log(`Error: ${e}`)
          // Ignore partial JSON errors during streaming
        }
      }

    }

    // 3. FINAL VALIDATION
    if (fullText.length === 0 && buffer.length > 0) {
      // Emergency fallback: If the AI didn't follow SSE format but sent text
      fullText = buffer;
      textContainer.innerHTML = await renderMarkdown(fullText);
    }
    await notifyNewMessage(fullText);
    console.log("Final Response Length:", fullText.length);
    return fullText;



  } catch (error) {
    console.error("Error: ", error);
    return "";
  }
}




let currentProcessDiv: HTMLDivElement;
// 4. The Logic
async function handleMessage(input: string = ""): Promise<void> {
  // Safety check: if input is missing, stop.
  let text: string = input;

  if (!text) {
    console.log("Enter");
    if (!userPromptInput) return;
    if (currentPage == "Home") {
      await createNewBranch();
    }

    //TODO: needs to handle that the append message method.
    //TODO: handle the size adjusting buttons for the user input.
    //todo: i want to add like minimizing of the user input to a button.

    text = userPromptInput.value.trim();
    if (text === "") return;
    userPromptInput.value = "";
  }

  const userMessage: ChatMessage = {
    role: "user",
    content: text,
  };
  const ctx: ProcessingContext = {
    userInput: text,
  };
  HISTORY_CHAT_CONTEXT.push(userMessage);
  if (!input) {
    await appendMessage(text, "user", -1);
  }



  const stepList: ProcessStep[] = [
    {
      id: "title",
      icon: "fa-heading",
      label: "Generating Branch Title...",
      method: async (ctx: ProcessingContext) => {
        if (needSessionTitle[currentSessionId]) {
          console.log("Need of Session Title");
          needSessionTitle[currentSessionId].innerText = await getBranchTitle(
            text
          );
          ctx.chatTitle = needSessionTitle[currentSessionId].innerText;
          await apiUpdateSession(
            currentSessionId,
            needSessionTitle[currentSessionId].innerText
          );
          delete needSessionTitle[currentSessionId];
        }
      },
    },

  ];
  if (featureState.enhance_prompt) {
    stepList.push({
      id: "enhance",
      icon: "fa-sparkles",
      label: "Enhancing Prompt...",
      method: async (ctx: ProcessingContext) => {
        ctx.enhancedPrompt = await enhancePrompt(text);
      },
    });
  }
  if (foldersAbsPath.length !== 0) {

    if (featureState.use_codemap) {
      stepList.push({
        id: "codemap",
        icon: "fa-sitemap",
        label: "Mapping Codebase...",
        method: async (ctx: ProcessingContext) => {
          ctx.codeMapData = await fetchStructuralContext(text);
          console.log(
            `Code Map Chunks Loading Successfull! Chunks Loaded: ${ctx.codeMapData.length}`
          );
        },
      });
    }
    if (featureState.use_semantic) {
      stepList.push({
        id: "semantic",
        icon: "fa-search",
        label: "Semantic Search...",
        method: async (ctx: ProcessingContext) => {
          ctx.semanticResults = await fetchSemanticContext(text);
          console.log(
            `Semantics Chunks Loading Successfull! Chunks Loaded: ${ctx.semanticResults.length}`
          );
        },
      });
    }
  }

  const processDiv = await appendMessage("", "ai", -1, "", stepList);
  currentProcessDiv = processDiv;
  await apiSaveMessage(currentSessionId, text, "user", "You");

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
      await step.method(ctx);
      updateStatusStep(step.id, "completed");
      console.log(`${step.id} Step Finished!`);
    }
  }


  console.log("Sending Prompt with History: ", HISTORY_CHAT_CONTEXT);
  await prepareAIPrompt(
    ctx.enhancedPrompt || ctx.userInput,
    ctx.codeMapData || [],
    ctx.semanticResults || []
  );

}

async function removeProcessDiv(targetElement: HTMLDivElement): Promise<void> {
  if (targetElement) {
    // FIX: Find the actual message bubble (parent with class 'message')
    const targetBubble = targetElement.closest('.message') as HTMLDivElement;

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
}

sendButton?.addEventListener("click", async () => {
  await handleMessage();
});

userPromptInput?.addEventListener("keydown", (event: KeyboardEvent) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    handleMessage();
  }
});

const API_URL = "http://127.0.0.1:8000";
interface Message {
  id: number;
  session_id: string;
  sender: SenderType;
  senderName: string;
  text: string;
  timestamp: string;
}

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  chat_preview: string;
}

async function apiCreateSession(sessionId: string): Promise<void> {
  console.log("Creating Session of id: ", sessionId);
  await fetch(`${API_URL}/sessions/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: sessionId }),
  });
}

async function apiSaveMessage(
  sessionId: string,
  text: string,
  sender: SenderType,
  senderName: string
): Promise<void> {
  await fetch(`${API_URL}/sessions/${sessionId}/messages/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: text, sender: sender, name: senderName }),
  });
}

async function apiGetSessions(): Promise<ChatSession[]> {
  const response = await fetch(`${API_URL}/sessions/`);
  return await response.json();
}
interface MessageBubble {
  id: number,
  content: string,
  sender: string,
  name: string,
  timestamp: string
}

async function apiGetMessages(
  session_id: string,
  limit: number = 0
): Promise<Message[]> {
  let url = `${API_URL}/sessions/${session_id}/messages/`;
  if (limit > 0) {
    url += `?limit=${limit}`;
  }
  console.log("Fetching URL:", url);
  const response = await fetch(url);

  const data = await response.json();
  console.log("DEBUG DATA:", data);

  return data?.map((msg: MessageBubble) => ({
    id: msg.id,
    text: msg.content,
    sender: msg.sender,
    senderName: msg.name,
    timestamp: msg.timestamp,
  }));
}

async function createNewBranch(): Promise<void> {
  const chatId = "chat_" + Date.now().toString() + crypto.randomUUID();
  console.log("Chat Id Created:", chatId);
  currentSessionId = chatId;
  await apiCreateSession(chatId);
  if (messagesContainer) messagesContainer.innerHTML = "";
  const chatBranch: HTMLDivElement = await loadBranchHtml(chatId, true);
  await selectBranch(chatId, chatBranch);
}

let branchCount: number;

const chatBranches = document.querySelector<HTMLDivElement>("#chatBranches");

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);

  // Check if date is valid
  if (isNaN(date.getTime())) return "";

  return date.toLocaleString("en-US", {
    month: "short", // "Oct"
    day: "numeric", // "12"
    hour: "numeric", // "2"
    minute: "2-digit", // "30"
    hour12: true, // "PM"
  });
}
let selectedBranch: HTMLDivElement;

async function createAxeIcon(): Promise<HTMLImageElement> {
  const img = document.createElement("img");
  img.src = await loadAssetPath("axe");
  img.alt = "Delete Branch";
  img.classList.add("delete-icon");
  return img;
}
const needSessionTitle: Record<string, HTMLDivElement> = {};

async function loadSidebar(): Promise<void> {
  console.log("Loading Sidebar:");
  const response = await apiGetSessions();
  console.log(response);

  if (chatBranches != null) {
    chatBranches.innerHTML = "";
  }
  branchCount = response.length;
  console.log(branchCount);
  for (let i = 0; i < branchCount; i++) {
    const branch = response[i];
    const title: string = branch["title"];
    const date: string = formatTimestamp(branch["created_at"]);
    const preview: string = branch["chat_preview"];

    await loadBranchHtml(branch["id"], false, title, date, preview);
  }
}

async function loadBranchHtml(
  sessionId: string,
  newChat: boolean = false,
  title: string = "New Chat",
  date: string = formatTimestamp(new Date().toISOString()),
  preview: string = "No Preview"
): Promise<HTMLDivElement> {
  console.log(`Title: ${title}, Date: ${date}, Preview: ${preview}`);
  const chatBranch = document.createElement("div");
  chatBranch.classList.add("chat-branch");
  // chatBranch.setAttribute("data-id", i.toString());
  const deleteBranch = await createAxeIcon();
  deleteBranch.addEventListener("click", async (event: MouseEvent) => {
    event.stopPropagation();
    chatBranches?.removeChild(chatBranch);
    try {
      await fetch(`${API_URL}/sessions/${sessionId}/`, {
        method: "DELETE",
      });
      if (messagesContainer) {
        messagesContainer.innerHTML = "";
      }
      console.log("Deleted successfully");
    } catch (error) {
      console.error("Failed to delete", error);
    }
  });
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
  chatBranch.addEventListener("click", async () => {
    selectBranch(sessionId, chatBranch);
  });
  if (newChat && chatBranches) {
    chatBranches.insertBefore(chatBranch, chatBranches.firstChild);
  } else {
    chatBranches?.appendChild(chatBranch);
  }
  return chatBranch;
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



async function handleAttachedFolder(): Promise<void> {
  try {
    const response = await fetch(apiAddress("selectBranch"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        branchId: currentSessionId,
      }),
    });

    const answer = await response.json();
    if (answer.success) {

      foldersAbsPath = answer.paths;
      if (fileCountBadge) {
        fileCountBadge.textContent = answer.paths.length.toString();
      }
      console.log(
        `Chat ${currentSessionId}'s Folders Attach Count: ${foldersAbsPath.length}`
      );
      if (foldersAbsPath.length !== 0) {
        foldersAbsPath.forEach((path) => {
          console.log(path);
        });
      }
    } else {
      console.error("Attachment Retrieval Failed! Error: ", answer.error);
    }
  } catch (error) {
    console.error("API Error Fetching Attached Folder: ", error);
  }
}

newChat?.addEventListener("click", async () => {
  console.log("Create a new Chat");
  await createNewBranch();
});

async function getHistoryChats() {
  const response = await apiGetMessages(currentSessionId, contextLengthMax);
  const cleanedData: ChatMessage[] = response.map((item: Message) => {
    let roleType: "user" | "assistant";
    if (item.sender == "user") {
      roleType = "user";
    } else {
      roleType = "assistant";
    }

    return {
      role: roleType,
      content: item.text,
    };
  });
  HISTORY_CHAT_CONTEXT = cleanedData;
}
interface sessionSidebar {
  title: string;
  chat_preview: string;
}

async function apiUpdateSession(
  sessionId: string,
  title?: string,
  preview?: string
): Promise<void> {
  console.log(`Updating session ${sessionId}...`);


  // Create the body object dynamically
  const bodyData: sessionSidebar = { title: title || "Chat Session", chat_preview: preview || "Chat Preview" };



  try {
    const response = await fetch(`${API_URL}/sessions/${sessionId}`, {
      method: "PATCH", // <--- matches the @app.patch in Python
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyData),
    });

    if (!response.ok) throw new Error("Failed to update session");
    console.log("Session updated successfully!");
  } catch (error) {
    console.error("Error updating session:", error);
  }
}

async function enhancePrompt(prompt: string): Promise<string> {
  console.log("Enhancing Prompt...");

  // 1. Prepare Payload

  const userInput: ChatMessage = {
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

  return (await callLLM(userInput, SLM, "Prompt Enhancing", "PromptSP", HISTORY_CHAT_CONTEXT))
    .response;
  // 2. Start the Request (Talk to Local Server)
}


async function callLLM(
  prompt: ChatMessage,
  model: string,
  taskName: string,
  fileName: string,
  history: Array<ChatMessage> = []
): Promise<llmResponse> {
  try {
    const response = await fetch(apiAddress("chat"), {
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

    const result = await response.json();
    console.log(
      `${taskName} completed in ${result.timeTaken} milliseconds. Result: \n${result.response}`
    );
    return result;
  } catch (error) {
    console.error(`${taskName} failed. Error:${error}`);
    // Fallback: If enhancement fails, just use the user's original prompt
    return {
      response: "",
      timeTaken: "",
    };
  }
}

async function getBranchTitle(prompt: string): Promise<string> {
  const userInput: ChatMessage = {
    role: "user",
    content: `
        ---------------------------------
        THE PROMPT TO TURN INTO THE TITLE: "${prompt}"`,
  };

  return (await callLLM(userInput, SLM, "Get Branch Title", "ChatTitleSP"))
    .response;
}

// frontend/script.ts (or script.js)

interface DisplayProcess {
  /*
  socket.emit("agent-log", {
      loop: count,
      agent: "Manager",
      stage: "Review",
      message: `Loop ${count} complete. Received ${observations.length} 
      Manager Response:
      ${body}.`,
      status: "success"
    });
  */
  loop: number,
  agent: string,
  stage: string,
  message: string,
  status: "success" | "fail"
}

socket.on("agent-log", (data: DisplayProcess) => {
  if (!currentProcessDiv) return;

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



