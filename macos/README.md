# AskTwin macOS App

Native macOS menubar app for querying digital twins with folder-based document ingestion.

## Quick Start

### Prerequisites

- macOS 13.0+ (Ventura or later)
- Xcode 15+
- Active AskKaya account

### Setup

1. **Create Xcode Project**
   ```bash
   # Open Xcode and create new project:
   # - macOS > App
   # - Product Name: AskTwin
   # - Interface: SwiftUI
   # - Language: Swift
   # - Bundle Identifier: com.askkaya.asktwin
   ```

2. **Copy Source Files**
   ```bash
   # Copy the AskTwin/ folder contents into your Xcode project
   cp -r AskTwin/* /path/to/your/xcode/project/AskTwin/
   ```

3. **Configure Entitlements**

   Add to `AskTwin.entitlements`:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
       <key>com.apple.security.app-sandbox</key>
       <true/>
       <key>com.apple.security.network.client</key>
       <true/>
       <key>com.apple.security.files.user-selected.read-write</key>
       <true/>
       <key>com.apple.security.files.bookmarks.app-scope</key>
       <true/>
   </dict>
   </plist>
   ```

4. **Add Info.plist Keys**
   ```xml
   <key>LSUIElement</key>
   <false/>  <!-- Set to true for menubar-only mode -->

   <key>NSUserNotificationAlertStyle</key>
   <string>alert</string>
   ```

5. **Build & Run**
   ```bash
   # In Xcode: Product > Run (⌘R)
   ```

## Project Structure

```
AskTwin/
├── App/
│   ├── AskTwinApp.swift         # App entry point
│   └── AppDelegate.swift        # (merged into AskTwinApp.swift)
│
├── Views/
│   ├── Chat/
│   │   └── ChatView.swift       # Main chat interface
│   ├── Onboarding/
│   │   └── LoginView.swift      # Login screen
│   ├── MenuBar/
│   │   └── QuickAskView.swift   # Menubar popover
│   └── Preferences/
│       └── PreferencesView.swift
│
├── Services/
│   ├── APIClient.swift          # Backend HTTP client
│   ├── AuthService.swift        # Auth & token management
│   └── FolderWatcher.swift      # FSEvents file watcher
│
├── Models/
│   └── (defined in APIClient.swift)
│
└── Resources/
    └── Assets.xcassets
```

## Features

### Menubar Quick Ask
- Click menubar icon to open quick ask popover
- Type question and get instant response
- Switch between twins via dropdown

### Full Chat Window
- Full conversation history
- Markdown rendering
- Source attribution
- Escalation status

### Folder-Based Ingestion
- Drop files into `~/AskTwin/Inbox/`
- Automatic upload to selected twin's knowledge base
- Supports: PDF, Markdown, Text, Word

## API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/loginApi` | POST | Authentication |
| `/meApiV2` | GET | User profile & tenants |
| `/twinsApi` | GET | List available twins |
| `/askApi` | POST | Query a twin |
| `/ingestApi` | POST | Upload documents |

## Configuration

### AppStorage Keys
- `launchAtLogin` - Auto-start on login
- `showInMenubar` - Show menubar icon
- `showNotifications` - Enable notifications
- `inboxPath` - Watched folder path
- `autoIngest` - Auto-ingest new files

### Keychain
Tokens stored securely in Keychain with service: `com.askkaya.asktwin`

## Development

### Building
```bash
xcodebuild -project AskTwin.xcodeproj -scheme AskTwin -configuration Debug build
```

### Testing
```bash
xcodebuild -project AskTwin.xcodeproj -scheme AskTwin test
```

### Creating DMG
```bash
# After archiving in Xcode:
create-dmg 'AskTwin.app' --volname 'AskTwin' --window-size 500 300
```

## Troubleshooting

### "No twin selected" error
- Ensure you're logged in
- Check that your account has at least one accessible twin

### Files not ingesting
- Check `~/AskTwin/Inbox/` folder exists
- Verify file type is supported (.pdf, .md, .txt, .docx)
- Check Console.app for error logs

### Auth errors
- Try signing out and back in
- Check network connectivity
- Verify API is accessible: `curl https://us-central1-askkaya-47cef.cloudfunctions.net/healthApi`

## License

Proprietary - AskKaya
