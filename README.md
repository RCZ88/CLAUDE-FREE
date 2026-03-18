# ForestMind AI (FM-AI)

A local, desktop-based AI chat application designed for developers. ForestMind AI allows you to attach entire local codebases to your chat sessions, enabling the AI to understand and analyze your specific project context with precision.

![ForestMind AI](./assets/avatar-ai.png)

## Introduction

ForestMind AI bridges the gap between AI assistance and local development environments. Unlike cloud-based solutions that require uploading your code, FM-AI keeps everything local while providing intelligent, context-aware responses. By attaching your project folders directly to the chat, the AI gains deep understanding of your codebase structure, file relationships, and project-specific patterns.

Built with a dual-backend architecture, ForestMind AI combines the strengths of Node.js for real-time AI streaming and file operations with Python FastAPI for robust data persistence.

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend (Desktop Client)** | Electron, Node.js, Vanilla HTML/CSS, Strict TypeScript |
| **Backend (API & Database)** | Python 3, FastAPI, SQLAlchemy (Pydantic) |
| **Database** | SQLite (`forestmind.sqlite`) with WAL (Write-Ahead Logging) mode |
| **AI Provider** | OpenRouter API (Bearer token authentication) |

### Why This Stack?

- **Electron + Node.js**: Enables native desktop experience with direct file system access for reading local codebases
- **Python FastAPI**: Provides high-performance API endpoints with automatic validation via Pydantic models
- **SQLite WAL Mode**: Allows concurrent read/write operations from both Node.js and Python backends without locking conflicts
- **OpenRouter**: Unified API access to multiple AI models with consistent streaming interface

## Core Features

### 1. Dual-Backend Architecture

ForestMind AI separates concerns across two specialized backends:

```
┌─────────────────────────────────────────────────────────────┐
│                    ForestMind AI Client                      │
│                      (Electron + TS)                         │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│    Node.js Backend      │     │   Python FastAPI Backend│
│  • AI Agent Logic       │     │  • Data Persistence     │
│  • OpenRouter Streams   │     │  • Chat Sessions        │
│  • Local File System    │     │  • Messages Storage     │
│  • Folder Attachments   │     │  • Attachment Paths     │
└─────────────────────────┘     └─────────────────────────┘
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│    OpenRouter API       │     │   SQLite (WAL Mode)     │
│    (AI Model Provider)  │     │   forestmind.sqlite     │
└─────────────────────────┘     └─────────────────────────┘
```

**Node.js Responsibilities:**
- AI agent orchestration and prompt construction
- Real-time streaming from OpenRouter API
- Local file system reads for attached codebases
- In-memory folder path tracking (`foldersAbsPath`)

**Python FastAPI Responsibilities:**
- RESTful API for all persistent data operations
- Chat session management (create, list, delete)
- Message history storage and retrieval
- Attachment path persistence and validation

### 2. Local Folder Attachments

Attach entire directories to your chat sessions. The AI gains contextual awareness of your project structure without uploading files to external servers.

**How It Works:**
1. Select one or more folders from your local file system
2. Paths are stored in-memory (`foldersAbsPath`) for fast access
3. Attachment metadata is persisted in SQLite via the Python backend
4. AI queries can reference and read files from attached folders

**Benefits:**
- Zero data upload – your code stays local
- Full project context for accurate AI responses
- Persistent attachments across chat sessions
- Support for multiple folder attachments simultaneously

### 3. Strict Feature Toggle System

ForestMind AI includes a dynamic UI settings panel that controls AI behavior. Settings are synced with a local `chatFeatures.json` configuration file.

#### Available Toggles

| Toggle | Description |
|--------|-------------|
| `use_codemap` | Analyzes project file tree and structure for context-aware responses |
| `use_semantic` | Injects high-level logic and intent descriptions into AI prompts |
| `agent_supreme` | Master agent toggle – automatically forces both Code Map and Semantic Leads ON |

#### Toggle Behavior

```
┌─────────────────────────────────────────────────────────────┐
│                    Feature Toggle Panel                      │
├─────────────────────────────────────────────────────────────┤
│  ☐ Agent Supreme (Master)                                   │
│      └─► When enabled: Forces codemap + semantic ON         │
│                                                              │
│  ☐ Use Code Map                                             │
│      └─► Analyzes file tree structure                       │
│                                                              │
│  ☐ Use Semantic                                             │
│      └─► Injects logic/intent descriptions                  │
└─────────────────────────────────────────────────────────────┘
```

**Configuration Sync:**
- UI changes immediately update `chatFeatures.json`
- Write-locks prevent corruption during rapid toggle chains
- Settings persist across application restarts

### 4. The "Folder Guard" Logic

ForestMind AI enforces strict validation to prevent AI hallucinations when project context is missing.

**Guard Rules:**
1. If attached folders = 0 (none attached or all removed)
2. Then **instantly lock** the following toggles:
   - `codemap` → Disabled + Visually Unchecked
   - `semantic` → Disabled + Visually Unchecked
   - `agent_supreme` → Disabled + Visually Unchecked

**Visual Feedback:**
- Locked toggles appear grayed out in the UI
- Checkbox state is forced to unchecked
- Hover tooltip explains: "Attach a folder to enable this feature"

**Rationale:**
Code Map and Semantic features require actual project files to function correctly. Without attached folders, enabling these would cause the AI to generate generic or hallucinated responses about non-existent code structures.

### 5. Concurrency Safety

Rapid UI interactions (e.g., toggle chain-reactions from `agent_supreme`) can cause race conditions when writing to configuration files.

**Protection Mechanisms:**
- **Write-Locks**: JSON file operations use atomic write patterns with file locking
- **Queue System**: Configuration writes are queued and processed sequentially
- **Debounce Logic**: Rapid toggle changes are batched before persisting
- **Validation**: Pre-write validation ensures configuration integrity

```
User clicks "Agent Supreme" ON
           │
           ▼
┌─────────────────────────┐
│   Toggle Event Queue    │
│   (Debounced 50ms)      │
└─────────────────────────┘
           │
           ▼
┌─────────────────────────┐
│   Acquire Write Lock    │
│   (Prevents concurrent  │
│    file access)         │
└─────────────────────────┘
           │
           ▼
┌─────────────────────────┐
│   Atomic JSON Write     │
│   (Write to temp file,  │
│    then rename)         │
└─────────────────────────┘
           │
           ▼
┌─────────────────────────┐
│   Release Lock + Sync   │
│   UI State              │
└─────────────────────────┘
```

## Architecture

### Directory Structure

```
FM-AI/
├── frontend/           # Electron + TypeScript desktop client
│   ├── src/
│   │   ├── main.ts     # Electron main process
│   │   ├── preload.ts  # Preload script (contextBridge)
│   │   └── renderer/   # UI components (HTML/CSS/TS)
│   └── chatFeatures.json
├── backend/            # Python FastAPI server
│   ├── main.py         # FastAPI application entry
│   ├── models.py       # SQLAlchemy database models
│   ├── schemas.py      # Pydantic validation schemas
│   └── database.py     # SQLite connection (WAL mode)
├── assets/             # Application assets (icons, images)
├── forestmind.sqlite   # Persistent database
├── .env                # Environment variables (OpenRouter token)
└── package.json        # Node.js dependencies
```

### Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│     User     │────►│   Electron   │────►│   Node.js    │
│   (UI/TS)    │     │   Frontend   │     │   Backend    │
└──────────────┘     └──────────────┘     └──────────────┘
                                                │
                          ┌─────────────────────┼─────────────────────┐
                          │                     │                     │
                          ▼                     ▼                     ▼
                   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
                   │   OpenRouter │     │   File Sys   │     │   FastAPI    │
                   │     API      │     │   (Read)     │     │   (Python)   │
                   └──────────────┘     └──────────────┘     └──────────────┘
                                                                  │
                                                                  ▼
                                                           ┌──────────────┐
                                                           │    SQLite    │
                                                           │   (WAL Mode) │
                                                           └──────────────┘
```

### Database Schema (Simplified)

```sql
-- Chat Sessions
CREATE TABLE chat_sessions (
    id INTEGER PRIMARY KEY,
    title TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Messages
CREATE TABLE messages (
    id INTEGER PRIMARY KEY,
    session_id INTEGER,
    role TEXT,              -- 'user' or 'assistant'
    content TEXT,
    created_at TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
);

-- Folder Attachments
CREATE TABLE folder_attachments (
    id INTEGER PRIMARY KEY,
    session_id INTEGER,
    folder_path TEXT,
    created_at TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
);
```

## Getting Started

### Prerequisites

- Node.js 18+ 
- Python 3.10+
- OpenRouter API key

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd FM-AI
   ```

2. **Install Node.js dependencies**
   ```bash
   npm install
   ```

3. **Set up Python environment**
   ```bash
   cd backend
   python -m venv venv
   venv\Scripts\activate  # Windows
   pip install -r requirements.txt
   ```

4. **Configure environment**
   ```bash
   # Create .env file
   OPENROUTER_API_KEY=your_api_key_here
   ```

5. **Start the application**
   ```bash
   # Terminal 1: Start Python backend
   cd backend
   uvicorn main:app --reload

   # Terminal 2: Start Electron frontend
   npm run dev
   ```

## Configuration

### chatFeatures.json

```json
{
  "use_codemap": false,
  "use_semantic": false,
  "agent_supreme": false
}
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENROUTER_API_KEY` | Your OpenRouter API bearer token | Yes |
| `DATABASE_PATH` | Path to SQLite database | No (default: `./forestmind.sqlite`) |
| `BACKEND_URL` | FastAPI backend URL | No (default: `http://localhost:8000`) |

## License

MIT

---

**ForestMind AI** – Your code, your context, your AI.
