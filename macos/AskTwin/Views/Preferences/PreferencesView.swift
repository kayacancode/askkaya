import SwiftUI

struct PreferencesView: View {
    var body: some View {
        TabView {
            GeneralPrefsView()
                .tabItem {
                    Label("General", systemImage: "gear")
                }

            IngestionPrefsView()
                .tabItem {
                    Label("Ingestion", systemImage: "folder")
                }

            AccountPrefsView()
                .tabItem {
                    Label("Account", systemImage: "person.crop.circle")
                }
        }
        .frame(width: 450, height: 300)
    }
}

struct GeneralPrefsView: View {
    @AppStorage("launchAtLogin") private var launchAtLogin = true
    @AppStorage("showInMenubar") private var showInMenubar = true
    @AppStorage("showNotifications") private var showNotifications = true

    var body: some View {
        Form {
            Section("Startup") {
                Toggle("Launch AskTwin at login", isOn: $launchAtLogin)
                Toggle("Show in menubar", isOn: $showInMenubar)
            }

            Section("Notifications") {
                Toggle("Show ingestion notifications", isOn: $showNotifications)
            }

            Section("Data") {
                Button("Clear Local Cache") {
                    // TODO: Implement cache clearing
                }
            }
        }
        .formStyle(.grouped)
        .padding()
    }
}

struct IngestionPrefsView: View {
    @AppStorage("inboxPath") private var inboxPath = "~/AskTwin/Inbox"
    @AppStorage("autoIngest") private var autoIngest = true
    @AppStorage("moveAfterIngest") private var moveAfterIngest = true

    var body: some View {
        Form {
            Section("Inbox Folder") {
                HStack {
                    TextField("Path", text: $inboxPath)
                        .textFieldStyle(.roundedBorder)
                        .disabled(true)

                    Button("Change...") {
                        selectFolder()
                    }
                }

                Toggle("Automatically ingest new files", isOn: $autoIngest)
            }

            Section("After Ingestion") {
                Toggle("Move files to Processed folder", isOn: $moveAfterIngest)
            }

            Section("Supported File Types") {
                Text("PDF (.pdf), Markdown (.md), Text (.txt), Word (.docx)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section {
                Button("Open Inbox Folder") {
                    let url = URL(fileURLWithPath: NSString(string: inboxPath).expandingTildeInPath)
                    NSWorkspace.shared.open(url)
                }
            }
        }
        .formStyle(.grouped)
        .padding()
    }

    private func selectFolder() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false

        if panel.runModal() == .OK, let url = panel.url {
            inboxPath = url.path
            FolderWatcher.shared.startWatching(path: url.path)
        }
    }
}

struct AccountPrefsView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        Form {
            Section("Account") {
                if let user = appState.currentUser {
                    LabeledContent("Email", value: user.email)
                    LabeledContent("User ID", value: user.uid)
                } else {
                    Text("Not logged in")
                        .foregroundStyle(.secondary)
                }
            }

            Section("Tenant") {
                if let tenantId = appState.currentTenantId {
                    LabeledContent("Tenant ID", value: tenantId)
                }
            }

            Section {
                Button("Sign Out", role: .destructive) {
                    Task {
                        await appState.logout()
                    }
                }
            }
        }
        .formStyle(.grouped)
        .padding()
    }
}

#Preview {
    PreferencesView()
        .environmentObject(AppState.shared)
}
