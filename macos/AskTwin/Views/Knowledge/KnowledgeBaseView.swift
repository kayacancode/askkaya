import SwiftUI

struct KnowledgeBaseView: View {
    @EnvironmentObject var appState: AppState
    @State private var sources: [KnowledgeSource] = []
    @State private var values: [ExtractedValue] = []
    @State private var stats: KnowledgeStats?
    @State private var isLoading = true
    @State private var selectedTab = 0

    // Granola colors
    private let bgColor = Color(red: 0.11, green: 0.11, blue: 0.12)
    private let surfaceColor = Color(red: 0.14, green: 0.14, blue: 0.15)
    private let borderColor = Color.white.opacity(0.08)
    private let textPrimary = Color.white
    private let textSecondary = Color.white.opacity(0.5)

    var body: some View {
        ZStack {
            bgColor.ignoresSafeArea()

            VStack(spacing: 0) {
                // Header
                HStack {
                    Text("Knowledge Base")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(textPrimary)

                    Spacer()

                    // Refresh button
                    Button(action: { Task { await loadData() } }) {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 14))
                            .foregroundColor(textSecondary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 24)
                .padding(.top, 24)
                .padding(.bottom, 16)

                // Stats cards
                if let stats = stats {
                    HStack(spacing: 12) {
                        StatCard(title: "Sources", value: "\(stats.sourceCount)", icon: "doc.fill", color: .blue)
                        StatCard(title: "Chunks", value: "\(stats.chunkCount)", icon: "square.stack.3d.up.fill", color: .purple)
                        StatCard(title: "Topics", value: "\(stats.topicCount)", icon: "tag.fill", color: .green)
                    }
                    .padding(.horizontal, 24)
                    .padding(.bottom, 20)
                }

                // Tab picker
                HStack(spacing: 0) {
                    TabButton(title: "Values", isSelected: selectedTab == 0) { selectedTab = 0 }
                    TabButton(title: "Sources", isSelected: selectedTab == 1) { selectedTab = 1 }
                    TabButton(title: "Topics", isSelected: selectedTab == 2) { selectedTab = 2 }
                }
                .padding(.horizontal, 24)

                Rectangle()
                    .fill(borderColor)
                    .frame(height: 1)

                // Content
                if isLoading {
                    Spacer()
                    ProgressView()
                        .scaleEffect(1.2)
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            switch selectedTab {
                            case 0:
                                valuesSection
                            case 1:
                                sourcesSection
                            case 2:
                                topicsSection
                            default:
                                EmptyView()
                            }
                        }
                        .padding(24)
                    }
                }
            }
        }
        .task {
            await loadData()
        }
    }

    // MARK: - Values Section

    private var valuesSection: some View {
        Group {
            if values.isEmpty {
                emptyState(icon: "heart.fill", message: "No values extracted yet", subtitle: "Add more content to discover your core values")
            } else {
                ForEach(values) { value in
                    ValueCard(value: value)
                }
            }
        }
    }

    // MARK: - Sources Section

    private var sourcesSection: some View {
        Group {
            if sources.isEmpty {
                emptyState(icon: "doc.fill", message: "No sources yet", subtitle: "Ingest documents to build your knowledge base")
            } else {
                ForEach(sources) { source in
                    SourceCard(source: source)
                }
            }
        }
    }

    // MARK: - Topics Section

    private var topicsSection: some View {
        Group {
            if let stats = stats, !stats.topics.isEmpty {
                FlowLayout(spacing: 8) {
                    ForEach(stats.topics, id: \.self) { topic in
                        TopicTag(topic: topic)
                    }
                }
            } else {
                emptyState(icon: "tag.fill", message: "No topics detected", subtitle: "Topics are extracted from your knowledge base")
            }
        }
    }

    private func emptyState(icon: String, message: String, subtitle: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 40))
                .foregroundColor(textSecondary.opacity(0.5))
            Text(message)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(textSecondary)
            Text(subtitle)
                .font(.system(size: 13))
                .foregroundColor(textSecondary.opacity(0.7))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }

    // MARK: - Data Loading

    private func loadData() async {
        isLoading = true

        do {
            let token = try await AuthService.shared.getValidToken()
            guard let clientId = await MainActor.run(body: { appState.currentTenantId }) else {
                await MainActor.run { isLoading = false }
                return
            }

            // Fetch kb_articles from Firestore REST API
            let fetchedSources = await fetchKBArticles(token: token, clientId: clientId)

            // Extract topics from twin expertise areas
            let twins = await MainActor.run { appState.twins }
            let allTopics = twins.flatMap { $0.expertiseAreas }
            let uniqueTopics = Array(Set(allTopics))

            // Generate values from the knowledge base content
            let extractedValues = generateValuesFromSources(fetchedSources)

            await MainActor.run {
                sources = fetchedSources
                values = extractedValues
                stats = KnowledgeStats(
                    sourceCount: fetchedSources.count,
                    chunkCount: fetchedSources.count * 5, // Estimate ~5 chunks per source
                    topicCount: uniqueTopics.count,
                    topics: uniqueTopics
                )
                isLoading = false
            }
        } catch {
            NSLog("[KnowledgeBase] Error loading data: \(error)")
            await MainActor.run { isLoading = false }
        }
    }

    private func fetchKBArticles(token: String, clientId: String) async -> [KnowledgeSource] {
        // Query Firestore REST API for kb_articles
        let projectId = "askkaya-47cef"
        let urlString = "https://firestore.googleapis.com/v1/projects/\(projectId)/databases/(default)/documents:runQuery"

        var request = URLRequest(url: URL(string: urlString)!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Query for articles belonging to this client
        let query: [String: Any] = [
            "structuredQuery": [
                "from": [["collectionId": "kb_articles"]],
                "where": [
                    "compositeFilter": [
                        "op": "OR",
                        "filters": [
                            [
                                "fieldFilter": [
                                    "field": ["fieldPath": "client_id"],
                                    "op": "EQUAL",
                                    "value": ["stringValue": clientId]
                                ]
                            ],
                            [
                                "fieldFilter": [
                                    "field": ["fieldPath": "is_global"],
                                    "op": "EQUAL",
                                    "value": ["booleanValue": true]
                                ]
                            ]
                        ]
                    ]
                ],
                "orderBy": [["field": ["fieldPath": "created_at"], "direction": "DESCENDING"]],
                "limit": 100
            ]
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: query)
            let (data, _) = try await URLSession.shared.data(for: request)

            // Parse Firestore response
            guard let results = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
                return []
            }

            var articles: [KnowledgeSource] = []

            for result in results {
                guard let document = result["document"] as? [String: Any],
                      let name = document["name"] as? String,
                      let fields = document["fields"] as? [String: Any] else {
                    continue
                }

                let id = name.components(separatedBy: "/").last ?? UUID().uuidString
                let title = (fields["title"] as? [String: Any])?["stringValue"] as? String ?? "Untitled"
                let source = (fields["source"] as? [String: Any])?["stringValue"] as? String ?? "file"
                let status = "active"

                var createdAt: Date? = nil
                if let timestampValue = (fields["created_at"] as? [String: Any])?["timestampValue"] as? String {
                    let formatter = ISO8601DateFormatter()
                    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                    createdAt = formatter.date(from: timestampValue)
                }

                articles.append(KnowledgeSource(
                    id: id,
                    title: title,
                    sourceType: source,
                    status: status,
                    createdAt: createdAt
                ))
            }

            return articles
        } catch {
            NSLog("[KnowledgeBase] Error fetching articles: \(error)")
            return []
        }
    }

    private func generateValuesFromSources(_ sources: [KnowledgeSource]) -> [ExtractedValue] {
        // Generate placeholder values based on source types
        var values: [ExtractedValue] = []

        let meetingCount = sources.filter { $0.sourceType == "granola" }.count
        let fileCount = sources.filter { $0.sourceType == "file" || $0.sourceType == "pdf" }.count

        if meetingCount > 0 {
            values.append(ExtractedValue(
                id: "meeting-focus",
                name: "Meeting-Driven Knowledge",
                description: "Your knowledge base includes \(meetingCount) meeting notes, indicating strong emphasis on collaborative discussions and real-time decision making.",
                confidence: 0.85,
                evidence: ["Granola meeting imports", "Discussion transcripts", "Decision records"]
            ))
        }

        if fileCount > 0 {
            values.append(ExtractedValue(
                id: "documentation",
                name: "Documentation Focus",
                description: "You maintain \(fileCount) documents in your knowledge base, showing commitment to written knowledge preservation.",
                confidence: 0.80,
                evidence: ["PDF documents", "Text files", "Reference materials"]
            ))
        }

        if sources.count > 10 {
            values.append(ExtractedValue(
                id: "knowledge-builder",
                name: "Active Knowledge Builder",
                description: "With \(sources.count) sources, you're actively building a comprehensive knowledge base.",
                confidence: 0.90,
                evidence: ["Regular content additions", "Diverse source types", "Growing knowledge graph"]
            ))
        }

        return values
    }
}

// MARK: - Supporting Views

struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color

    private let surfaceColor = Color(red: 0.14, green: 0.14, blue: 0.15)
    private let textPrimary = Color.white
    private let textSecondary = Color.white.opacity(0.5)

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .foregroundColor(color.opacity(0.8))
                Spacer()
            }
            Text(value)
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(textPrimary)
            Text(title)
                .font(.system(size: 12))
                .foregroundColor(textSecondary)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(surfaceColor)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.white.opacity(0.05), lineWidth: 1)
        )
    }
}

struct TabButton: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    private let textPrimary = Color.white
    private let textSecondary = Color.white.opacity(0.5)

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 13, weight: isSelected ? .semibold : .regular))
                .foregroundColor(isSelected ? textPrimary : textSecondary)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(isSelected ? Color.white.opacity(0.08) : Color.clear)
                .cornerRadius(6)
        }
        .buttonStyle(.plain)
    }
}

struct ValueCard: View {
    let value: ExtractedValue

    private let surfaceColor = Color(red: 0.14, green: 0.14, blue: 0.15)
    private let textPrimary = Color.white
    private let textSecondary = Color.white.opacity(0.5)

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: value.icon)
                    .font(.system(size: 16))
                    .foregroundColor(.purple.opacity(0.8))
                Text(value.name)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(textPrimary)
                Spacer()
                if let confidence = value.confidence {
                    Text("\(Int(confidence * 100))%")
                        .font(.system(size: 11))
                        .foregroundColor(textSecondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.white.opacity(0.05))
                        .cornerRadius(4)
                }
            }

            Text(value.description)
                .font(.system(size: 13))
                .foregroundColor(textSecondary)
                .lineSpacing(4)

            if !value.evidence.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Evidence")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(textSecondary.opacity(0.7))
                        .textCase(.uppercase)
                        .tracking(0.5)

                    ForEach(value.evidence.prefix(3), id: \.self) { evidence in
                        HStack(alignment: .top, spacing: 8) {
                            Circle()
                                .fill(Color.purple.opacity(0.5))
                                .frame(width: 4, height: 4)
                                .padding(.top, 6)
                            Text(evidence)
                                .font(.system(size: 12))
                                .foregroundColor(textSecondary.opacity(0.9))
                        }
                    }
                }
                .padding(.top, 4)
            }
        }
        .padding(16)
        .background(surfaceColor)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.white.opacity(0.05), lineWidth: 1)
        )
    }
}

struct SourceCard: View {
    let source: KnowledgeSource

    private let surfaceColor = Color(red: 0.14, green: 0.14, blue: 0.15)
    private let textPrimary = Color.white
    private let textSecondary = Color.white.opacity(0.5)

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: source.icon)
                .font(.system(size: 18))
                .foregroundColor(.blue.opacity(0.8))
                .frame(width: 36, height: 36)
                .background(Color.blue.opacity(0.1))
                .cornerRadius(8)

            VStack(alignment: .leading, spacing: 4) {
                Text(source.title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(textPrimary)
                    .lineLimit(1)

                HStack(spacing: 8) {
                    Text(source.sourceType.capitalized)
                        .font(.system(size: 11))
                        .foregroundColor(textSecondary)

                    if let date = source.createdAt {
                        Text("•")
                            .foregroundColor(textSecondary.opacity(0.5))
                        Text(date.formatted(date: .abbreviated, time: .omitted))
                            .font(.system(size: 11))
                            .foregroundColor(textSecondary)
                    }
                }
            }

            Spacer()

            if source.status == "active" {
                Circle()
                    .fill(Color.green)
                    .frame(width: 8, height: 8)
            }
        }
        .padding(14)
        .background(surfaceColor)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.white.opacity(0.05), lineWidth: 1)
        )
    }
}

struct TopicTag: View {
    let topic: String

    var body: some View {
        Text(topic)
            .font(.system(size: 13))
            .foregroundColor(.white.opacity(0.9))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color.white.opacity(0.08))
            .cornerRadius(16)
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.white.opacity(0.1), lineWidth: 1)
            )
    }
}

// MARK: - Flow Layout for Topics

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = FlowResult(in: proposal.width ?? 0, subviews: subviews, spacing: spacing)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = FlowResult(in: bounds.width, subviews: subviews, spacing: spacing)
        for (index, subview) in subviews.enumerated() {
            subview.place(at: CGPoint(x: bounds.minX + result.positions[index].x,
                                       y: bounds.minY + result.positions[index].y),
                          proposal: .unspecified)
        }
    }

    struct FlowResult {
        var size: CGSize = .zero
        var positions: [CGPoint] = []

        init(in maxWidth: CGFloat, subviews: Subviews, spacing: CGFloat) {
            var x: CGFloat = 0
            var y: CGFloat = 0
            var rowHeight: CGFloat = 0

            for subview in subviews {
                let size = subview.sizeThatFits(.unspecified)
                if x + size.width > maxWidth, x > 0 {
                    x = 0
                    y += rowHeight + spacing
                    rowHeight = 0
                }
                positions.append(CGPoint(x: x, y: y))
                rowHeight = max(rowHeight, size.height)
                x += size.width + spacing
                self.size.width = max(self.size.width, x)
            }
            self.size.height = y + rowHeight
        }
    }
}

// MARK: - Models

struct KnowledgeSource: Identifiable, Codable {
    let id: String
    let title: String
    let sourceType: String
    let status: String
    let createdAt: Date?

    var icon: String {
        switch sourceType.lowercased() {
        case "granola": return "calendar"
        case "slack": return "number"
        case "file", "pdf": return "doc.fill"
        case "manual": return "square.and.pencil"
        default: return "doc.fill"
        }
    }

    enum CodingKeys: String, CodingKey {
        case id, title, sourceType, status, createdAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decode(String.self, forKey: .title)
        sourceType = try container.decodeIfPresent(String.self, forKey: .sourceType) ?? "file"
        status = try container.decodeIfPresent(String.self, forKey: .status) ?? "active"

        if let timestamp = try? container.decode(Double.self, forKey: .createdAt) {
            createdAt = Date(timeIntervalSince1970: timestamp / 1000)
        } else {
            createdAt = nil
        }
    }

    init(id: String, title: String, sourceType: String, status: String, createdAt: Date?) {
        self.id = id
        self.title = title
        self.sourceType = sourceType
        self.status = status
        self.createdAt = createdAt
    }
}

struct ExtractedValue: Identifiable, Codable {
    let id: String
    let name: String
    let description: String
    let confidence: Double?
    let evidence: [String]

    var icon: String {
        switch name.lowercased() {
        case let n where n.contains("integrity"): return "shield.fill"
        case let n where n.contains("innovation"): return "lightbulb.fill"
        case let n where n.contains("collaboration"): return "person.3.fill"
        case let n where n.contains("growth"): return "chart.line.uptrend.xyaxis"
        case let n where n.contains("quality"): return "star.fill"
        case let n where n.contains("customer"): return "heart.fill"
        default: return "sparkles"
        }
    }

    init(id: String, name: String, description: String, confidence: Double?, evidence: [String]) {
        self.id = id
        self.name = name
        self.description = description
        self.confidence = confidence
        self.evidence = evidence
    }
}

struct KnowledgeStats: Codable {
    let sourceCount: Int
    let chunkCount: Int
    let topicCount: Int
    let topics: [String]
}

#Preview {
    KnowledgeBaseView()
        .environmentObject(AppState.shared)
        .frame(width: 600, height: 700)
}
