import SwiftUI
import UniformTypeIdentifiers

/// Content visibility levels
enum ContentVisibility: String, CaseIterable {
    case `private` = "private"
    case team = "team"
    case organization = "organization"

    var displayName: String {
        switch self {
        case .private: return "Private"
        case .team: return "Team"
        case .organization: return "Organization"
        }
    }

    var description: String {
        switch self {
        case .private: return "Only you can query"
        case .team: return "Your team can query"
        case .organization: return "Anyone in org can query"
        }
    }

    var icon: String {
        switch self {
        case .private: return "lock.fill"
        case .team: return "person.2.fill"
        case .organization: return "building.2.fill"
        }
    }
}

/// 3-step onboarding wizard for new users (Granola Light Style)
struct OnboardingWizardView: View {
    @EnvironmentObject var appState: AppState
    @State private var currentStep = 0
    @State private var droppedFiles: [URL] = []
    @State private var isProcessing = false
    @State private var extractedInsights: [String] = []
    @State private var selectedIntegrations: Set<String> = []
    @State private var contentVisibility: ContentVisibility = .private

    let onComplete: () -> Void

    var body: some View {
        ZStack {
            GranolaTheme.cream.ignoresSafeArea()

            VStack(spacing: 0) {
                // Progress indicator
                HStack(spacing: 6) {
                    ForEach(0..<3) { index in
                        Capsule()
                            .fill(index <= currentStep ? GranolaTheme.textPrimary : GranolaTheme.creamBorder)
                            .frame(height: 3)
                    }
                }
                .padding(.horizontal, 60)
                .padding(.top, 24)

                // Step content
                TabView(selection: $currentStep) {
                    IngestionStepView(
                        droppedFiles: $droppedFiles,
                        isProcessing: $isProcessing,
                        visibility: $contentVisibility,
                        onContinue: { processFiles() }
                    )
                    .tag(0)

                    InsightsStepView(
                        insights: extractedInsights,
                        isLoading: isProcessing,
                        onContinue: { currentStep = 2 }
                    )
                    .tag(1)

                    IntegrationsStepView(
                        selectedIntegrations: $selectedIntegrations,
                        onComplete: completeOnboarding
                    )
                    .tag(2)
                }
                .tabViewStyle(.automatic)
            }
        }
        .frame(minWidth: 600, minHeight: 500)
    }

    private func processFiles() {
        guard !droppedFiles.isEmpty else {
            currentStep = 1
            return
        }

        isProcessing = true
        currentStep = 1

        Task {
            // Extract text from files
            var allText = ""
            for url in droppedFiles {
                if let doc = await DocumentLoader.loadDocument(from: url) {
                    allText += doc.content + "\n\n"
                }
            }

            // Generate insights from the content
            let insights = await generateInsights(from: allText)

            await MainActor.run {
                extractedInsights = insights
                isProcessing = false
            }

            // Also ingest the files with selected visibility
            if let tenantId = await MainActor.run(body: { appState.currentTenantId }) {
                let visibility = await MainActor.run { contentVisibility }
                await ingestFiles(tenantId: tenantId, visibility: visibility)
            }
        }
    }

    private func generateInsights(from text: String) async -> [String] {
        // Extract key topics and patterns from the text
        var insights: [String] = []

        // Word frequency analysis for topics
        let words = text.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { $0.count > 4 }

        var wordCounts: [String: Int] = [:]
        for word in words {
            wordCounts[word, default: 0] += 1
        }

        let topWords = wordCounts
            .sorted { $0.value > $1.value }
            .prefix(5)
            .map { $0.key.capitalized }

        if !topWords.isEmpty {
            insights.append("Key topics: \(topWords.joined(separator: ", "))")
        }

        // Count documents
        insights.append("\(droppedFiles.count) document\(droppedFiles.count == 1 ? "" : "s") added to your knowledge base")

        // Estimate word count
        let wordCount = text.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.count
        if wordCount > 0 {
            insights.append("~\(wordCount.formatted()) words of knowledge indexed")
        }

        // Check for common patterns
        if text.contains("meeting") || text.contains("agenda") {
            insights.append("Meeting notes detected - great for recalling discussions")
        }
        if text.contains("@") && text.contains(".com") {
            insights.append("Contact information found - your twin can help with people lookup")
        }
        if text.lowercased().contains("project") || text.lowercased().contains("deadline") {
            insights.append("Project-related content detected - ask about timelines and tasks")
        }

        return insights
    }

    private func ingestFiles(tenantId: String, visibility: ContentVisibility) async {
        do {
            let token = try await AuthService.shared.getValidToken()

            for url in droppedFiles {
                if let doc = await DocumentLoader.loadDocument(from: url) {
                    var request = URLRequest(url: URL(string: "https://us-central1-askkaya-47cef.cloudfunctions.net/ingestApi")!)
                    request.httpMethod = "POST"
                    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                    request.setValue(tenantId, forHTTPHeaderField: "X-Tenant-ID")
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

                    let item: [String: Any] = [
                        "content": doc.content,
                        "title": doc.title,
                        "source": "file",
                        "client_id": tenantId,
                        "visibility": visibility.rawValue  // private, team, or organization
                    ]
                    let body: [String: Any] = ["items": [item]]
                    request.httpBody = try JSONSerialization.data(withJSONObject: body)

                    let _ = try await URLSession.shared.data(for: request)
                    NSLog("[Onboarding] Ingested \(doc.title) with visibility: \(visibility.rawValue)")
                }
            }
        } catch {
            NSLog("[Onboarding] Ingestion failed: \(error)")
        }
    }

    private func completeOnboarding() {
        // Save selected integrations preference
        UserDefaults.standard.set(Array(selectedIntegrations), forKey: "selectedIntegrations")
        onComplete()
    }
}

// MARK: - Step 1: Ingestion (Granola Light)

struct IngestionStepView: View {
    @Binding var droppedFiles: [URL]
    @Binding var isProcessing: Bool
    @Binding var visibility: ContentVisibility
    let onContinue: () -> Void

    @State private var isTargeted = false

    var body: some View {
        ZStack {
            GranolaTheme.cream.ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                Text("Build Your Knowledge Base")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(GranolaTheme.textPrimary)

                Text("Drop files to teach your twin what you know")
                    .font(.system(size: 14))
                    .foregroundColor(GranolaTheme.textSecondary)

                // Visibility selector
                VStack(alignment: .leading, spacing: 8) {
                    Text("Who can query this content?")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(GranolaTheme.textSecondary)

                    HStack(spacing: 8) {
                        ForEach(ContentVisibility.allCases, id: \.self) { option in
                            VisibilityOptionButton(
                                option: option,
                                isSelected: visibility == option,
                                onSelect: { visibility = option }
                            )
                        }
                    }
                }
                .padding(.horizontal, 50)

                // Drop zone
                ZStack {
                    RoundedRectangle(cornerRadius: 12)
                        .strokeBorder(style: StrokeStyle(lineWidth: 1.5, dash: [8]))
                        .foregroundColor(isTargeted ? GranolaTheme.textPrimary : GranolaTheme.creamBorder)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(isTargeted ? GranolaTheme.creamDark : Color.clear)
                        )

                    VStack(spacing: 16) {
                        Image(systemName: droppedFiles.isEmpty ? "doc.badge.plus" : "checkmark.circle.fill")
                            .font(.system(size: 40))
                            .foregroundColor(droppedFiles.isEmpty ? GranolaTheme.textSecondary : .green)

                        if droppedFiles.isEmpty {
                            Text("Drop PDFs, text files, or meeting notes")
                                .font(.system(size: 14))
                                .foregroundColor(GranolaTheme.textSecondary)
                        } else {
                            Text("\(droppedFiles.count) file\(droppedFiles.count == 1 ? "" : "s") ready")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(GranolaTheme.textPrimary)

                            // File list
                            VStack(alignment: .leading, spacing: 6) {
                                ForEach(droppedFiles.prefix(5), id: \.self) { url in
                                    HStack {
                                        Image(systemName: "doc.fill")
                                            .foregroundColor(GranolaTheme.textSecondary)
                                        Text(url.lastPathComponent)
                                            .foregroundColor(GranolaTheme.textPrimary.opacity(0.9))
                                            .lineLimit(1)
                                        Spacer()
                                        Button(action: { droppedFiles.removeAll { $0 == url } }) {
                                            Image(systemName: "xmark.circle.fill")
                                                .foregroundColor(GranolaTheme.textSecondary)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                    .font(.system(size: 12))
                                }
                                if droppedFiles.count > 5 {
                                    Text("+ \(droppedFiles.count - 5) more")
                                        .font(.system(size: 12))
                                        .foregroundColor(GranolaTheme.textSecondary)
                                }
                            }
                            .padding(.horizontal)
                        }
                    }
                    .padding(40)
                }
                .frame(height: 240)
                .padding(.horizontal, 50)
                .onDrop(of: [.fileURL], isTargeted: $isTargeted) { providers in
                    handleDrop(providers: providers)
                    return true
                }

                // Or select files button
                Button("Or Select Files...") {
                    selectFiles()
                }
                .font(.system(size: 13))
                .foregroundColor(GranolaTheme.textSecondary)
                .buttonStyle(.plain)

                Spacer()

                // Continue button
                HStack {
                    Spacer()
                    Button(action: onContinue) {
                        Text(droppedFiles.isEmpty ? "Skip for Now" : "Continue")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(GranolaTheme.cream)
                            .frame(width: 130)
                            .padding(.vertical, 10)
                            .background(GranolaTheme.textPrimary)
                            .cornerRadius(8)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 50)
                .padding(.bottom, 30)
            }
        }
    }

    private func handleDrop(providers: [NSItemProvider]) {
        for provider in providers {
            provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
                if let data = item as? Data,
                   let url = URL(dataRepresentation: data, relativeTo: nil) {
                    DispatchQueue.main.async {
                        if !droppedFiles.contains(url) {
                            droppedFiles.append(url)
                        }
                    }
                }
            }
        }
    }

    private func selectFiles() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowedContentTypes = [.pdf, .plainText, .json, .text]

        if panel.runModal() == .OK {
            for url in panel.urls where !droppedFiles.contains(url) {
                droppedFiles.append(url)
            }
        }
    }
}

// MARK: - Step 2: Insights (Granola Light)

struct InsightsStepView: View {
    let insights: [String]
    let isLoading: Bool
    let onContinue: () -> Void

    var body: some View {
        ZStack {
            GranolaTheme.cream.ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                if isLoading {
                    VStack(spacing: 16) {
                        ProgressView()
                            .scaleEffect(1.2)
                        Text("Analyzing your knowledge...")
                            .font(.system(size: 14))
                            .foregroundColor(GranolaTheme.textSecondary)
                    }
                } else {
                    Text("Your Knowledge Profile")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundColor(GranolaTheme.textPrimary)

                    Text("Here's what we learned about your expertise")
                        .font(.system(size: 14))
                        .foregroundColor(GranolaTheme.textSecondary)

                    // Insights list
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(insights, id: \.self) { insight in
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: "sparkle")
                                    .foregroundColor(.orange)
                                    .font(.system(size: 14))
                                Text(insight)
                                    .font(.system(size: 14))
                                    .foregroundColor(GranolaTheme.textPrimary.opacity(0.9))
                            }
                            .padding(14)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(GranolaTheme.creamDark)
                            .cornerRadius(8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(GranolaTheme.creamBorder, lineWidth: 1)
                            )
                        }
                    }
                    .padding(.horizontal, 50)

                    if insights.isEmpty {
                        VStack(spacing: 12) {
                            Image(systemName: "doc.text.magnifyingglass")
                                .font(.system(size: 40))
                                .foregroundColor(GranolaTheme.textSecondary)
                            Text("Add documents to see insights")
                                .font(.system(size: 14))
                                .foregroundColor(GranolaTheme.textSecondary)
                        }
                        .padding(.vertical, 40)
                    }
                }

                Spacer()

                // Continue button
                HStack {
                    Spacer()
                    Button(action: onContinue) {
                        Text("Continue")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(GranolaTheme.cream)
                            .frame(width: 130)
                            .padding(.vertical, 10)
                            .background(GranolaTheme.textPrimary)
                            .cornerRadius(8)
                    }
                    .buttonStyle(.plain)
                    .disabled(isLoading)
                    .opacity(isLoading ? 0.5 : 1)
                }
                .padding(.horizontal, 50)
                .padding(.bottom, 30)
            }
        }
    }
}

// MARK: - Step 3: Integrations (Granola Light)

struct IntegrationsStepView: View {
    @Binding var selectedIntegrations: Set<String>
    let onComplete: () -> Void

    let integrations = [
        Integration(id: "telegram", name: "Telegram", icon: "paperplane.fill", description: "Ask questions via @AskKayaBot"),
        Integration(id: "slack", name: "Slack", icon: "number", description: "Connect your workspace (coming soon)"),
        Integration(id: "email", name: "Email", icon: "envelope.fill", description: "Get answers by email (coming soon)")
    ]

    var body: some View {
        ZStack {
            GranolaTheme.cream.ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                Text("Connect Your Twin")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(GranolaTheme.textPrimary)

                Text("Choose how you want to interact with your knowledge")
                    .font(.system(size: 14))
                    .foregroundColor(GranolaTheme.textSecondary)

                // Integration options
                VStack(spacing: 10) {
                    ForEach(integrations) { integration in
                        GranolaIntegrationRow(
                            integration: integration,
                            isSelected: selectedIntegrations.contains(integration.id),
                            onToggle: {
                                if selectedIntegrations.contains(integration.id) {
                                    selectedIntegrations.remove(integration.id)
                                } else {
                                    selectedIntegrations.insert(integration.id)
                                }
                            }
                        )
                    }
                }
                .padding(.horizontal, 50)

                // Telegram setup hint
                if selectedIntegrations.contains("telegram") {
                    VStack(spacing: 8) {
                        Text("To connect Telegram:")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(GranolaTheme.textPrimary)
                        Text("1. Open @AskKayaBot in Telegram\n2. Send /link to connect your account")
                            .font(.system(size: 12))
                            .foregroundColor(GranolaTheme.textSecondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(14)
                    .background(GranolaTheme.creamDark)
                    .cornerRadius(8)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(GranolaTheme.creamBorder, lineWidth: 1)
                    )
                    .padding(.horizontal, 50)
                }

                Spacer()

                // Complete button
                HStack {
                    Spacer()
                    Button(action: onComplete) {
                        Text("Get Started")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(GranolaTheme.cream)
                            .frame(width: 130)
                            .padding(.vertical, 10)
                            .background(GranolaTheme.textPrimary)
                            .cornerRadius(8)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 50)
                .padding(.bottom, 30)
            }
        }
    }
}

struct Integration: Identifiable {
    let id: String
    let name: String
    let icon: String
    let description: String
}

struct GranolaIntegrationRow: View {
    let integration: Integration
    let isSelected: Bool
    let onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            HStack(spacing: 14) {
                Image(systemName: integration.icon)
                    .font(.system(size: 18))
                    .foregroundColor(isSelected ? GranolaTheme.textPrimary : GranolaTheme.textSecondary)
                    .frame(width: 28)

                VStack(alignment: .leading, spacing: 3) {
                    Text(integration.name)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(GranolaTheme.textPrimary)
                    Text(integration.description)
                        .font(.system(size: 12))
                        .foregroundColor(GranolaTheme.textSecondary)
                }

                Spacer()

                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(isSelected ? GranolaTheme.textPrimary : GranolaTheme.textSecondary)
                    .font(.system(size: 20))
            }
            .padding(14)
            .background(isSelected ? GranolaTheme.cream : GranolaTheme.creamDark)
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(isSelected ? GranolaTheme.textSecondary.opacity(0.3) : GranolaTheme.creamBorder, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Visibility Option Button

struct VisibilityOptionButton: View {
    let option: ContentVisibility
    let isSelected: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            VStack(spacing: 6) {
                Image(systemName: option.icon)
                    .font(.system(size: 16))
                    .foregroundColor(isSelected ? GranolaTheme.textPrimary : GranolaTheme.textSecondary)

                Text(option.displayName)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(isSelected ? GranolaTheme.textPrimary : GranolaTheme.textSecondary)

                Text(option.description)
                    .font(.system(size: 10))
                    .foregroundColor(GranolaTheme.textSecondary.opacity(0.8))
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .padding(.horizontal, 8)
            .background(isSelected ? GranolaTheme.cream : GranolaTheme.creamDark)
            .cornerRadius(8)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(isSelected ? GranolaTheme.textPrimary.opacity(0.3) : GranolaTheme.creamBorder, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

// Legacy wrapper
struct IntegrationRow: View {
    let integration: Integration
    let isSelected: Bool
    let onToggle: () -> Void

    var body: some View {
        GranolaIntegrationRow(integration: integration, isSelected: isSelected, onToggle: onToggle)
    }
}

#Preview {
    OnboardingWizardView(onComplete: {})
        .environmentObject(AppState.shared)
}
