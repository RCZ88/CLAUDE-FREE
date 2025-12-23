// 1. Import 'Marked' (Capital M)
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';


// import 'highlight.js/styles/github-dark.css';

interface PuterAI {
    // We are telling TS: "There is a method called 'chat'."
    // "It takes a string and some options."
    // "It returns a Promise (because it's async)."
    chat(prompt: string, options?: { model?: string; stream?: boolean }): Promise<any>;
}

// 2. WE DRAW THE CONTAINER
// The variable 'puter' isn't just the AI; it's a wrapper object.
interface Puter {
    ai: PuterAI; // It has a property 'ai' inside it.
}

interface ChatMessage {
    role: "system" | "user" | "assistant"; // Restrict to these 3 specific values
    content: string;
}

interface CodeMapRow {
    id: number;
    file_path: string;
    name: string; // function name
    signature: string;
    start_line: number;
    end_line: number;
}

export interface IElectronAPI {
  selectFolder: () => Promise<string | null>;
}

interface AttachedFolder{
    id:number;
    path:string;
}
declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}

const markdown = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    }
  })
);

// 3. Use your instance to parse
export async function renderMarkdown(markdownText: string): Promise<string> {
    // Note: In v11+, .parse() can return a Promise, so it's safer to await it
    // or cast it if you are sure it's synchronous.
    return markdown.parse(markdownText) as string;
}

let systemPrompt:string = "";

// 2. Function to load the text file (Run this when page loads)
async function loadTxtFiles() {
    try {
        const response = await fetch ("prompts/SystemCore.txt");
        systemPrompt = await response.text();
        console.log("System Prompt loaded!", systemPrompt.length, "chars");
    } catch (error) {
        console.error("Could not load prompt guide:", error);
        // Fallback if file fails
    }
}

// Call this immediately


declare const puter:Puter;

// 1. UPDATE YOUR MODEL LIST
const claudeModels = [
    'tngtech/deepseek-r1t2-chimera:free', // Good for reasoning
    'kwaipilot/kat-coder-pro:free',       // Good for code
    'openai/gpt-oss-20b:free',            // General purpose
    'nvidia/nemotron-nano-12b-v2-vl:free', // Fast
    'mistralai/devstral-2512:free', //excels in agentic coding.
    'kwaipilot/kat-coder-pro:free' //tops SWE-Bench benchmarks.
];

// 2. SET THE DEFAULT (Must match one of the above)
let currentModel: string = "tngtech/deepseek-r1t2-chimera:free";

let currentSessionId:string = "";

type SenderType = 'user' | 'ai';
type PageLoc = 'Home' | 'Chat';

const sendButton = document.querySelector<HTMLButtonElement>('#sendBtn');
const userPromptInput = document.querySelector<HTMLTextAreaElement>('#messageInput');
const inputActions = document.querySelector<HTMLElement>('.input-actions');
const messagesContainer = document.querySelector<HTMLDivElement>('#messagesContainer');
const modelSelect = document.querySelector<HTMLSelectElement>('#modelDropdown');
const newChat = document.querySelector<HTMLButtonElement>('#newChatBtn');
const attachFolderBtn = document.querySelector<HTMLButtonElement>('#attachFolderBtn');
const toggleSidebar = document.querySelector<HTMLButtonElement>('#toggleSidebar');
const homePage = document.querySelector<HTMLDivElement>('#logoTitle');
const sidebarContainer = document.querySelector<HTMLElement>('.container');
const scrollButton = document.querySelector<HTMLButtonElement>('#scrollToBottomBtn');
const expandChatInput = document.querySelector<HTMLButtonElement>('#heightUp');
const shrinkChatInput = document.querySelector<HTMLButtonElement>('#heightDown');
const openDrawerButton = document.querySelector<HTMLButtonElement>('#openDrawerBtn');
const folderModalOverlay = document.querySelector<HTMLDivElement>('#folderModalOverlay');
const closeModalBtn = document.querySelector<HTMLButtonElement>('#closeModalBtn');
const folderList = document.querySelector<HTMLUListElement>('#folderList');
const emptyState = document.querySelector<HTMLDivElement>('#emptyFolderState');
const fileCountBadge = document.querySelector<HTMLSpanElement>('#fileCountBadge');
const modalAddFolderBtn = document.querySelector<HTMLButtonElement>('#modalAddFolderBtn');

openDrawerButton?.addEventListener('click', async ()=>{
    folderModalOverlay?.classList.add('active');
    await renderFolders();
});
closeModalBtn?.addEventListener('click', ()=>{
    folderModalOverlay?.classList.remove('active');
});
folderModalOverlay?.addEventListener('click', (e)=>{
    if(e.target == folderModalOverlay){
        folderModalOverlay?.classList.remove('active');
    }
});

modalAddFolderBtn?.addEventListener('click', async()=>{
    const success:boolean = await selectAttachment();
    if(success){
        await handleAttachedFolder();
        await renderFolders();
    }
});

let foldersAbsPath:string[] = [];

async function renderFolders(){
    if(folderList){
        folderList.innerHTML = '';
    }else{
        console.error(`Folder List Element not found`);
        return;
    }

    if(foldersAbsPath.length === 0){
        emptyState?.classList.remove('hidden');
    }else{
        emptyState?.classList.add('hidden');
        foldersAbsPath.forEach(folderPath =>{
            console.log(`Folder Path: ${folderPath}`);
            const folderName = folderPath.split(/[\\/]/).filter(Boolean).pop();

            const li = document.createElement('li');
            li.classList.add('folder-item');
            li.innerHTML = `
                <div class="folder-info">
                    <span class="folder-name">${folderName}</span>
                    <span class="folder-path">${folderPath}</span>
                </div>
            `;
            const icon = document.createElement('i');
            icon.classList.add('fas', 'fa-trash-alt');
            const deleteFolderButton = document.createElement('button');
            deleteFolderButton.classList.add('remove-folder-btn');
            deleteFolderButton.appendChild(icon);
            deleteFolderButton.addEventListener('click', async ()=>{
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

async function removeAttachment(path:string){
    const payload = await fetch('http://localhost:3000/api/removeWatchList', {
        method:'DELETE',
        headers:{
            'Content-Type': 'application/json' 
        },
        body:JSON.stringify({
            path:path,
            sessionId: currentSessionId
        })
    });
    await payload.json();
}

function scrollToBottom(smooth:boolean){
    if(messagesContainer){
        console.log(`scrolling!`);
        if(smooth){
            messagesContainer.scrollTo({
                top:messagesContainer.scrollHeight,
                behavior:'smooth'
            })
        }else{
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }
}


const HEIGHT_STEPS = [60, 120, 200, 350];

const username = "You";
let currentPage: PageLoc = 'Home';
let AI = currentModel.toUpperCase();

const userNames: Record<string, string> = {
    "user": username,
    "ai": AI
};

const contextLengthMax = 10;
let HISTORY_CHAT_CONTEXT:ChatMessage[] = [];

// Select the dropdown

// Tell TS that the 'marked' library exists
declare const marked: {
    parse: (markdown: string) => string;
};

document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log("1. Starting...");
        switchToHomeMode();

        // If this function has a bug, the code dies here
        prepareModelOptions(); 
        console.log("2. Options prepared.");

        await loadTxtFiles();
        console.log("3. System Prompt Loaded.")

        await loadSidebar();
        console.log("4. Sidebar loaded!");

    
    } catch (error) {
        // THIS is what you need to see
        console.error("CRITICAL ERROR DURING STARTUP:", error);
    }
});

homePage?.addEventListener('click', ()=> switchToHomeMode());

toggleSidebar?.addEventListener('click', () =>{
    sidebarContainer?.classList.toggle('sidebar-hidden');
    const icon = toggleSidebar.querySelector('i');
    if(icon){
        if(sidebarContainer?.classList.contains('sidebar-hidden')){
            icon.classList.replace('fa-bars', 'fa-arrow-right');
        }else{
            icon.classList.replace('fa-arrow-right', 'fa-bars');
        }
    }
});
scrollButton?.addEventListener('click', ()=>{
    scrollToBottom(true);
});

messagesContainer?.addEventListener('scroll', ()=>{
    const threshold = 300;
    const distanceFromBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight;

    if(scrollButton){
        if (distanceFromBottom > threshold) {
            scrollButton.classList.add('visible');
        } else {
            scrollButton.classList.remove('visible');
            scrollButton.classList.remove('has-new');
        }
    }
});

function notifyNewMessage() {
    if(scrollButton){
        if (scrollButton.classList.contains('visible')) {
            scrollButton.classList.add('has-new');
        }
    }
}

let manualMinStepIndex = 0;
function adjustInputHeight() {
    if (!userPromptInput || !inputActions) return;

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
    } else {
        userPromptInput.style.overflowY = 'hidden';
    }
}
userPromptInput?.addEventListener('input', adjustInputHeight);




function handleExpand() {
    // Increase step, but don't go past the last option
    console.log("Expand!")
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
if(expandChatInput && shrinkChatInput){
    console.log("expandChatInput && shrinkChatInput")
    expandChatInput.addEventListener('click', () => {
        handleExpand();
    
    });
    shrinkChatInput.addEventListener('click', () => {
        handleShrink();
    });
}else{
    console.log("Buttons failed to load!");
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
    attachFolderBtn.addEventListener('click', async () => {
        const success:boolean = await selectAttachment();
        if(success){
            console.log("now handle attach folder")
            await handleAttachedFolder();
            // await renderFolders();
        }
    });
}

async function selectAttachment():Promise<boolean>{
    console.log("Add Folder Clicked!")
    const path = await handleFolderSelection();
    if(path){
        console.log("Path Selected: ", path);
        const response = await fetch('http://localhost:3000/api/addWatchList', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
                folderPath:path, 
                currentSession: currentSessionId
            })
        });
        if (!response.ok) throw new Error('Network response was not ok');
        const result = await response.json();
        console.log(JSON.stringify(result));
        return true;
    }
    return false;
}




interface ProcessingContext {
    userInput: string;
    enhancedPrompt?: string;      // Result from enhancePrompt()
    semanticResults?: string[];     // Result from semanticSearch()
    codeMapData?: string[];           // Result from codeMap()
    chatTitle?: string;          // Result from generateTitle()
}

interface ProcessStep {
    id: string;
    label: string;
    icon: string; // FontAwesome class like 'fa-search'
    method?: (ctx: any) => Promise<void>;
}

function addProcessDiv(stepList:ProcessStep[]){
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

function updateStatusStep(stepId: string, state: 'active' | 'completed') {
    const el = document.getElementById(`step-${stepId}`);
    if (!el) return;
    
    const iconContainer = el.querySelector('i') || el.querySelector('.dot-loader');
    if (!iconContainer) return;
    
    const labelSpan = el.querySelector(':scope > span') as HTMLElement | null;
    
    // Now TypeScript will allow .innerText or .textContent
    const currentText = labelSpan?.innerText ?? '';

    el.classList.remove('active', 'completed');
    el.classList.add(state);
    
    if (state === 'active') {
        // Replace icon with pulsing dots
        el.innerHTML = `
            <div class="dot-loader"><span></span><span></span><span></span></div>
            <span>${currentText}</span>
        `;
    } 
    else if (state === 'completed') {
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
    userNames['ai']=AI;
    console.log(`Model switched to: ${AI}`);
});

function prepareModelOptions():void{
    if (!modelSelect) {
        console.error("CRITICAL ERROR: Could not find 'modelSelect' in the HTML!");
        return;
    }
    console.log("Preparing Models...")
    for(const model of claudeModels){
        const modelOption = document.createElement("option");
        modelOption.value = model;
        modelOption.textContent = model;
        console.log("Added Model: ", model);
        modelSelect?.appendChild(modelOption);
    }
}

const welcomeScreen = document.getElementById('welcome-screen');



async function appendMessage(text:string , sender:SenderType, processList:ProcessStep[] = [], timestamp: string | number = new Date().toISOString(), retrival = false): Promise<HTMLDivElement>{
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
    img.src = `avatar-${sender}.png`; // Placeholder Forest Spirit
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

    if(sender === 'ai' && !retrival){
        const stepsDiv = addProcessDiv(processList);
        contentDiv.appendChild(stepsDiv);
    }

    const messageText = document.createElement("div");
    messageText.classList.add("message-text");
    if(sender =='ai'){
        const htmlContent = await renderMarkdown(text);
        messageText.innerHTML =  htmlContent;
    }else if(sender == 'user'){
        messageText.innerText = text;
    }
    contentDiv.appendChild(messageText)

    const timeAppendDiv = document.createElement("div");
    timeAppendDiv.classList.add("message-time");
    const now = new Date();
    timeAppendDiv.innerText = now.toLocaleTimeString();
    contentDiv.appendChild(timeAppendDiv);


    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);
    // messagesContainer.scrollIntoView({ behavior: 'smooth' });
    
    return messageText;

}
async function fetchSemanticContext(userPrompt:string):Promise<string[]>{ //Vector - Layer 1
    try{
        const response = await fetch('http://localhost:3000/api/getSemantic', {
            method : 'POST',
            headers:{
                    'Content-type':'application/json'
            } ,
            body: JSON.stringify({
                prompt:userPrompt,
                sessionId:currentSessionId
            })
        });
        if (!response.ok) throw new Error('Network response was not ok');

        const data = await response.json();
        console.log('Response Data Retrieved:\n', data.answer);
        return data.answer;
    }catch(error){
        console.error('Error Calling Server: ', error);
        return [];
    }
    
}

interface llmResponse{
    response: string,
    timeTaken: string
}
async function fetchStructuralContext(prompt:string):Promise<string[]>{ //CodeMap - Layer 2
    const promptTailored = `
    =============================
    Below is the prompt to Extract the SQL keywords into JSON format:
    ${prompt}`
    const userPrompt:ChatMessage = {
        'role':'user',
        'content': promptTailored
    };
    const response = await callLLM(userPrompt, "nvidia/nemotron-nano-12b-v2-vl:free", "Code Map Context", "CodeMapSP");
    const jsonWords = response.response.trim().replace(/'/g, '"');
    console.log(`AI Response on JSON keywords for CodeMap Retrieval: "${jsonWords}"`);
    try{
        const keywords = JSON.parse(jsonWords)
        const response =await fetch('http://localhost:3000/api/searchCodeMap/',{
            method :'POST',
            headers:{
                'Content-type':'application/json'
           },
           body:JSON.stringify({
                keywords: keywords
           })
        });
        const recieved = await response.json();
        if (!response.ok) throw new Error('Network response was not ok');
        return recieved.answer;

        
    }catch(error){
        console.log(`Failed to Parse AI Response of JSONs. Error: ${error}`)
        return [];
    }
    
}



async function streamAiResponse(prompt: string, codemap:string[], semantic:string[]): Promise<string> {
    console.log(`🚀 Sending to OpenRouter... Model: ${currentModel}`);
    
    // Create the UI bubble
    const bubbleElement = await appendMessage("...", "ai");
    let fullText = "";

    const codemapString = codemap.join('\n');
    const semanticString = semantic.join('\n');

    console.log(`Resulting System Prompt Contains:
        - Codemap: ${codemap || 'No relevant code functions found.'}
        - Semantic: ${semanticString || 'No relevant semantic chunks found'}`)
    
    const constFullSystemPrompt = systemPrompt
        .replace('{{codeMap}}',  codemapString || 'No relevant code functions found.')
        .replace('{{vectorContext}}', semanticString || 'No relevant semantic chunks found.');
    
    // Prepare the messages array (System + Context + User)
    const messages = [
        { role: "system", content: constFullSystemPrompt || "You are a helpful AI." },
        ...HISTORY_CHAT_CONTEXT, // Your existing chat history variable
        { role: "user", content: prompt }
    ];

    try {
        // Call YOUR local server (which calls OpenRouter)
        const response = await fetch("http://localhost:3000/api/streamChat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: currentModel,
                messages: messages
            })
        });

        if (!response.ok) throw new Error("Network response was not ok");
        if (!response.body) throw new Error("Response body is null");

        // Handle the Stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");

        if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            
            // OpenRouter sends data lines like "data: {...}"
            const lines = chunk.split("\n");
            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    const jsonStr = line.slice(6);
                    if (jsonStr.trim() === "[DONE]") continue;

                    try {
                        const json = JSON.parse(jsonStr);
                        const content = json.choices?.[0]?.delta?.content || "";
                        fullText += content;
                        
                        // Update UI
                        bubbleElement.innerHTML = await renderMarkdown(fullText);
                        
                    } catch (e) {
                        // Partial JSON chunks are normal in streams, ignore them
                    }
                }
            }
        }

        console.log("🏁 Finished. Response length:", fullText.length);
        notifyNewMessage();
        return fullText;

    } catch (error) {
        console.error("❌ Error:", error);
        bubbleElement.innerHTML = "<i>Error: Could not connect to AI server. Ensure 'node server.js' is running.</i>";
        return "";
    }
}


// 4. The Logic
async function handleMessage(): Promise<void> {
    // Safety check: if input is missing, stop.
    console.log("Enter");
    if (!userPromptInput) return;
    if(currentPage == 'Home'){
        await createNewBranch()
    }
    

    //TODO: needs to handle that the append message method.
    //TODO: handle the size adjusting buttons for the user input.
    //todo: i want to add like minimizing of the user input to a button.


    const text = userPromptInput.value.trim();
    if (text === "") return;
    const userMessage:ChatMessage = {
        "role" : "user",
        "content" : text
    }
    const ctx:ProcessingContext = {
        userInput: text
    }
    HISTORY_CHAT_CONTEXT.push(userMessage);
    await appendMessage(text, 'user');
    userPromptInput.value = "";
    
    const stepList:ProcessStep[] = [
        { id: 'title', icon: 'fa-heading', label: 'Generating Branch Title...',
            method: async (ctx:ProcessingContext) =>{
                if(needSessionTitle[currentSessionId]){
                    console.log("Need of Session Title");
                    needSessionTitle[currentSessionId].innerText = await getBranchTitle(text);
                    ctx.chatTitle = needSessionTitle[currentSessionId].innerText;
                    await apiUpdateSession(currentSessionId, needSessionTitle[currentSessionId].innerText);
                    delete needSessionTitle[currentSessionId];
                }
            }
         },
        { id: 'enhance', icon: 'fa-sparkles', label: 'Enhancing Prompt...', 
            method: async(ctx:ProcessingContext) => {
                ctx.enhancedPrompt = await enhancePrompt(text);
            } 
        },
        { id: 'semantic', icon: 'fa-search', label: 'Semantic Search...',
            method:async(ctx:ProcessingContext) =>{
                ctx.semanticResults = await fetchSemanticContext(text);
                console.log(`Semantics Chunks Loading Successfull! Chunks Loaded: ${ctx.semanticResults.length}`);
            }
         },
        { id: 'codemap', icon: 'fa-sitemap', label: 'Mapping Codebase...',
            method:async(ctx:ProcessingContext)=>{
                ctx.codeMapData = await fetchStructuralContext(text);
                console.log(`Code Map Chunks Loading Successfull! Chunks Loaded: ${ctx.codeMapData.length}`);
            }
         }        
    ];
    if(foldersAbsPath.length === 0){
        stepList.splice(2, 2);
    }
    
    await appendMessage("", 'ai', stepList);
    await apiSaveMessage(currentSessionId, text, 'user');

    // let currentProcessId:string;
    // stepList.forEach(async (step) =>{
    //     if(step){
    //         if(currentProcessId){
    //             updateStatusStep(currentProcessId, 'completed');
    //         }
            
    //     }
    // });

    for(const step of stepList){
        if(step && step.method){
            console.log(`Currently Working on ${step.id}...`)
            updateStatusStep(step.id, 'active');
            await step.method(ctx);
            updateStatusStep(step.id, 'completed');
            console.log(`${step.id} Step Finished!`)
        }
    }

    await removeProcessDiv();
    console.log("Sending Prompt with History: ", HISTORY_CHAT_CONTEXT);
    const fullResponse = await streamAiResponse(ctx.userInput, ctx.codeMapData || [], ctx.semanticResults || []);
    const aiMessage:ChatMessage = {
        "role" : "assistant",
        "content" : fullResponse
    }
    apiSaveMessage(currentSessionId, fullResponse, "ai");
    HISTORY_CHAT_CONTEXT.push(aiMessage);
    if(HISTORY_CHAT_CONTEXT.length >(2 * contextLengthMax)){
        HISTORY_CHAT_CONTEXT.shift();
        HISTORY_CHAT_CONTEXT.shift();
    }
    
}

async function removeProcessDiv():Promise<void>{
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
}

sendButton?.addEventListener("click", handleMessage);

userPromptInput?.addEventListener("keydown", (event:KeyboardEvent)=>{
    if(event.key === "Enter" && !event.shiftKey){
        event.preventDefault();
        handleMessage();
    }
});

const API_URL = "http://127.0.0.1:8000"
interface Message{
    id:string;
    session_id:string;
    sender:SenderType;
    text:string;
    timestamp:string|number;
}

interface ChatSession{
    id:string;
    title:string;
    created_at:string;
    chat_preview:string;
}

async function apiCreateSession(sessionId:string):Promise<void>{
    console.log("Creating Session of id: ", sessionId);
    await fetch(`${API_URL}/sessions/`, {
        method:"POST",
        headers:{"Content-Type": "application/json"},
        body: JSON.stringify({id: sessionId})
    });
}

async function apiSaveMessage(sessionId:string, text:string, sender:SenderType):Promise<void>{
    const response = await fetch(`${API_URL}/sessions/${sessionId}/messages/`, {
        method:"POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({content:text, sender:sender})
    });
}

async function apiGetSessions():Promise<ChatSession[]>{
    const response = await fetch(`${API_URL}/sessions/`);
    return await response.json();    
}

async function apiGetMessages(session_id:string, limit:number=0):Promise<Message[]>{
    let url = `${API_URL}/sessions/${session_id}/messages/`;
    if(limit >0){
        url += `?limit=${limit}`;
    }
    console.log("Fetching URL:", url);
    const response = await fetch(url);
    
    const data = await response.json();
    console.log("DEBUG DATA:", data);
    
    return data?.map((msg:any)=>({
        id:msg.id.toString(),
        text:msg.content,
        sender:msg.sender,
        timestamp:msg.timestamp
    }));
}

async function createNewBranch():Promise<void>{
    const chatId = "chat_" + Date.now().toString() + crypto.randomUUID();
    console.log("Chat Id Created:",chatId);
    currentSessionId = chatId;
    await apiCreateSession(chatId);
    if(messagesContainer) messagesContainer.innerHTML = '';
    const chatBranch:HTMLDivElement = await loadBranchHtml(chatId, true);
    await selectBranch(chatId, chatBranch);

}

var branchCount:number;

const chatBranches = document.querySelector<HTMLDivElement>('#chatBranches');

function formatTimestamp(isoString: string): string {
    const date = new Date(isoString);
    
    // Check if date is valid
    if (isNaN(date.getTime())) return "";

    return date.toLocaleString('en-US', {
        month: 'short',   // "Oct"
        day: 'numeric',   // "12"
        hour: 'numeric',  // "2"
        minute: '2-digit', // "30"
        hour12: true      // "PM"
    });
}
var selectedBranch:HTMLDivElement;

function createAxeIcon():HTMLImageElement{
    const img = document.createElement('img');
    img.src = "axe.png";
    img.alt = "Delete Branch";
    img.classList.add("delete-icon");
    return img;
}
let needSessionTitle:Record<string, HTMLDivElement> = {};

async function loadSidebar(isNewChat:boolean = false):Promise<void>{ 
    console.log("Loading Sidebar:")
    let response = await apiGetSessions();
    console.log(response);
    
    if(chatBranches != null){
        chatBranches.innerHTML = "";
    }
    branchCount = response.length;
    console.log(branchCount)
    for(let i = 0; i<branchCount; i++){
        const branch = response[i];
        var title:string = branch['title'];
        var date:string = formatTimestamp(branch['created_at']);
        var preview:string = branch['chat_preview'];

        
        await loadBranchHtml(branch['id'], false, title, date, preview);
    }
}

async function loadBranchHtml(sessionId:string, newChat:boolean = false, title:string = "New Chat", date:string = formatTimestamp(new Date().toISOString()), preview:string="No Preview"):Promise<HTMLDivElement>{
    console.log(`Title: ${title}, Date: ${date}, Preview: ${preview}`);
    const chatBranch = document.createElement("div");
    chatBranch.classList.add("chat-branch");
    // chatBranch.setAttribute("data-id", i.toString());
    const deleteBranch = createAxeIcon();
    deleteBranch.addEventListener("click", async (event:MouseEvent)=>{
        event.stopPropagation();
        chatBranches?.removeChild(chatBranch);
        try {
            await fetch(`${API_URL}/sessions/${sessionId}/`, {
                method: "DELETE"
            });
            if(messagesContainer){
                messagesContainer.innerHTML = ""
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
    if(newChat || title.toLowerCase() == "new chat"){
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
    chatBranch.addEventListener("click", async (event:MouseEvent)=>{
        selectBranch(sessionId, chatBranch);
    });
    if(newChat && chatBranches){
        chatBranches.insertBefore(chatBranch, chatBranches.firstChild);
    } else {
        chatBranches?.appendChild(chatBranch);
    }
    return chatBranch;
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
    if(selectedBranch){
        selectedBranch.classList.remove("active");
    }
    document.body.classList.remove('chat-mode');
}



async function selectBranch(sessionId:string, chatBranch:HTMLDivElement){
    const branchSelectedId = sessionId;
    console.log(`Branch Selected: ${branchSelectedId}`);
    switchToChatMode();
    
    const messages = await apiGetMessages(branchSelectedId);
    // console.log(JSON.stringify(messages));
    if (!messagesContainer) return
    messagesContainer.innerHTML = "";
    if(selectedBranch){
        selectedBranch.classList.remove("active");
    }
    chatBranch.classList.add("active");
    selectedBranch = chatBranch;
    currentSessionId = sessionId;
    if(messages.length != 0 && messages){
        console.log(`Session Length: ${messages.length}`)
        for (const msg of messages) {
            console.log(`Retrieving Message ID: ${msg.id}`);
            await appendMessage(msg.text, msg.sender, [], msg.timestamp, true);
        }
    }else{
        console.log("Chat Session Empty!");
    }
    scrollToBottom(false);
    getHistoryChats();
    await handleAttachedFolder();
}


async function handleAttachedFolder():Promise<void>{
    try{
        const response = await fetch('http://localhost:3000/api/selectBranch', {
            method:'POST',
            headers: {
                'Content-Type': 'application/json' 
            },
            body:JSON.stringify({
                branchId:currentSessionId,
            })
        });
        
        const answer = await response.json();
        if(answer.success){
            foldersAbsPath = answer.paths;
            if(fileCountBadge){
                fileCountBadge.textContent = answer.paths.length.toString();
            }
            console.log(`Chat ${currentSessionId}'s Folders Attach Count: ${foldersAbsPath.length}`);
            foldersAbsPath.forEach((path)=>{
                console.log(path);
            });
        }else{
            console.error("Attachment Retrieval Failed! Error: ", answer.error);
        
        }
        
        
    }catch(error){
        console.error('API Error Fetching Attached Folder: ', error);
    }
}


newChat?.addEventListener("click", (event) =>{
    console.log("Create a new Chat");
    switchToHomeMode();
});


async function getHistoryChats(){
    const response = await apiGetMessages(currentSessionId, contextLengthMax);
    const cleanedData:ChatMessage[] = response.map((item:Message)=>{
        let roleType: "user"|"assistant";
        if(item.sender == "user"){
            roleType = "user"
        }else{
            roleType = "assistant"
        }

        return {
            role:roleType,
            content:item.text
        }
    });
    HISTORY_CHAT_CONTEXT = cleanedData;
}

async function apiUpdateSession(sessionId: string, title?: string, preview?: string): Promise<void> {
    console.log(`Updating session ${sessionId}...`);

    // Create the body object dynamically
    const bodyData: any = {};
    if (title) bodyData.title = title;
    if (preview) bodyData.chat_preview = preview;

    try {
        const response = await fetch(`${API_URL}/sessions/${sessionId}`, {
            method: "PATCH", // <--- matches the @app.patch in Python
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyData)
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
    

    const userInput:ChatMessage = {
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

    return (await (callLLM(userInput, currentModel, "Prompt Enhancing", "PromptSP"))).response
    // 2. Start the Request (Talk to Local Server)
    
}

async function callLLM(prompt:ChatMessage, model:string, taskName:string, fileName:string):Promise<llmResponse>{
    
    try {
        const response = await fetch("http://localhost:3000/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                // Use a 'smart' model for enhancement, or just use currentModel
                model: model, 
                messages: prompt,
                systemPrompt:fileName
            })
        });

        const result = await response.json();
        console.log(`${taskName} completed in ${result.timeTaken} milliseconds. Result: \n${result.response}`);
        return result
    } catch (error) {
        console.error(`${taskName} failed. Error:${error}`);
        // Fallback: If enhancement fails, just use the user's original prompt
        return {
            response:"",
            timeTaken:""
        }
    }
}

async function getBranchTitle(prompt: string):Promise<string>{
    
    const userInput:ChatMessage = {
        role:"user",
        content: `
        ---------------------------------
        THE PROMPT TO TURN INTO THE TITLE: "${prompt}"`
    }


    return (await callLLM(userInput, "nvidia/nemotron-nano-12b-v2-vl:free", "Get Branch Title", "ChatTitleSP")).response;
}