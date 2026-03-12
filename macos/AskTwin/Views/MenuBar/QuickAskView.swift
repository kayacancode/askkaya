import SwiftUI

struct QuickAskView: View {
    @StateObject private var appState = AppState.shared
    @State private var question = ""
    @State private var response: AskResponse?
    @State private var isLoading = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 0) {
            // Header with twin selector
            HStack {
                if let twin = appState.selectedTwin {
                    Menu {
                        ForEach(appState.twins) { t in
                            Button(action: { appState.selectedTwin = t }) {
                                HStack {
                                    Image(systemName: t.icon)
                                    Text(t.name)
                                    if t.twinId == twin.twinId {
                                        Image(systemName: "checkmark")
                                    }
                                }
                            }
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: twin.icon)
                                .foregroundColor(.blue)
                            Text("Ask \(twin.name)")
                                .fontWeight(.medium)
                            Image(systemName: "chevron.down")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .buttonStyle(.plain)
                } else {
                    Text("No twin selected")
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Button(action: openMainWindow) {
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                }
                .buttonStyle(.plain)
                .help("Open main window")
            }
            .padding()
            .background(.bar)

            Divider()

            // Response or placeholder
            ScrollView {
                if let response = response {
                    ResponseView(response: response)
                } else if let error = error {
                    VStack(spacing: 8) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.title)
                            .foregroundStyle(.orange)
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding()
                } else if isLoading {
                    VStack(spacing: 12) {
                        ProgressView()
                        Text("Thinking...")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding()
                } else {
                    VStack(spacing: 12) {
                        Image(systemName: "bubble.left.and.bubble.right")
                            .font(.largeTitle)
                            .foregroundStyle(.secondary)
                        Text("Ask a question below")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding()
                }
            }
            .frame(maxHeight: .infinity)

            Divider()

            // Input
            HStack(spacing: 8) {
                TextField("Ask something...", text: $question)
                    .textFieldStyle(.plain)
                    .onSubmit(ask)

                Button(action: ask) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                }
                .buttonStyle(.plain)
                .foregroundColor(question.isEmpty ? .secondary : .blue)
                .disabled(question.isEmpty || isLoading)
            }
            .padding()
            .background(.bar)
        }
        .frame(width: 350, height: 400)
    }

    private func ask() {
        guard !question.isEmpty,
              let tenantId = appState.currentTenantId,
              let twin = appState.selectedTwin else {
            return
        }

        let q = question
        question = ""
        isLoading = true
        error = nil
        response = nil

        Task {
            do {
                let result = try await APIClient.shared.ask(
                    question: q,
                    target: twin.slug,
                    tenantId: tenantId
                )
                await MainActor.run {
                    response = result
                    isLoading = false
                }
            } catch {
                await MainActor.run {
                    self.error = error.localizedDescription
                    isLoading = false
                }
            }
        }
    }

    private func openMainWindow() {
        NSApp.activate(ignoringOtherApps: true)
        if let window = NSApp.windows.first(where: { $0.title == "AskTwin" || $0.isVisible }) {
            window.makeKeyAndOrderFront(nil)
        }
    }
}

struct ResponseView: View {
    let response: AskResponse

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(response.answer)
                .textSelection(.enabled)

            HStack(spacing: 16) {
                HStack(spacing: 4) {
                    Image(systemName: "target")
                    Text("\(Int(response.confidence * 100))%")
                }
                .font(.caption)
                .foregroundStyle(.secondary)

                if response.escalated {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.up.message")
                        Text("Escalated")
                    }
                    .font(.caption)
                    .foregroundStyle(.orange)
                }
            }

            if !response.sources.isEmpty {
                HStack(spacing: 4) {
                    Image(systemName: "doc.text")
                    Text(response.sources.map(\.title).joined(separator: ", "))
                        .lineLimit(1)
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
        .padding()
    }
}

// MARK: - Compact Menu Bar View

struct MenuBarQuickAskView: View {
    @StateObject private var appState = AppState.shared
    @State private var question = ""
    @State private var isLoading = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Last response snippet (if any)
            if let twin = appState.selectedTwin {
                Text("Ask \(twin.name)...")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            // Compact input
            HStack(spacing: 8) {
                TextField("Quick question...", text: $question)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 12))
                    .onSubmit(ask)

                if isLoading {
                    ProgressView()
                        .scaleEffect(0.7)
                } else {
                    Button(action: ask) {
                        Image(systemName: "arrow.up.circle.fill")
                            .foregroundColor(question.isEmpty ? .secondary : .blue)
                    }
                    .buttonStyle(.plain)
                    .disabled(question.isEmpty)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(width: 280)
    }

    private func ask() {
        guard !question.isEmpty,
              let twin = appState.selectedTwin else {
            return
        }

        let q = question
        question = ""
        isLoading = true

        Task {
            do {
                // Use bundled CLI
                _ = try await CLIService.shared.ask(
                    question: q,
                    target: twin.slug
                )
                await MainActor.run {
                    isLoading = false
                    // Open main window to show response
                    NSApp.activate(ignoringOtherApps: true)
                }
            } catch {
                await MainActor.run {
                    isLoading = false
                }
            }
        }
    }
}

#Preview {
    QuickAskView()
}
