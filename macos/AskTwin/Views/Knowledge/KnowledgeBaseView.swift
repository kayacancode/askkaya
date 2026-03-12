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
            guard let tenantId = await MainActor.run(body: { appState.currentTenantId }) else {
                isLoading = false
                return
            }

            // Fetch knowledge base data
            async let sourcesTask = fetchSources(token: token, tenantId: tenantId)
            async let valuesTask = fetchValues(token: token, tenantId: tenantId)
            async let statsTask = fetchStats(token: token, tenantId: tenantId)

            let (fetchedSources, fetchedValues, fetchedStats) = await (
                try? sourcesTask,
                try? valuesTask,
                try? statsTask
            )

            await MainActor.run {
                sources = fetchedSources ?? []
                values = fetchedValues ?? []
                stats = fetchedStats ?? KnowledgeStats(sourceCount: sources.count, chunkCount: 0, topicCount: 0, topics: [])
                isLoading = false
            }
        } catch {
            await MainActor.run {
                isLoading = false
            }
        }
    }

    private func fetchSources(token: String, tenantId: String) async throws -> [KnowledgeSource] {
        var request = URLRequest(url: URL(string: "https://us-central1-askkaya-47cef.cloudfunctions.net/sourcesApi")!)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(tenantId, forHTTPHeaderField: "X-Tenant-ID")

        let (data, _) = try await URLSession.shared.data(for: request)

        struct SourcesResponse: Codable {
            let sources: [KnowledgeSource]?
        }

        let response = try? JSONDecoder().decode(SourcesResponse.self, from: data)
        return response?.sources ?? []
    }

    private func fetchValues(token: String, tenantId: String) async throws -> [ExtractedValue] {
        var request = URLRequest(url: URL(string: "https://us-central1-askkaya-47cef.cloudfunctions.net/valuesApi")!)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(tenantId, forHTTPHeaderField: "X-Tenant-ID")

        let (data, _) = try await URLSession.shared.data(for: request)

        struct ValuesResponse: Codable {
            let values: [ExtractedValue]?
        }

        let response = try? JSONDecoder().decode(ValuesResponse.self, from: data)
        return response?.values ?? []
    }

    private func fetchStats(token: String, tenantId: String) async throws -> KnowledgeStats {
        var request = URLRequest(url: URL(string: "https://us-central1-askkaya-47cef.cloudfunctions.net/statsApi")!)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(tenantId, forHTTPHeaderField: "X-Tenant-ID")

        let (data, _) = try await URLSession.shared.data(for: request)
        return (try? JSONDecoder().decode(KnowledgeStats.self, from: data)) ?? KnowledgeStats(sourceCount: 0, chunkCount: 0, topicCount: 0, topics: [])
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
