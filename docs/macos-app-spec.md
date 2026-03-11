# AskTwin macOS App - Product Spec v0

## Overview

Native macOS menubar app for querying digital twins with folder-based document ingestion. Wraps existing backend APIs with a native UI.

**App Name Options:** `AskTwin`, `Twin`, `Ask`
**Binary/CLI:** `ask` (e.g., `ask harper "What's the API rate limit?"`)

---

## 1. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     macOS App (Swift)                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Menubar    │  │  Chat       │  │  Folder Watcher     │  │
│  │  Icon/Menu  │  │  Window     │  │  (FSEvents)         │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘             │
│                          │                                   │
│                    ┌─────▼─────┐                             │
│                    │  API      │                             │
│                    │  Client   │                             │
│                    └─────┬─────┘                             │
│                          │                                   │
└──────────────────────────┼───────────────────────────────────┘
                           │ HTTPS
                           ▼
              ┌────────────────────────┐
              │  Firebase Functions    │
              │  - askApi              │
              │  - twinsApi            │
              │  - ingestApi           │
              │  - meApi               │
              └────────────────────────┘
```

---

## 2. Tech Stack

| Component | Technology |
|-----------|------------|
| Language | Swift 5.9+ |
| UI | SwiftUI + AppKit (for menubar) |
| Min OS | macOS 13.0 (Ventura) |
| Networking | URLSession + async/await |
| Auth Storage | Keychain Services |
| Local DB | SwiftData (or UserDefaults for v0) |
| File Watching | FSEvents / DispatchSource |
| Distribution | Direct .dmg + notarization (later: App Store) |

---

## 3. Core Features (v0)

### 3.1 Menubar Presence

**Icon:** Small twin/avatar icon in system menubar (NSStatusItem)

**Menu Structure:**
```
┌─────────────────────────────────┐
│ 🟢 Ask Harper              ▸   │  ← Current twin + submenu to switch
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ Ask something...           │ │  ← Quick input field
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ Recent: "What's the API..."     │  ← Last question (clickable)
├─────────────────────────────────┤
│ 📂 Open Inbox Folder            │
│ 📊 Open Dashboard               │
├─────────────────────────────────┤
│ ⚙️  Preferences...              │
│ 📤 Sign Out                     │
│ ⏻  Quit AskTwin                 │
└─────────────────────────────────┘
```

**Quick Ask Flow:**
1. Click menubar icon or press global hotkey (⌥Space)
2. Type question in inline field
3. Press Enter → shows compact response in popover
4. Click "Expand" to open full chat window

### 3.2 Chat Window

**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│ ← Back    Ask Harper    [avatar]    ⚙️                   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ You: What are the best practices for OpenClaw?     │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Harper: Based on the documentation...              │  │
│  │                                                    │  │
│  │ 1. Always use TLS for gateway connections          │  │
│  │ 2. Rotate API keys every 90 days                   │  │
│  │ ...                                                │  │
│  │                                                    │  │
│  │ 📎 Sources: security-guide.md, faq.pdf            │  │
│  │ 🎯 Confidence: 85%                                 │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 📬 Escalated to real Harper (pending response)     │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────┐ [Send] │
│ │ Type your question...                        │        │
│ └──────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────┘
```

**Features:**
- Conversation history (persisted locally)
- Markdown rendering in responses
- Source attribution links
- Escalation status indicator
- Image attachment support (drag & drop or paste)

### 3.3 Twin Selector

**Sidebar (in main window):**
```
┌────────────────────┐
│ MY TWINS           │
│ ┌────────────────┐ │
│ │ 👤 Ask Me      │ │  ← User's personal twin
│ └────────────────┘ │
│                    │
│ CONNECTED          │
│ ┌────────────────┐ │
│ │ 👨 Ask Harper  │ │
│ │ 👩 Ask Kaya    │ │
│ │ 🏢 Acme Corp   │ │  ← Organization twin
│ └────────────────┘ │
│                    │
│ [+ Add Twin]       │  ← Join via invite code
└────────────────────┘
```

### 3.4 Folder-Based Ingestion

**Default Location:** `~/AskTwin/Inbox/`

**How it works:**
1. User drops file into `~/AskTwin/Inbox/`
2. App detects new file via FSEvents
3. Shows system notification: "Ingesting report.pdf..."
4. Calls `POST /ingestApi` with file content
5. On success:
   - Move to `~/AskTwin/Processed/` (or add ✓ badge)
   - Update notification: "report.pdf added to Harper's knowledge"
6. On failure:
   - Move to `~/AskTwin/Failed/`
   - Show error notification with retry option

**Supported Formats (v0):**
- `.pdf` - PDF documents
- `.md` - Markdown
- `.txt` - Plain text
- `.docx` - Word documents (via pandoc or native)

**Per-Twin Folders (v1):**
```
~/AskTwin/
├── Inbox/           ← Default (goes to primary twin)
├── Harper/          ← Dedicated folder for Harper
├── Kaya/            ← Dedicated folder for Kaya
├── Processed/       ← Successfully ingested
└── Failed/          ← Failed ingestion (retry available)
```

---

## 4. User Flows

### 4.1 First Launch / Onboarding

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│              👋 Welcome to AskTwin                     │
│                                                        │
│     Your AI-powered knowledge assistant that           │
│     lives in your menubar.                             │
│                                                        │
│  ┌────────────────────────────────────────────────┐   │
│  │  📧 Sign in with Email                         │   │
│  └────────────────────────────────────────────────┘   │
│                                                        │
│  ┌────────────────────────────────────────────────┐   │
│  │  🔗 I have an invite code                      │   │
│  └────────────────────────────────────────────────┘   │
│                                                        │
│               Already have an account?                 │
│                    [Sign In]                           │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Steps:**
1. Sign in (email/password or magic link)
2. Fetch user profile + accessible twins via `GET /meApiV2`
3. If no twins: prompt to create personal twin or enter invite code
4. Create `~/AskTwin/Inbox/` folder
5. Request permission for notifications
6. Show brief tutorial overlay
7. Minimize to menubar

### 4.2 Quick Ask (Menubar)

1. User clicks menubar icon (or ⌥Space hotkey)
2. Popover appears with input field
3. User types: "What's the deployment process?"
4. User presses Enter
5. Loading indicator shows
6. Response appears in popover (truncated if long)
7. User can click "Open in Chat" for full view

### 4.3 Document Ingestion

1. User drags `quarterly-report.pdf` to `~/AskTwin/Inbox/`
2. System notification: "📄 Ingesting quarterly-report.pdf..."
3. File uploaded to backend
4. Processing status polled
5. Success notification: "✅ quarterly-report.pdf added to your knowledge base"
6. File moved to `~/AskTwin/Processed/`

---

## 5. API Integration

### 5.1 Authentication

```swift
// POST /auth/login
struct LoginRequest: Codable {
    let email: String
    let password: String
}

struct LoginResponse: Codable {
    let idToken: String
    let refreshToken: String
    let expiresIn: Int
    let userId: String
    let email: String
}

// Store in Keychain
KeychainService.save(token: response.idToken, for: "idToken")
KeychainService.save(token: response.refreshToken, for: "refreshToken")
```

### 5.2 Get User Profile & Twins

```swift
// GET /meApiV2
// Headers: Authorization: Bearer <idToken>

struct MeResponse: Codable {
    let user: User
    let tenants: [Tenant]
    let memberships: [Membership]
}

// GET /twinsApi
// Headers: Authorization: Bearer <idToken>, X-Tenant-ID: <tenantId>

struct TwinsResponse: Codable {
    let twins: [Twin]
}

struct Twin: Codable {
    let twinId: String
    let name: String
    let slug: String
    let type: String  // "person", "team", "organization"
    let visibility: String
    let expertiseAreas: [String]
}
```

### 5.3 Ask Question

```swift
// POST /askApi
// Headers: Authorization: Bearer <idToken>, X-Tenant-ID: <tenantId>

struct AskRequest: Codable {
    let question: String
    let target: String?  // twin slug or ID
    let image: ImageData?
}

struct AskResponse: Codable {
    let targetTwin: TwinInfo
    let answer: String
    let confidence: Double
    let sources: [Source]
    let escalated: Bool
}
```

### 5.4 Ingest Document

```swift
// POST /ingestApi
// Headers: Authorization: Bearer <idToken>, X-Tenant-ID: <tenantId>
// Content-Type: multipart/form-data

// Form fields:
// - file: <binary>
// - metadata: { "filename": "...", "twinId": "..." }

struct IngestResponse: Codable {
    let sourceId: String
    let status: String  // "processing", "completed", "failed"
    let chunksCreated: Int?
}
```

---

## 6. Local Storage

### 6.1 UserDefaults (Settings)

```swift
struct AppSettings {
    var selectedTwinId: String?
    var inboxFolderPath: String = "~/AskTwin/Inbox"
    var launchAtLogin: Bool = true
    var globalHotkey: String = "⌥Space"
    var showNotifications: Bool = true
    var autoIngest: Bool = true
}
```

### 6.2 SwiftData (Conversations Cache)

```swift
@Model
class Conversation {
    var id: UUID
    var twinId: String
    var twinName: String
    var messages: [Message]
    var createdAt: Date
    var updatedAt: Date
}

@Model
class Message {
    var id: UUID
    var role: String  // "user" or "assistant"
    var content: String
    var confidence: Double?
    var sources: [String]?
    var escalated: Bool
    var timestamp: Date
}
```

---

## 7. Preferences Window

```
┌─────────────────────────────────────────────────────────┐
│ General │ Ingestion │ Twins │ Account │                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  STARTUP                                                │
│  ☑️ Launch AskTwin at login                             │
│  ☑️ Show in menubar                                     │
│                                                         │
│  KEYBOARD                                               │
│  Global hotkey: [ ⌥ Space        ] [Record]             │
│                                                         │
│  NOTIFICATIONS                                          │
│  ☑️ Show ingestion notifications                        │
│  ☑️ Show escalation responses                           │
│                                                         │
│  DATA                                                   │
│  Conversation history: [Keep forever ▾]                 │
│  [Clear Local Cache]                                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Ingestion Tab:**
```
┌─────────────────────────────────────────────────────────┐
│  INBOX FOLDER                                           │
│  📂 ~/AskTwin/Inbox                    [Change...]      │
│  ☑️ Automatically ingest new files                      │
│                                                         │
│  DEFAULT TWIN FOR INGESTION                             │
│  [Ask Harper ▾]                                         │
│                                                         │
│  SUPPORTED FILES                                        │
│  ☑️ PDF (.pdf)                                          │
│  ☑️ Markdown (.md)                                      │
│  ☑️ Text (.txt)                                         │
│  ☑️ Word (.docx)                                        │
│                                                         │
│  AFTER INGESTION                                        │
│  ○ Move to Processed folder                             │
│  ● Leave in place (add badge)                           │
│  ○ Delete original                                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 8. Project Structure

```
AskTwin/
├── AskTwin.xcodeproj
├── AskTwin/
│   ├── App/
│   │   ├── AskTwinApp.swift           # @main, app lifecycle
│   │   ├── AppDelegate.swift          # NSApplicationDelegate
│   │   └── MenuBarController.swift    # NSStatusItem management
│   │
│   ├── Views/
│   │   ├── Chat/
│   │   │   ├── ChatView.swift
│   │   │   ├── MessageBubble.swift
│   │   │   └── ChatInputView.swift
│   │   ├── Onboarding/
│   │   │   ├── WelcomeView.swift
│   │   │   └── LoginView.swift
│   │   ├── MenuBar/
│   │   │   ├── QuickAskPopover.swift
│   │   │   └── TwinSelectorMenu.swift
│   │   ├── Preferences/
│   │   │   ├── PreferencesWindow.swift
│   │   │   ├── GeneralPrefsView.swift
│   │   │   └── IngestionPrefsView.swift
│   │   └── Components/
│   │       ├── TwinAvatar.swift
│   │       └── SourceBadge.swift
│   │
│   ├── Models/
│   │   ├── Twin.swift
│   │   ├── Conversation.swift
│   │   ├── Message.swift
│   │   └── AppSettings.swift
│   │
│   ├── Services/
│   │   ├── APIClient.swift            # HTTP networking
│   │   ├── AuthService.swift          # Login, token refresh
│   │   ├── KeychainService.swift      # Secure storage
│   │   ├── FolderWatcher.swift        # FSEvents wrapper
│   │   ├── IngestionService.swift     # File upload logic
│   │   └── HotkeyService.swift        # Global hotkey
│   │
│   ├── Utilities/
│   │   ├── MarkdownRenderer.swift
│   │   └── FileTypeDetector.swift
│   │
│   └── Resources/
│       ├── Assets.xcassets
│       ├── Localizable.strings
│       └── AskTwin.entitlements
│
├── AskTwinTests/
└── README.md
```

---

## 9. v0 Milestones

### Milestone 1: Shell (Week 1)
- [ ] Xcode project setup with SwiftUI
- [ ] Menubar icon + basic menu
- [ ] Empty chat window opens from menu
- [ ] App stays running when window closed

### Milestone 2: Auth (Week 1-2)
- [ ] Login view (email/password)
- [ ] API client with token handling
- [ ] Keychain storage for tokens
- [ ] Auto-refresh tokens on expiry
- [ ] Logout flow

### Milestone 3: Chat (Week 2-3)
- [ ] Fetch twins list on login
- [ ] Twin selector in sidebar
- [ ] Chat view with message history
- [ ] Send question → askApi
- [ ] Display response with sources
- [ ] Markdown rendering
- [ ] Local conversation cache

### Milestone 4: Quick Ask (Week 3)
- [ ] Popover from menubar
- [ ] Inline question input
- [ ] Compact response display
- [ ] "Open in Chat" action
- [ ] Global hotkey (⌥Space)

### Milestone 5: Ingestion (Week 4)
- [ ] Create ~/AskTwin/Inbox on first run
- [ ] FSEvents folder watcher
- [ ] File upload to ingestApi
- [ ] System notifications
- [ ] Move to Processed folder
- [ ] Error handling + retry

### Milestone 6: Polish (Week 4-5)
- [ ] Preferences window
- [ ] Launch at login
- [ ] Onboarding flow
- [ ] App icon + branding
- [ ] Notarization + .dmg packaging

---

## 10. Future (v1+)

- **Streaming responses** - Token-by-token via SSE
- **Escalation notifications** - Push when human responds
- **Multiple ingestion folders** - Per-twin watched folders
- **Offline mode** - Cache recent responses
- **Search** - Search conversation history
- **Slack integration** - Connect Slack workspace
- **Team features** - Share twins within organization
- **Analytics dashboard** - Usage stats in-app
- **Voice input** - "Hey Twin, what's..."
- **iOS companion app** - Mobile client

---

## 11. Open Questions

1. **App name?** AskTwin, Twin, Ask, or keep AskKaya?
2. **Distribution?** Direct download vs Mac App Store?
3. **Pricing?** Free tier limits? Pro features?
4. **Bundled CLI?** Include `ask` binary or separate install?
5. **Offline support?** Cache how many conversations?
