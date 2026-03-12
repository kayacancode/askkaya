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

// MARK: - Granola Light Theme Colors

enum GranolaTheme {
    static let cream = Color(red: 0.99, green: 0.98, blue: 0.94)      // Main background
    static let creamDark = Color(red: 0.96, green: 0.95, blue: 0.91)  // Sidebar/secondary
    static let creamBorder = Color(red: 0.90, green: 0.89, blue: 0.85) // Borders
    static let textPrimary = Color(red: 0.12, green: 0.12, blue: 0.12) // Near black
    static let textSecondary = Color(red: 0.45, green: 0.45, blue: 0.43) // Gray
    static let accent = Color(red: 0.20, green: 0.20, blue: 0.18)     // Dark accent
}

enum MainViewTab {
    case chat
    case knowledge
    case intelligence
}

struct MainView: View {
    @EnvironmentObject var appState: AppState
    @State private var showSidebar = true
    @State private var selectedTab: MainViewTab = .chat

    var body: some View {
        HStack(spacing: 0) {
            // Light sidebar
            if showSidebar {
                TwinSidebar(selectedTab: $selectedTab)
                    .frame(width: 220)
                    .background(GranolaTheme.creamDark)
            }

            // Main content
            switch selectedTab {
            case .chat:
                if let twin = appState.selectedTwin {
                    ChatView(twin: twin)
                } else {
                    EmptyStateView()
                }
            case .knowledge:
                KnowledgeBaseView()
            case .intelligence:
                IntelligenceView()
            }
        }
        .background(GranolaTheme.cream)
        .toolbar {
            ToolbarItem(placement: .navigation) {
                Button(action: { withAnimation(.easeOut(duration: 0.2)) { showSidebar.toggle() } }) {
                    Image(systemName: "sidebar.left")
                        .foregroundColor(GranolaTheme.textSecondary)
                }
            }
        }
    }
}

struct EmptyStateView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 48, weight: .light))
                .foregroundColor(GranolaTheme.textSecondary.opacity(0.4))

            Text("Select a twin to start")
                .font(.system(size: 15))
                .foregroundColor(GranolaTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(GranolaTheme.cream)
    }
}

// MARK: - Sidebar (Granola Light)

struct TwinSidebar: View {
    @EnvironmentObject var appState: AppState
    @Binding var selectedTab: MainViewTab

    private let textPrimary = GranolaTheme.textPrimary
    private let textSecondary = GranolaTheme.textSecondary
    private let borderColor = GranolaTheme.creamBorder

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Text("Twins")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(textSecondary)
                    .textCase(.uppercase)
                    .tracking(0.5)
                Spacer()
                Button(action: {}) {
                    Image(systemName: "plus")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(textSecondary)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)

            Rectangle()
                .fill(borderColor)
                .frame(height: 1)

            // Twin list
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 2) {
                    ForEach(appState.twins) { twin in
                        GranolaTwinRow(twin: twin, isSelected: selectedTab == .chat && appState.selectedTwin?.id == twin.id)
                            .onTapGesture {
                                withAnimation(.easeOut(duration: 0.15)) {
                                    selectedTab = .chat
                                    appState.selectedTwin = twin
                                }
                            }
                    }
                }
                .padding(.vertical, 8)
            }

            Spacer()

            // Bottom navigation
            Rectangle()
                .fill(borderColor)
                .frame(height: 1)

            VStack(spacing: 4) {
                // Intelligence button
                Button(action: { withAnimation(.easeOut(duration: 0.15)) { selectedTab = .intelligence } }) {
                    HStack(spacing: 10) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 14))
                            .foregroundColor(selectedTab == .intelligence ? .orange : textSecondary)
                            .frame(width: 18)

                        Text("Intelligence")
                            .font(.system(size: 13))
                            .foregroundColor(selectedTab == .intelligence ? textPrimary : textPrimary.opacity(0.7))

                        Spacer()
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(selectedTab == .intelligence ? GranolaTheme.cream : Color.clear)
                    .cornerRadius(6)
                    .padding(.horizontal, 8)
                }
                .buttonStyle(.plain)

                // Knowledge Base button
                Button(action: { withAnimation(.easeOut(duration: 0.15)) { selectedTab = .knowledge } }) {
                    HStack(spacing: 10) {
                        Image(systemName: "brain.head.profile")
                            .font(.system(size: 14))
                            .foregroundColor(selectedTab == .knowledge ? textPrimary : textSecondary)
                            .frame(width: 18)

                        Text("Knowledge Base")
                            .font(.system(size: 13))
                            .foregroundColor(selectedTab == .knowledge ? textPrimary : textPrimary.opacity(0.7))

                        Spacer()
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(selectedTab == .knowledge ? GranolaTheme.cream : Color.clear)
                    .cornerRadius(6)
                    .padding(.horizontal, 8)
                }
                .buttonStyle(.plain)
            }
            .padding(.vertical, 8)

            // User section
            Rectangle()
                .fill(borderColor)
                .frame(height: 1)

            HStack(spacing: 10) {
                Circle()
                    .fill(GranolaTheme.creamBorder)
                    .frame(width: 28, height: 28)
                    .overlay(
                        Text(String(appState.currentUser?.email.prefix(1).uppercased() ?? "?"))
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(textPrimary)
                    )

                Text(appState.currentUser?.email ?? "")
                    .font(.system(size: 12))
                    .foregroundColor(textSecondary)
                    .lineLimit(1)

                Spacer()

                // Logout
                Button(action: { Task { await appState.logout() } }) {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .font(.system(size: 12))
                        .foregroundColor(textSecondary)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
    }
}

struct GranolaTwinRow: View {
    let twin: Twin
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: twin.icon)
                .font(.system(size: 13))
                .foregroundColor(isSelected ? GranolaTheme.textPrimary : GranolaTheme.textSecondary)
                .frame(width: 18)

            Text(twin.name)
                .font(.system(size: 13))
                .foregroundColor(isSelected ? GranolaTheme.textPrimary : GranolaTheme.textPrimary.opacity(0.7))

            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(isSelected ? GranolaTheme.cream : Color.clear)
        .cornerRadius(6)
        .padding(.horizontal, 8)
    }
}

// Legacy wrapper
struct TwinRow: View {
    let twin: Twin
    let isSelected: Bool

    var body: some View {
        GranolaTwinRow(twin: twin, isSelected: isSelected)
    }
}

// MARK: - Chat View (Granola Light)

struct ChatView: View {
    let twin: Twin
    @State private var messages: [ChatMessage] = []
    @State private var inputText = ""
    @State private var isLoading = false
    @EnvironmentObject var appState: AppState
    @FocusState private var isInputFocused: Bool

    var body: some View {
        ZStack {
            // Light cream background
            GranolaTheme.cream.ignoresSafeArea()

            VStack(spacing: 0) {
                // Header with twin selector
                HStack {
                    // Twin dropdown style
                    HStack(spacing: 6) {
                        Text("Ask \(twin.name)")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(GranolaTheme.textPrimary)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(GranolaTheme.textSecondary)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(GranolaTheme.creamDark)
                    .cornerRadius(8)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(GranolaTheme.creamBorder, lineWidth: 1)
                    )

                    Spacer()

                    // New chat button
                    Button(action: { messages.removeAll() }) {
                        HStack(spacing: 6) {
                            Image(systemName: "square.and.pencil")
                                .font(.system(size: 12))
                            Text("New chat")
                                .font(.system(size: 13))
                        }
                        .foregroundColor(GranolaTheme.textSecondary)
                    }
                    .buttonStyle(.plain)

                    // Settings
                    Button(action: {}) {
                        Image(systemName: "slider.horizontal.3")
                            .font(.system(size: 14))
                            .foregroundColor(GranolaTheme.textSecondary)
                    }
                    .buttonStyle(.plain)
                    .padding(.leading, 12)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .background(GranolaTheme.creamDark)
                .overlay(
                    Rectangle()
                        .frame(height: 1)
                        .foregroundColor(GranolaTheme.creamBorder),
                    alignment: .bottom
                )

                // Messages area
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 20) {
                            ForEach(messages) { message in
                                GranolaMessageView(message: message)
                                    .id(message.id)
                            }

                            if isLoading {
                                GranolaLoadingIndicator()
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 16)
                    }
                    .onChange(of: messages.count) { _ in
                        if let lastMessage = messages.last {
                            withAnimation(.easeOut(duration: 0.2)) {
                                proxy.scrollTo(lastMessage.id, anchor: .bottom)
                            }
                        }
                    }
                }

                // Input bar at bottom
                GranolaInputBar(
                    text: $inputText,
                    isLoading: isLoading,
                    isFocused: _isInputFocused,
                    twinName: twin.name,
                    onSubmit: { Task { await sendMessage() } }
                )
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

// MARK: - Granola Message View

struct GranolaMessageView: View {
    let message: ChatMessage

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if message.role == .user {
                // User message - right aligned bubble
                HStack {
                    Spacer(minLength: 60)
                    Text(message.content)
                        .font(.system(size: 14))
                        .foregroundColor(GranolaTheme.textPrimary)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(GranolaTheme.creamDark)
                        .cornerRadius(16)
                        .overlay(
                            RoundedRectangle(cornerRadius: 16)
                                .stroke(GranolaTheme.creamBorder, lineWidth: 1)
                        )
                }
            } else {
                // Assistant response - full width
                VStack(alignment: .leading, spacing: 8) {
                    Text(message.content)
                        .font(.system(size: 14))
                        .foregroundColor(GranolaTheme.textPrimary)
                        .textSelection(.enabled)
                        .lineSpacing(5)

                    // Metadata indicators
                    if let confidence = message.confidence, confidence < 0.7 {
                        HStack(spacing: 4) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.system(size: 10))
                            Text("Low confidence")
                                .font(.system(size: 11))
                        }
                        .foregroundColor(.orange)
                    }

                    if message.escalated {
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.system(size: 10))
                            Text("Sent for review")
                                .font(.system(size: 11))
                        }
                        .foregroundColor(.orange)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: message.role == .user ? .trailing : .leading)
    }
}

// Legacy wrapper for compatibility
struct MessageView: View {
    let message: ChatMessage

    var body: some View {
        GranolaMessageView(message: message)
    }
}

// MARK: - Granola Input Bar

struct GranolaInputBar: View {
    @Binding var text: String
    let isLoading: Bool
    @FocusState var isFocused: Bool
    let twinName: String
    let onSubmit: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            // Attachment button
            Button(action: {}) {
                Image(systemName: "paperclip")
                    .font(.system(size: 14))
                    .foregroundColor(GranolaTheme.textSecondary)
            }
            .buttonStyle(.plain)

            // Text field
            TextField("Ask \(twinName)'s twin...", text: $text, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.system(size: 14))
                .foregroundColor(GranolaTheme.textPrimary)
                .lineLimit(1...4)
                .focused($isFocused)
                .onSubmit {
                    if !text.isEmpty && !isLoading {
                        onSubmit()
                    }
                }

            // Right side buttons
            HStack(spacing: 10) {
                if isLoading {
                    ProgressView()
                        .scaleEffect(0.6)
                        .frame(width: 20, height: 20)
                } else {
                    // Settings
                    Button(action: {}) {
                        Image(systemName: "slider.horizontal.3")
                            .font(.system(size: 13))
                            .foregroundColor(GranolaTheme.textSecondary)
                    }
                    .buttonStyle(.plain)

                    // Mic
                    Button(action: {}) {
                        Image(systemName: "mic")
                            .font(.system(size: 13))
                            .foregroundColor(GranolaTheme.textSecondary)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(GranolaTheme.creamDark)
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundColor(GranolaTheme.creamBorder),
            alignment: .top
        )
    }
}

// Legacy wrapper
struct FloatingInputBar: View {
    @Binding var text: String
    let isLoading: Bool
    @FocusState var isFocused: Bool
    let placeholder: String
    let onSubmit: () -> Void

    var body: some View {
        GranolaInputBar(
            text: $text,
            isLoading: isLoading,
            isFocused: _isFocused,
            twinName: "Kaya",
            onSubmit: onSubmit
        )
    }
}

// MARK: - Granola Loading Indicator

struct GranolaLoadingIndicator: View {
    @State private var animating = false

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3) { index in
                Circle()
                    .fill(GranolaTheme.textSecondary)
                    .frame(width: 6, height: 6)
                    .scaleEffect(animating ? 1.0 : 0.5)
                    .animation(
                        .easeInOut(duration: 0.5)
                            .repeatForever()
                            .delay(Double(index) * 0.15),
                        value: animating
                    )
            }
        }
        .padding(.vertical, 8)
        .onAppear { animating = true }
    }
}

// Legacy wrapper
struct LoadingIndicator: View {
    var body: some View {
        GranolaLoadingIndicator()
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
