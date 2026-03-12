import SwiftUI

@main
struct AskTwinApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var appState = AppState.shared

    var body: some Scene {
        // Main chat window
        WindowGroup {
            ContentView()
                .environmentObject(appState)
        }
        .commands {
            CommandGroup(replacing: .newItem) { }
        }

        // Preferences window
        Settings {
            PreferencesView()
                .environmentObject(appState)
        }
    }
}

// MARK: - App Delegate

class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem?
    private var ingestionPaused = false
    private var globalHotkeyMonitor: Any?

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupMenuBar()
        setupInboxFolder()
        setupGlobalHotkey()

        // Hide dock icon (menubar app)
        // NSApp.setActivationPolicy(.accessory)  // Uncomment for menubar-only mode
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let monitor = globalHotkeyMonitor {
            NSEvent.removeMonitor(monitor)
        }
    }

    // MARK: - Global Hotkey (Cmd+Shift+K)

    private func setupGlobalHotkey() {
        globalHotkeyMonitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
            // Cmd+Shift+K to open AskTwin
            if event.modifierFlags.contains([.command, .shift]) && event.keyCode == 40 { // 40 = K
                self?.openMainWindow()
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return false  // Keep running in menubar
    }

    // MARK: - Menu Bar

    private func setupMenuBar() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem?.button {
            if let image = NSImage(systemSymbolName: "person.crop.circle.fill", accessibilityDescription: "AskTwin") {
                image.isTemplate = true
                button.image = image
            } else {
                button.title = "🤖"
            }
        }

        updateMenu()

        // Observe twin changes to update menu
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(updateMenu),
            name: NSNotification.Name("TwinsUpdated"),
            object: nil
        )
    }

    @objc private func updateMenu() {
        Task { @MainActor in
            let menu = NSMenu()

            // Header with selected twin
            let selectedTwin = AppState.shared.selectedTwin
            let headerItem = NSMenuItem()
            headerItem.title = "Ask \(selectedTwin?.name ?? "Twin")"
            headerItem.isEnabled = false
            menu.addItem(headerItem)

            menu.addItem(NSMenuItem.separator())

            // Quick Ask input (custom view)
            let quickAskItem = NSMenuItem()
            let quickAskView = NSHostingView(rootView: MenuBarQuickAskView())
            quickAskView.frame = NSRect(x: 0, y: 0, width: 280, height: 80)
            quickAskItem.view = quickAskView
            menu.addItem(quickAskItem)

            menu.addItem(NSMenuItem.separator())

            // Add Files button
            let addFilesItem = NSMenuItem(title: "Add Files to KB...", action: #selector(addFilesToKB), keyEquivalent: "i")
            addFilesItem.target = self
            menu.addItem(addFilesItem)

            // Paste from clipboard
            let pasteItem = NSMenuItem(title: "Paste Clipboard to KB", action: #selector(pasteClipboardToKB), keyEquivalent: "v")
            pasteItem.keyEquivalentModifierMask = [.command, .shift]
            pasteItem.target = self
            menu.addItem(pasteItem)

            // Granola sync button (reads directly from Granola's local cache)
            let granolaItem = NSMenuItem(title: "Sync Granola (30 days)", action: #selector(syncGranola), keyEquivalent: "g")
            granolaItem.target = self
            menu.addItem(granolaItem)

            menu.addItem(NSMenuItem.separator())

            // Twin switcher submenu
            let twinsMenu = NSMenu()
            let twins = AppState.shared.twins

            if twins.isEmpty {
                let noTwinsItem = NSMenuItem(title: "No twins available", action: nil, keyEquivalent: "")
                noTwinsItem.isEnabled = false
                twinsMenu.addItem(noTwinsItem)
            } else {
                for twin in twins {
                    let item = NSMenuItem(title: "\(twin.name) (\(twin.type))", action: #selector(selectTwin(_:)), keyEquivalent: "")
                    item.target = self
                    item.representedObject = twin
                    if twin.id == selectedTwin?.id {
                        item.state = .on
                    }
                    twinsMenu.addItem(item)
                }
            }

            let twinsMenuItem = NSMenuItem(title: "Switch Twin", action: nil, keyEquivalent: "")
            twinsMenuItem.submenu = twinsMenu
            menu.addItem(twinsMenuItem)

            menu.addItem(NSMenuItem.separator())

            // Actions
            menu.addItem(NSMenuItem(title: "Open Main Window", action: #selector(openMainWindow), keyEquivalent: "o"))

            let ingestionTitle = ingestionPaused ? "Resume Ingestion" : "Pause Ingestion"
            menu.addItem(NSMenuItem(title: ingestionTitle, action: #selector(toggleIngestion), keyEquivalent: ""))

            menu.addItem(NSMenuItem.separator())

            menu.addItem(NSMenuItem(title: "Preferences...", action: #selector(openPreferences), keyEquivalent: ","))
            menu.addItem(NSMenuItem(title: "Quit AskTwin", action: #selector(quitApp), keyEquivalent: "q"))

            statusItem?.menu = menu
        }
    }

    @objc private func selectTwin(_ sender: NSMenuItem) {
        guard let twin = sender.representedObject as? Twin else { return }
        Task { @MainActor in
            AppState.shared.selectedTwin = twin
            updateMenu()
        }
    }

    @objc private func openMainWindow() {
        NSApp.activate(ignoringOtherApps: true)
        if let window = NSApp.windows.first(where: { $0.title == "AskTwin" || $0.contentView != nil }) {
            window.makeKeyAndOrderFront(nil)
        }
    }

    @objc private func toggleIngestion() {
        ingestionPaused.toggle()
        if ingestionPaused {
            FolderWatcher.shared.stopWatching()
        } else {
            let inboxPath = FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent("AskTwin")
                .appendingPathComponent("Inbox")
            FolderWatcher.shared.startWatching(path: inboxPath.path)
        }
        updateMenu()
    }

    @objc private func addFilesToKB() {
        Task { @MainActor in
            guard let tenantId = AppState.shared.currentTenantId else {
                let alert = NSAlert()
                alert.messageText = "Not Logged In"
                alert.informativeText = "Please log in first."
                alert.alertStyle = .warning
                alert.runModal()
                return
            }

            let panel = NSOpenPanel()
            panel.allowsMultipleSelection = true
            panel.canChooseDirectories = false
            panel.canChooseFiles = true
            panel.allowedContentTypes = [.pdf, .plainText, .html, .json, .text]
            panel.message = "Select files to add to your knowledge base"

            if panel.runModal() == .OK {
                let urls = panel.urls
                // Show preview window for redaction before ingestion
                DocumentPreviewWindowController.shared.showPreview(for: urls, tenantId: tenantId) { success, failed in
                    NSLog("[AppDelegate] Ingestion complete: \(success) success, \(failed) failed")
                }
            }
        }
    }

    private func ingestFiles(_ urls: [URL]) async {
        guard let twin = await MainActor.run(body: { AppState.shared.selectedTwin }),
              let tenantId = await MainActor.run(body: { AppState.shared.currentTenantId }) else {
            return
        }

        var successCount = 0
        var failCount = 0

        var lastError: String = ""
        for url in urls {
            do {
                NSLog("[AppDelegate] Ingesting: \(url.path)")
                _ = try await APIClient.shared.ingestDocument(
                    fileURL: url,
                    twinId: twin.twinId,
                    tenantId: tenantId
                )
                successCount += 1
                NSLog("[AppDelegate] Ingest succeeded for \(url.lastPathComponent)")
            } catch {
                lastError = error.localizedDescription
                NSLog("[AppDelegate] Ingest failed for \(url.lastPathComponent): \(error)")
                failCount += 1
            }
        }

        // Show result notification
        let errorMsg = lastError
        await MainActor.run {
            let alert = NSAlert()
            if failCount == 0 {
                alert.messageText = "Files Added"
                alert.informativeText = "Added \(successCount) file\(successCount == 1 ? "" : "s") to your knowledge base."
                alert.alertStyle = .informational
            } else {
                alert.messageText = "Ingestion Failed"
                alert.informativeText = "Error: \(errorMsg)"
                alert.alertStyle = .warning
            }
            alert.runModal()
        }
    }

    @objc private func pasteClipboardToKB() {
        guard let clipboardString = NSPasteboard.general.string(forType: .string),
              !clipboardString.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            let alert = NSAlert()
            alert.messageText = "Clipboard Empty"
            alert.informativeText = "Copy some text first, then try again."
            alert.alertStyle = .informational
            alert.runModal()
            return
        }

        Task {
            await ingestClipboardText(clipboardString)
        }
    }

    private func ingestClipboardText(_ text: String) async {
        guard let tenantId = await MainActor.run(body: { AppState.shared.currentTenantId }) else {
            await MainActor.run {
                let alert = NSAlert()
                alert.messageText = "Not Logged In"
                alert.informativeText = "Please log in first."
                alert.alertStyle = .warning
                alert.runModal()
            }
            return
        }

        do {
            let token = try await AuthService.shared.getValidToken()

            var request = URLRequest(url: URL(string: "https://us-central1-askkaya-47cef.cloudfunctions.net/ingestApi")!)
            request.httpMethod = "POST"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue(tenantId, forHTTPHeaderField: "X-Tenant-ID")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            let preview = String(text.prefix(50)).replacingOccurrences(of: "\n", with: " ")
            let item: [String: Any] = [
                "content": text,
                "title": "Clipboard: \(preview)...",
                "source": "clipboard",
                "client_id": tenantId
            ]
            let body: [String: Any] = ["items": [item]]
            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse, 200..<300 ~= httpResponse.statusCode else {
                throw APIError.invalidResponse
            }

            let result = try JSONDecoder().decode(IngestResponse.self, from: data)

            await MainActor.run {
                let alert = NSAlert()
                alert.messageText = "Added to KB"
                alert.informativeText = "Clipboard content added (\(text.count) chars, \(result.created) item\(result.created == 1 ? "" : "s"))."
                alert.alertStyle = .informational
                alert.runModal()
            }
        } catch {
            await MainActor.run {
                let alert = NSAlert()
                alert.messageText = "Failed"
                alert.informativeText = error.localizedDescription
                alert.alertStyle = .warning
                alert.runModal()
            }
        }
    }

    @objc private func syncGranola() {
        Task {
            await syncGranolaFromCache()
        }
    }

    private func syncGranolaFromCache() async {
        guard let tenantId = await MainActor.run(body: { AppState.shared.currentTenantId }) else {
            await MainActor.run {
                let alert = NSAlert()
                alert.messageText = "Not Logged In"
                alert.informativeText = "Please log in first to sync Granola notes."
                alert.alertStyle = .warning
                alert.runModal()
            }
            return
        }

        // Show syncing indicator
        await MainActor.run {
            let alert = NSAlert()
            alert.messageText = "Syncing Granola..."
            alert.informativeText = "Reading meetings from last 30 days..."
            alert.alertStyle = .informational
            alert.addButton(withTitle: "OK")
            // Don't wait for user - just flash it
        }

        do {
            let result = try await GranolaService.shared.syncToKB(days: 30, tenantId: tenantId)

            await MainActor.run {
                let alert = NSAlert()
                if result.failed == 0 {
                    alert.messageText = "Granola Sync Complete"
                    alert.informativeText = "Synced \(result.synced) meeting\(result.synced == 1 ? "" : "s") to your knowledge base."
                    alert.alertStyle = .informational
                } else if result.synced == 0 {
                    alert.messageText = "Sync Failed"
                    alert.informativeText = "Failed to sync Granola meetings. Check that Granola is installed."
                    alert.alertStyle = .warning
                } else {
                    alert.messageText = "Partial Sync"
                    alert.informativeText = "Synced \(result.synced), failed \(result.failed) of \(result.total) meetings."
                    alert.alertStyle = .warning
                }
                alert.runModal()
            }
        } catch {
            await MainActor.run {
                let alert = NSAlert()
                alert.messageText = "Granola Sync Failed"
                alert.informativeText = error.localizedDescription
                alert.alertStyle = .warning
                alert.runModal()
            }
        }
    }

    // Keep file import as fallback
    @objc private func importGranolaFile() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowedContentTypes = [.json, .plainText]
        panel.message = "Select Granola export files (JSON or Markdown)"
        panel.prompt = "Import"

        if panel.runModal() == .OK {
            Task {
                await importGranolaFiles(panel.urls)
            }
        }
    }

    private func importGranolaFiles(_ urls: [URL]) async {
        guard let tenantId = await MainActor.run(body: { AppState.shared.currentTenantId }) else { return }

        for url in urls {
            do {
                let token = try await AuthService.shared.getValidToken()
                let fileData = try Data(contentsOf: url)

                var request = URLRequest(url: URL(string: "https://us-central1-askkaya-47cef.cloudfunctions.net/ingestApi")!)
                request.httpMethod = "POST"
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                request.setValue(tenantId, forHTTPHeaderField: "X-Tenant-ID")
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")

                let body: [String: Any]
                if let jsonData = try? JSONSerialization.jsonObject(with: fileData) {
                    body = ["source": "granola", "data": jsonData]
                } else if let markdownContent = String(data: fileData, encoding: .utf8) {
                    body = ["source": "granola", "data": markdownContent]
                } else {
                    continue
                }

                request.httpBody = try JSONSerialization.data(withJSONObject: body)
                let (_, response) = try await URLSession.shared.data(for: request)

                if let httpResponse = response as? HTTPURLResponse, 200..<300 ~= httpResponse.statusCode {
                    NSLog("[AppDelegate] Imported Granola file: \(url.lastPathComponent)")
                }
            } catch {
                NSLog("[AppDelegate] Failed to import: \(error)")
            }
        }
    }

    @objc private func openPreferences() {
        NSApp.activate(ignoringOtherApps: true)
        NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
    }

    @objc private func quitApp() {
        NSApp.terminate(nil)
    }

    // MARK: - Inbox Folder

    private func setupInboxFolder() {
        let inboxPath = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("AskTwin")
            .appendingPathComponent("Inbox")

        let processedPath = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("AskTwin")
            .appendingPathComponent("Processed")

        do {
            try FileManager.default.createDirectory(at: inboxPath, withIntermediateDirectories: true)
            try FileManager.default.createDirectory(at: processedPath, withIntermediateDirectories: true)
            print("Created AskTwin folders at ~/AskTwin/")

            // Start watching
            FolderWatcher.shared.startWatching(path: inboxPath.path)
        } catch {
            print("Failed to create AskTwin folders: \(error)")
        }
    }
}

// MARK: - App State

@MainActor
class AppState: ObservableObject {
    static let shared = AppState()

    @Published var isLoggedIn = false
    @Published var currentUser: User?
    @Published var twins: [Twin] = []
    @Published var selectedTwin: Twin?
    @Published var currentTenantId: String?

    private init() {
        Task {
            await checkAuthState()
        }
    }

    func checkAuthState() async {
        let loggedIn = await AuthService.shared.isLoggedIn
        isLoggedIn = loggedIn

        if loggedIn {
            await loadUserData()
        }
    }

    func login(email: String, password: String) async throws {
        let user = try await AuthService.shared.login(email: email, password: password)
        currentUser = user
        isLoggedIn = true
        await loadUserData()
    }

    func signup(email: String, password: String) async throws {
        let user = try await AuthService.shared.signup(email: email, password: password)
        currentUser = user
        isLoggedIn = true
        // New users won't have data yet - they'll go through onboarding
    }

    func logout() async {
        await AuthService.shared.logout()
        isLoggedIn = false
        currentUser = nil
        twins = []
        selectedTwin = nil
        currentTenantId = nil
    }

    private func loadUserData() async {
        do {
            let me = try await APIClient.shared.getMe()
            currentUser = me.user

            // Get tenant ID - prefer defaultTenantId, then fall back to tenants/memberships
            var tenantId: String?
            if let defaultTenant = me.defaultTenantId {
                tenantId = defaultTenant
            } else if let firstTenant = me.tenants?.first {
                tenantId = firstTenant.id
            } else if let firstMembership = me.memberships?.first {
                tenantId = firstMembership.tenantId
            }

            if let tenantId = tenantId {
                currentTenantId = tenantId
                let twinsResponse = try await APIClient.shared.listTwins(tenantId: tenantId)
                twins = twinsResponse.twins
                selectedTwin = twins.first
            }
        } catch {
            NSLog("[AppState] Failed to load user data: %@", String(describing: error))
        }
    }
}
