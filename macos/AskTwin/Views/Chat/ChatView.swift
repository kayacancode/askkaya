import SwiftUI

struct ContentView: View {
    @EnvironmentObject var appState: AppState
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false

    var body: some View {
        Group {
            if appState.isLoggedIn {
                if hasCompletedOnboarding || !appState.twins.isEmpty {
                    MainView()
                } else {
                    OnboardingWizardView {
                        hasCompletedOnboarding = true
                        Task {
                            await appState.checkAuthState()
                        }
                    }
                }
            } else {
                LoginView()
            }
        }
        .frame(minWidth: 700, minHeight: 550)
    }
}

// MARK: - Main View (Granola-style)

struct MainView: View {
    @EnvironmentObject var appState: AppState
    @State private var showSidebar = true

    var body: some View {
        HStack(spacing: 0) {
            // Minimal sidebar
            if showSidebar {
                TwinSidebar()
                    .frame(width: 220)
                    .background(Color(NSColor.windowBackgroundColor))
            }

            // Main content
            if let twin = appState.selectedTwin {
                ChatView(twin: twin)
            } else {
                EmptyStateView()
            }
        }
        .toolbar {
            ToolbarItem(placement: .navigation) {
                Button(action: { withAnimation { showSidebar.toggle() } }) {
                    Image(systemName: "sidebar.left")
                }
            }
        }
    }
}

struct EmptyStateView: View {
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 56, weight: .light))
                .foregroundColor(.secondary.opacity(0.5))

            Text("Select a twin to start")
                .font(.title3)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(NSColor.textBackgroundColor))
    }
}

// MARK: - Sidebar (Minimal)

struct TwinSidebar: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Text("Twins")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.secondary)
                Spacer()
                Button(action: {}) {
                    Image(systemName: "plus")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            Divider()
                .opacity(0.5)

            // Twin list
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 2) {
                    ForEach(appState.twins) { twin in
                        TwinRow(twin: twin, isSelected: appState.selectedTwin?.id == twin.id)
                            .onTapGesture {
                                withAnimation(.easeOut(duration: 0.15)) {
                                    appState.selectedTwin = twin
                                }
                            }
                    }
                }
                .padding(.vertical, 8)
            }

            Spacer()

            // User section
            Divider()
                .opacity(0.5)

            HStack(spacing: 10) {
                Circle()
                    .fill(Color.blue.opacity(0.2))
                    .frame(width: 28, height: 28)
                    .overlay(
                        Text(String(appState.currentUser?.email.prefix(1).uppercased() ?? "?"))
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.blue)
                    )

                Text(appState.currentUser?.email ?? "")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .lineLimit(1)

                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
    }
}

struct TwinRow: View {
    let twin: Twin
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: twin.icon)
                .font(.system(size: 14))
                .foregroundColor(isSelected ? .blue : .secondary)
                .frame(width: 20)

            Text(twin.name)
                .font(.system(size: 13))
                .foregroundColor(isSelected ? .primary : .primary.opacity(0.8))

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(isSelected ? Color.blue.opacity(0.1) : Color.clear)
        .cornerRadius(6)
        .padding(.horizontal, 8)
    }
}

// MARK: - Chat View (Granola-style)

struct ChatView: View {
    let twin: Twin
    @State private var messages: [ChatMessage] = []
    @State private var inputText = ""
    @State private var isLoading = false
    @EnvironmentObject var appState: AppState
    @FocusState private var isInputFocused: Bool

    var body: some View {
        ZStack {
            // Background
            Color(NSColor.textBackgroundColor)
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // Granola-style header
                VStack(alignment: .leading, spacing: 6) {
                    Text("Ask \(twin.name)")
                        .font(.system(size: 28, weight: .bold))

                    HStack(spacing: 12) {
                        Text(twin.type.capitalized)
                            .font(.system(size: 13))
                            .foregroundColor(.secondary)

                        if !twin.expertiseAreas.isEmpty {
                            HStack(spacing: 4) {
                                Circle()
                                    .fill(Color.secondary.opacity(0.3))
                                    .frame(width: 3, height: 3)
                                Text(twin.expertiseAreas.prefix(2).joined(separator: ", "))
                                    .font(.system(size: 13))
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 40)
                .padding(.top, 30)
                .padding(.bottom, 20)

                // Messages area
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 24) {
                            ForEach(messages) { message in
                                MessageView(message: message)
                                    .id(message.id)
                            }

                            if isLoading {
                                LoadingIndicator()
                            }
                        }
                        .padding(.horizontal, 40)
                        .padding(.vertical, 20)
                    }
                    .onChange(of: messages.count) { _ in
                        if let lastMessage = messages.last {
                            withAnimation {
                                proxy.scrollTo(lastMessage.id, anchor: .bottom)
                            }
                        }
                    }
                }

                Spacer(minLength: 80)
            }

            // Floating input bar (Granola-style)
            VStack {
                Spacer()
                FloatingInputBar(
                    text: $inputText,
                    isLoading: isLoading,
                    isFocused: _isInputFocused,
                    placeholder: "Ask something...",
                    onSubmit: { Task { await sendMessage() } }
                )
                .padding(.horizontal, 40)
                .padding(.bottom, 20)
            }
        }
    }

    private func sendMessage() async {
        let question = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty else { return }

        inputText = ""

        let userMessage = ChatMessage(role: .user, content: question)
        messages.append(userMessage)

        isLoading = true

        do {
            let response = try await CLIService.shared.ask(
                question: question,
                target: twin.slug
            )

            let assistantMessage = ChatMessage(
                role: .assistant,
                content: response.answer,
                confidence: response.confidence,
                escalated: response.escalated
            )
            messages.append(assistantMessage)
        } catch {
            let errorMessage = ChatMessage(
                role: .assistant,
                content: "Sorry, I couldn't process that request.",
                isError: true
            )
            messages.append(errorMessage)
        }

        isLoading = false
    }
}

// MARK: - Message View (Clean)

struct MessageView: View {
    let message: ChatMessage

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Role label
            HStack(spacing: 6) {
                Circle()
                    .fill(message.role == .user ? Color.blue : Color.green)
                    .frame(width: 6, height: 6)

                Text(message.role == .user ? "You" : "Twin")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.secondary)

                Text(message.timestamp.formatted(date: .omitted, time: .shortened))
                    .font(.system(size: 11))
                    .foregroundColor(.secondary.opacity(0.7))
            }

            // Content
            Text(message.content)
                .font(.system(size: 15))
                .textSelection(.enabled)
                .lineSpacing(4)

            // Metadata (if any)
            if let confidence = message.confidence, confidence < 0.7 {
                HStack(spacing: 4) {
                    Image(systemName: "exclamationmark.circle")
                        .font(.system(size: 11))
                    Text("Low confidence")
                        .font(.system(size: 11))
                }
                .foregroundColor(.orange)
                .padding(.top, 4)
            }

            if message.escalated {
                HStack(spacing: 4) {
                    Image(systemName: "arrow.up.message")
                        .font(.system(size: 11))
                    Text("Sent for review")
                        .font(.system(size: 11))
                }
                .foregroundColor(.orange)
                .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Floating Input Bar (Granola-style)

struct FloatingInputBar: View {
    @Binding var text: String
    let isLoading: Bool
    @FocusState var isFocused: Bool
    let placeholder: String
    let onSubmit: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            TextField(placeholder, text: $text, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.system(size: 14))
                .lineLimit(1...4)
                .focused($isFocused)
                .onSubmit {
                    if !text.isEmpty && !isLoading {
                        onSubmit()
                    }
                }

            // Action buttons (Granola-style)
            HStack(spacing: 8) {
                if isLoading {
                    ProgressView()
                        .scaleEffect(0.7)
                        .frame(width: 24, height: 24)
                } else {
                    Button(action: onSubmit) {
                        Image(systemName: "arrow.up")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(text.isEmpty ? .secondary : .white)
                            .frame(width: 24, height: 24)
                            .background(text.isEmpty ? Color.secondary.opacity(0.2) : Color.blue)
                            .cornerRadius(6)
                    }
                    .buttonStyle(.plain)
                    .disabled(text.isEmpty)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(NSColor.controlBackgroundColor))
                .shadow(color: .black.opacity(0.08), radius: 8, x: 0, y: 2)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.secondary.opacity(0.15), lineWidth: 1)
        )
    }
}

// MARK: - Loading Indicator

struct LoadingIndicator: View {
    var body: some View {
        HStack(spacing: 8) {
            ForEach(0..<3) { index in
                Circle()
                    .fill(Color.green)
                    .frame(width: 6, height: 6)
                    .opacity(0.6)
            }
        }
        .padding(.vertical, 12)
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
