import SwiftUI

struct ContentView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        Group {
            if appState.isLoggedIn {
                MainView()
            } else {
                LoginView()
            }
        }
        .frame(minWidth: 700, minHeight: 500)
    }
}

struct MainView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        NavigationSplitView {
            TwinSidebar()
        } detail: {
            if let twin = appState.selectedTwin {
                ChatView(twin: twin)
            } else {
                ContentUnavailableView(
                    "No Twin Selected",
                    systemImage: "person.crop.circle.badge.questionmark",
                    description: Text("Select a twin from the sidebar to start chatting")
                )
            }
        }
        .navigationTitle("AskTwin")
    }
}

struct TwinSidebar: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        List(selection: $appState.selectedTwin) {
            Section("My Twins") {
                ForEach(appState.twins.filter { $0.type == "person" }) { twin in
                    TwinRow(twin: twin)
                        .tag(twin)
                }
            }

            Section("Organizations") {
                ForEach(appState.twins.filter { $0.type == "organization" }) { twin in
                    TwinRow(twin: twin)
                        .tag(twin)
                }
            }

            Section("Teams") {
                ForEach(appState.twins.filter { $0.type == "team" }) { twin in
                    TwinRow(twin: twin)
                        .tag(twin)
                }
            }
        }
        .listStyle(.sidebar)
        .frame(minWidth: 200)
        .toolbar {
            ToolbarItem {
                Button(action: {}) {
                    Image(systemName: "plus")
                }
                .help("Add Twin")
            }
        }
    }
}

struct TwinRow: View {
    let twin: Twin

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: twin.icon)
                .font(.title2)
                .foregroundStyle(.secondary)
                .frame(width: 30)

            VStack(alignment: .leading, spacing: 2) {
                Text(twin.name)
                    .font(.headline)
                Text(twin.slug)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

struct ChatView: View {
    let twin: Twin
    @State private var messages: [ChatMessage] = []
    @State private var inputText = ""
    @State private var isLoading = false
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Image(systemName: twin.icon)
                    .font(.title)
                    .foregroundStyle(.blue)

                VStack(alignment: .leading) {
                    Text("Ask \(twin.name)")
                        .font(.headline)
                    Text(twin.type.capitalized)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()
            }
            .padding()
            .background(.bar)

            Divider()

            // Messages
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        ForEach(messages) { message in
                            MessageBubble(message: message)
                                .id(message.id)
                        }

                        if isLoading {
                            HStack {
                                ProgressView()
                                    .scaleEffect(0.8)
                                Text("Thinking...")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .padding()
                        }
                    }
                    .padding()
                }
                .onChange(of: messages.count) { _, _ in
                    if let lastMessage = messages.last {
                        withAnimation {
                            proxy.scrollTo(lastMessage.id, anchor: .bottom)
                        }
                    }
                }
            }

            Divider()

            // Input
            HStack(spacing: 12) {
                TextField("Ask \(twin.name) something...", text: $inputText, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1...5)
                    .onSubmit {
                        if !inputText.isEmpty && !isLoading {
                            Task { await sendMessage() }
                        }
                    }

                Button(action: { Task { await sendMessage() } }) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title)
                }
                .buttonStyle(.plain)
                .foregroundStyle(inputText.isEmpty ? .secondary : .blue)
                .disabled(inputText.isEmpty || isLoading)
            }
            .padding()
            .background(.bar)
        }
    }

    private func sendMessage() async {
        let question = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty else { return }

        inputText = ""

        let userMessage = ChatMessage(
            role: .user,
            content: question
        )
        messages.append(userMessage)

        isLoading = true

        do {
            guard let tenantId = appState.currentTenantId else {
                throw APIError.unauthorized
            }

            let response = try await APIClient.shared.ask(
                question: question,
                target: twin.slug,
                tenantId: tenantId
            )

            let assistantMessage = ChatMessage(
                role: .assistant,
                content: response.answer,
                confidence: response.confidence,
                sources: response.sources,
                escalated: response.escalated
            )
            messages.append(assistantMessage)
        } catch {
            let errorMessage = ChatMessage(
                role: .assistant,
                content: "Sorry, I encountered an error: \(error.localizedDescription)",
                isError: true
            )
            messages.append(errorMessage)
        }

        isLoading = false
    }
}

struct MessageBubble: View {
    let message: ChatMessage

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            if message.role == .assistant {
                Image(systemName: "person.crop.circle.fill")
                    .font(.title2)
                    .foregroundStyle(.blue)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text(message.content)
                    .textSelection(.enabled)

                if let confidence = message.confidence {
                    HStack(spacing: 4) {
                        Image(systemName: "target")
                        Text("\(Int(confidence * 100))% confidence")
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }

                if let sources = message.sources, !sources.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "doc.text")
                        Text("Sources: \(sources.map(\.title).joined(separator: ", "))")
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }

                if message.escalated {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.up.message")
                        Text("Escalated for human review")
                    }
                    .font(.caption)
                    .foregroundStyle(.orange)
                }
            }
            .padding(12)
            .background(message.role == .user ? Color.blue.opacity(0.1) : Color.secondary.opacity(0.1))
            .cornerRadius(12)

            if message.role == .user {
                Image(systemName: "person.crop.circle")
                    .font(.title2)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: message.role == .user ? .trailing : .leading)
    }
}

// MARK: - Models

struct ChatMessage: Identifiable, Equatable {
    let id = UUID()
    let role: MessageRole
    let content: String
    let confidence: Double?
    let sources: [Source]?
    let escalated: Bool
    let isError: Bool
    let timestamp = Date()

    init(
        role: MessageRole,
        content: String,
        confidence: Double? = nil,
        sources: [Source]? = nil,
        escalated: Bool = false,
        isError: Bool = false
    ) {
        self.role = role
        self.content = content
        self.confidence = confidence
        self.sources = sources
        self.escalated = escalated
        self.isError = isError
    }

    static func == (lhs: ChatMessage, rhs: ChatMessage) -> Bool {
        lhs.id == rhs.id
    }
}

enum MessageRole {
    case user
    case assistant
}

#Preview {
    ContentView()
        .environmentObject(AppState.shared)
}
