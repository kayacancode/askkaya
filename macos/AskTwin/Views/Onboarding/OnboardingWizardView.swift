import SwiftUI
import UniformTypeIdentifiers

/// 3-step onboarding wizard for new users
struct OnboardingWizardView: View {
    @EnvironmentObject var appState: AppState
    @State private var currentStep = 0
    @State private var droppedFiles: [URL] = []
    @State private var isProcessing = false
    @State private var extractedInsights: [String] = []
    @State private var selectedIntegrations: Set<String> = []

    let onComplete: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            // Progress indicator
            HStack(spacing: 4) {
                ForEach(0..<3) { index in
                    Capsule()
                        .fill(index <= currentStep ? Color.blue : Color.secondary.opacity(0.3))
                        .frame(height: 4)
                }
            }
            .padding(.horizontal, 40)
            .padding(.top, 20)

            // Step content
            TabView(selection: $currentStep) {
                IngestionStepView(
                    droppedFiles: $droppedFiles,
                    isProcessing: $isProcessing,
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

            // Also ingest the files
            if let tenantId = await MainActor.run(body: { appState.currentTenantId }) {
                await ingestFiles(tenantId: tenantId)
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

    private func ingestFiles(tenantId: String) async {
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
                        "client_id": tenantId
                    ]
                    let body: [String: Any] = ["items": [item]]
                    request.httpBody = try JSONSerialization.data(withJSONObject: body)

                    let _ = try await URLSession.shared.data(for: request)
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

// MARK: - Step 1: Ingestion

struct IngestionStepView: View {
    @Binding var droppedFiles: [URL]
    @Binding var isProcessing: Bool
    let onContinue: () -> Void

    @State private var isTargeted = false

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Text("Build Your Knowledge Base")
                .font(.title)
                .fontWeight(.bold)

            Text("Drop files to teach your twin what you know")
                .foregroundStyle(.secondary)

            // Drop zone
            ZStack {
                RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(style: StrokeStyle(lineWidth: 2, dash: [8]))
                    .foregroundColor(isTargeted ? .blue : .secondary.opacity(0.5))
                    .background(
                        RoundedRectangle(cornerRadius: 16)
                            .fill(isTargeted ? Color.blue.opacity(0.1) : Color.clear)
                    )

                VStack(spacing: 16) {
                    Image(systemName: droppedFiles.isEmpty ? "doc.badge.plus" : "checkmark.circle.fill")
                        .font(.system(size: 48))
                        .foregroundColor(droppedFiles.isEmpty ? .secondary : .green)

                    if droppedFiles.isEmpty {
                        Text("Drop PDFs, text files, or meeting notes")
                            .foregroundStyle(.secondary)
                    } else {
                        Text("\(droppedFiles.count) file\(droppedFiles.count == 1 ? "" : "s") ready")
                            .fontWeight(.medium)

                        // File list
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(droppedFiles.prefix(5), id: \.self) { url in
                                HStack {
                                    Image(systemName: "doc.fill")
                                        .foregroundColor(.blue)
                                    Text(url.lastPathComponent)
                                        .lineLimit(1)
                                    Spacer()
                                    Button(action: { droppedFiles.removeAll { $0 == url } }) {
                                        Image(systemName: "xmark.circle.fill")
                                            .foregroundColor(.secondary)
                                    }
                                    .buttonStyle(.plain)
                                }
                                .font(.caption)
                            }
                            if droppedFiles.count > 5 {
                                Text("+ \(droppedFiles.count - 5) more")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.horizontal)
                    }
                }
                .padding(40)
            }
            .frame(height: 250)
            .padding(.horizontal, 40)
            .onDrop(of: [.fileURL], isTargeted: $isTargeted) { providers in
                handleDrop(providers: providers)
                return true
            }

            // Or select files button
            Button("Or Select Files...") {
                selectFiles()
            }
            .buttonStyle(.link)

            Spacer()

            // Continue button
            HStack {
                Spacer()
                Button(action: onContinue) {
                    Text(droppedFiles.isEmpty ? "Skip for Now" : "Continue")
                        .frame(width: 120)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }
            .padding(.horizontal, 40)
            .padding(.bottom, 30)
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

// MARK: - Step 2: Insights

struct InsightsStepView: View {
    let insights: [String]
    let isLoading: Bool
    let onContinue: () -> Void

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            if isLoading {
                VStack(spacing: 16) {
                    ProgressView()
                        .scaleEffect(1.5)
                    Text("Analyzing your knowledge...")
                        .foregroundStyle(.secondary)
                }
            } else {
                Text("Your Knowledge Profile")
                    .font(.title)
                    .fontWeight(.bold)

                Text("Here's what we learned about your expertise")
                    .foregroundStyle(.secondary)

                // Insights list
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(insights, id: \.self) { insight in
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: "sparkle")
                                .foregroundColor(.yellow)
                            Text(insight)
                        }
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.secondary.opacity(0.1))
                        .cornerRadius(8)
                    }
                }
                .padding(.horizontal, 40)

                if insights.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "doc.text.magnifyingglass")
                            .font(.system(size: 48))
                            .foregroundColor(.secondary)
                        Text("Add documents to see insights")
                            .foregroundStyle(.secondary)
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
                        .frame(width: 120)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(isLoading)
            }
            .padding(.horizontal, 40)
            .padding(.bottom, 30)
        }
    }
}

// MARK: - Step 3: Integrations

struct IntegrationsStepView: View {
    @Binding var selectedIntegrations: Set<String>
    let onComplete: () -> Void

    let integrations = [
        Integration(id: "telegram", name: "Telegram", icon: "paperplane.fill", description: "Ask questions via @AskKayaBot"),
        Integration(id: "slack", name: "Slack", icon: "number", description: "Connect your workspace (coming soon)"),
        Integration(id: "email", name: "Email", icon: "envelope.fill", description: "Get answers by email (coming soon)")
    ]

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Text("Connect Your Twin")
                .font(.title)
                .fontWeight(.bold)

            Text("Choose how you want to interact with your knowledge")
                .foregroundStyle(.secondary)

            // Integration options
            VStack(spacing: 12) {
                ForEach(integrations) { integration in
                    IntegrationRow(
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
            .padding(.horizontal, 40)

            // Telegram setup hint
            if selectedIntegrations.contains("telegram") {
                VStack(spacing: 8) {
                    Text("To connect Telegram:")
                        .font(.caption)
                        .fontWeight(.medium)
                    Text("1. Open @AskKayaBot in Telegram\n2. Send /link to connect your account")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding()
                .background(Color.blue.opacity(0.1))
                .cornerRadius(8)
                .padding(.horizontal, 40)
            }

            Spacer()

            // Complete button
            HStack {
                Spacer()
                Button(action: onComplete) {
                    Text("Get Started")
                        .frame(width: 120)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }
            .padding(.horizontal, 40)
            .padding(.bottom, 30)
        }
    }
}

struct Integration: Identifiable {
    let id: String
    let name: String
    let icon: String
    let description: String
}

struct IntegrationRow: View {
    let integration: Integration
    let isSelected: Bool
    let onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            HStack(spacing: 16) {
                Image(systemName: integration.icon)
                    .font(.title2)
                    .foregroundColor(isSelected ? .blue : .secondary)
                    .frame(width: 32)

                VStack(alignment: .leading, spacing: 2) {
                    Text(integration.name)
                        .fontWeight(.medium)
                    Text(integration.description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(isSelected ? .blue : .secondary)
                    .font(.title2)
            }
            .padding()
            .background(isSelected ? Color.blue.opacity(0.1) : Color.secondary.opacity(0.05))
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? Color.blue : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    OnboardingWizardView(onComplete: {})
        .environmentObject(AppState.shared)
}
