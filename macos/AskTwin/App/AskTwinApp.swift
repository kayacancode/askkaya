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
    private var popover: NSPopover?

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupMenuBar()
        setupInboxFolder()

        // Hide dock icon (menubar app)
        // NSApp.setActivationPolicy(.accessory)  // Uncomment for menubar-only mode
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return false  // Keep running in menubar
    }

    // MARK: - Menu Bar

    private func setupMenuBar() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)

        if let button = statusItem?.button {
            button.image = NSImage(systemSymbolName: "person.crop.circle.fill", accessibilityDescription: "AskTwin")
            button.action = #selector(togglePopover)
            button.target = self
        }

        // Setup popover for quick ask
        popover = NSPopover()
        popover?.contentSize = NSSize(width: 350, height: 400)
        popover?.behavior = .transient
        popover?.contentViewController = NSHostingController(rootView: QuickAskView())
    }

    @objc private func togglePopover() {
        guard let button = statusItem?.button, let popover = popover else { return }

        if popover.isShown {
            popover.performClose(nil)
        } else {
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            popover.contentViewController?.view.window?.makeKey()
        }
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
        isLoggedIn = await AuthService.shared.isLoggedIn

        if isLoggedIn {
            await loadUserData()
        }
    }

    func login(email: String, password: String) async throws {
        let user = try await AuthService.shared.login(email: email, password: password)
        currentUser = user
        isLoggedIn = true
        await loadUserData()
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

            // Get first tenant
            if let firstTenant = me.tenants?.first ?? me.memberships?.first {
                let tenantId = (firstTenant as? Tenant)?.id ?? (firstTenant as? Membership)?.tenantId ?? ""
                currentTenantId = tenantId

                let twinsResponse = try await APIClient.shared.listTwins(tenantId: tenantId)
                twins = twinsResponse.twins
                selectedTwin = twins.first
            }
        } catch {
            print("Failed to load user data: \(error)")
        }
    }
}
