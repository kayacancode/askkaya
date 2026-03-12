import SwiftUI

// MARK: - Main Intelligence View

struct IntelligenceView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedTab = 0
    @State private var isLoading = true
    @State private var intelligenceData: IntelligenceData?

    var body: some View {
        ZStack {
            GranolaTheme.cream.ignoresSafeArea()

            VStack(spacing: 0) {
                // Header
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Intelligence")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(GranolaTheme.textPrimary)
                        Text("Patterns extracted from your knowledge")
                            .font(.system(size: 13))
                            .foregroundColor(GranolaTheme.textSecondary)
                    }

                    Spacer()

                    Button(action: { Task { await extractIntelligence() } }) {
                        HStack(spacing: 6) {
                            Image(systemName: "sparkles")
                            Text("Extract")
                        }
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(GranolaTheme.cream)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(GranolaTheme.textPrimary)
                        .cornerRadius(6)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 24)
                .padding(.top, 24)
                .padding(.bottom, 16)

                // Tab picker
                HStack(spacing: 0) {
                    IntelTabButton(title: "People", icon: "person.2.fill", isSelected: selectedTab == 0) { selectedTab = 0 }
                    IntelTabButton(title: "Actions", icon: "checkmark.circle.fill", isSelected: selectedTab == 1) { selectedTab = 1 }
                    IntelTabButton(title: "Patterns", icon: "chart.bar.fill", isSelected: selectedTab == 2) { selectedTab = 2 }
                    IntelTabButton(title: "Concepts", icon: "lightbulb.fill", isSelected: selectedTab == 3) { selectedTab = 3 }
                }
                .padding(.horizontal, 24)

                Rectangle()
                    .fill(GranolaTheme.creamBorder)
                    .frame(height: 1)

                // Content
                if isLoading {
                    Spacer()
                    VStack(spacing: 12) {
                        ProgressView()
                            .scaleEffect(1.2)
                        Text("Analyzing your knowledge base...")
                            .font(.system(size: 14))
                            .foregroundColor(GranolaTheme.textSecondary)
                    }
                    Spacer()
                } else if let data = intelligenceData {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 16) {
                            switch selectedTab {
                            case 0:
                                PeopleSection(people: data.people)
                            case 1:
                                ActionsSection(actions: data.actionItems)
                            case 2:
                                PatternsSection(patterns: data.patterns)
                            case 3:
                                ConceptsSection(concepts: data.concepts)
                            default:
                                EmptyView()
                            }
                        }
                        .padding(24)
                    }
                } else {
                    Spacer()
                    VStack(spacing: 16) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 48))
                            .foregroundColor(GranolaTheme.textSecondary.opacity(0.5))
                        Text("Click Extract to analyze your knowledge")
                            .font(.system(size: 15))
                            .foregroundColor(GranolaTheme.textSecondary)
                    }
                    Spacer()
                }
            }
        }
        .task {
            await loadCachedIntelligence()
        }
    }

    private func loadCachedIntelligence() async {
        // Try to load from local cache or generate sample data
        await MainActor.run {
            // For now, show empty state until extraction
            isLoading = false
        }
    }

    private func extractIntelligence() async {
        await MainActor.run { isLoading = true }

        // Extract directly from Granola cache
        let extracted = await extractFromGranolaCache()

        await MainActor.run {
            intelligenceData = extracted
            isLoading = false
        }
    }

    private func extractFromGranolaCache() async -> IntelligenceData {
        let baseURL = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Granola")

        // Try different cache versions (v6 is current, fallback to v4)
        var cacheURL = baseURL.appendingPathComponent("cache-v6.json")
        if !FileManager.default.fileExists(atPath: cacheURL.path) {
            cacheURL = baseURL.appendingPathComponent("cache-v4.json")
        }

        NSLog("[Intelligence] Reading from: \(cacheURL.path)")

        guard let data = try? Data(contentsOf: cacheURL),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let documents = json["documents"] as? [[String: Any]] else {
            NSLog("[Intelligence] Could not read Granola cache")
            return generateEmptyIntelligence()
        }

        var peopleDict: [String: PersonIntel] = [:]
        var actionItems: [ActionItem] = []
        var topicCounts: [String: Int] = [:]
        var allConcepts: [String] = []

        for doc in documents {
            let title = doc["title"] as? String ?? "Untitled"
            let transcript = doc["transcript"] as? String ?? ""
            let notes = doc["notes"] as? String ?? ""
            let content = transcript + " " + notes

            // Extract participants
            if let participants = doc["participants"] as? [[String: Any]] {
                for participant in participants {
                    let name = participant["name"] as? String ?? ""
                    let email = participant["email"] as? String
                    let company = email?.components(separatedBy: "@").last?.replacingOccurrences(of: ".com", with: "").capitalized ?? ""

                    if !name.isEmpty && name != "Unknown" {
                        if var existing = peopleDict[name] {
                            existing = PersonIntel(
                                name: existing.name,
                                role: existing.role,
                                company: existing.company.isEmpty ? company : existing.company,
                                context: existing.context,
                                meetingCount: existing.meetingCount + 1,
                                lastContact: title
                            )
                            peopleDict[name] = existing
                        } else {
                            peopleDict[name] = PersonIntel(
                                name: name,
                                role: "",
                                company: company,
                                context: "Met in: \(title)",
                                meetingCount: 1,
                                lastContact: title
                            )
                        }
                    }
                }
            }

            // Extract action items from content
            let actionPatterns = [
                "need to", "should", "will", "action:", "todo:", "follow up",
                "let's", "we'll", "i'll", "going to", "make sure", "don't forget"
            ]
            let sentences = content.components(separatedBy: CharacterSet(charactersIn: ".!?\n"))
            for sentence in sentences {
                let lower = sentence.lowercased()
                for pattern in actionPatterns {
                    if lower.contains(pattern) && sentence.count > 20 && sentence.count < 200 {
                        let cleaned = sentence.trimmingCharacters(in: .whitespacesAndNewlines)
                        if !cleaned.isEmpty && !actionItems.contains(where: { $0.task == cleaned }) {
                            actionItems.append(ActionItem(
                                task: cleaned,
                                owner: "",
                                dueDate: "",
                                status: .pending,
                                source: title
                            ))
                        }
                        break
                    }
                }
            }

            // Extract topics/patterns
            let words = content.lowercased()
                .components(separatedBy: CharacterSet.alphanumerics.inverted)
                .filter { $0.count > 5 }

            for word in words {
                topicCounts[word, default: 0] += 1
            }

            // Extract concepts (look for framework-like phrases)
            let conceptPatterns = ["framework", "model", "approach", "strategy", "principle", "system", "process", "method"]
            for pattern in conceptPatterns {
                if content.lowercased().contains(pattern) {
                    // Find the sentence containing this concept
                    for sentence in sentences {
                        if sentence.lowercased().contains(pattern) && sentence.count > 30 {
                            let cleaned = sentence.trimmingCharacters(in: .whitespacesAndNewlines)
                            if !allConcepts.contains(cleaned) {
                                allConcepts.append(cleaned)
                            }
                            break
                        }
                    }
                }
            }
        }

        // Build people array sorted by meeting count
        let people = peopleDict.values
            .sorted { $0.meetingCount > $1.meetingCount }
            .prefix(20)
            .map { $0 }

        // Build patterns from top topics
        let topTopics = topicCounts
            .sorted { $0.value > $1.value }
            .prefix(10)

        var patterns: [PatternIntel] = []
        for (topic, count) in topTopics {
            if count > 3 {
                patterns.append(PatternIntel(
                    name: topic.capitalized,
                    description: "Mentioned \(count) times across your meetings",
                    frequency: count,
                    examples: []
                ))
            }
        }

        // Build concepts
        let concepts = allConcepts.prefix(10).map { concept in
            ConceptIntel(
                name: String(concept.prefix(50)) + (concept.count > 50 ? "..." : ""),
                description: concept,
                source: "Extracted from meetings",
                relatedPeople: []
            )
        }

        return IntelligenceData(
            people: Array(people),
            actionItems: Array(actionItems.prefix(20)),
            patterns: patterns.isEmpty ? [PatternIntel(name: "No patterns yet", description: "Add more content to see patterns", frequency: 0, examples: [])] : patterns,
            concepts: concepts.isEmpty ? [ConceptIntel(name: "No concepts yet", description: "Concepts will be extracted from your discussions", source: "", relatedPeople: [])] : Array(concepts)
        )
    }

    private func generateEmptyIntelligence() -> IntelligenceData {
        IntelligenceData(
            people: [PersonIntel(name: "No Granola data found", role: "", company: "", context: "Sync Granola meetings first", meetingCount: 0, lastContact: nil)],
            actionItems: [ActionItem(task: "Sync your Granola meetings", owner: "You", dueDate: "Today", status: .pending, source: "AskKaya")],
            patterns: [PatternIntel(name: "No patterns yet", description: "Sync meetings to see patterns", frequency: 0, examples: [])],
            concepts: [ConceptIntel(name: "No concepts yet", description: "Sync meetings to extract concepts", source: "", relatedPeople: [])]
        )
    }
}

struct AskApiResponse: Codable {
    let answer: String
    let confidence: Double?
}

// MARK: - Tab Button

struct IntelTabButton: View {
    let title: String
    let icon: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 12))
                Text(title)
                    .font(.system(size: 13, weight: isSelected ? .semibold : .regular))
            }
            .foregroundColor(isSelected ? GranolaTheme.textPrimary : GranolaTheme.textSecondary)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(isSelected ? GranolaTheme.creamDark : Color.clear)
            .cornerRadius(6)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - People Section

struct PeopleSection: View {
    let people: [PersonIntel]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Relationship Network")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(GranolaTheme.textSecondary)
                .textCase(.uppercase)
                .tracking(0.5)

            ForEach(people) { person in
                PersonCard(person: person)
            }
        }
    }
}

struct PersonCard: View {
    let person: PersonIntel

    var body: some View {
        HStack(spacing: 14) {
            // Avatar
            Circle()
                .fill(Color.blue.opacity(0.15))
                .frame(width: 44, height: 44)
                .overlay(
                    Text(String(person.name.prefix(1)).uppercased())
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.blue)
                )

            VStack(alignment: .leading, spacing: 4) {
                Text(person.name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(GranolaTheme.textPrimary)

                if !person.role.isEmpty || !person.company.isEmpty {
                    Text([person.role, person.company].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.system(size: 12))
                        .foregroundColor(GranolaTheme.textSecondary)
                }

                if !person.context.isEmpty {
                    Text(person.context)
                        .font(.system(size: 12))
                        .foregroundColor(GranolaTheme.textSecondary.opacity(0.8))
                        .lineLimit(2)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                if person.meetingCount > 0 {
                    Text("\(person.meetingCount) meetings")
                        .font(.system(size: 11))
                        .foregroundColor(GranolaTheme.textSecondary)
                }
                if let lastContact = person.lastContact {
                    Text(lastContact)
                        .font(.system(size: 11))
                        .foregroundColor(GranolaTheme.textSecondary.opacity(0.7))
                }
            }
        }
        .padding(14)
        .background(GranolaTheme.creamDark)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(GranolaTheme.creamBorder, lineWidth: 1)
        )
    }
}

// MARK: - Actions Section

struct ActionsSection: View {
    let actions: [ActionItem]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Action Items")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(GranolaTheme.textSecondary)
                .textCase(.uppercase)
                .tracking(0.5)

            ForEach(actions) { action in
                ActionCard(action: action)
            }
        }
    }
}

struct ActionCard: View {
    let action: ActionItem

    var body: some View {
        HStack(spacing: 12) {
            // Status indicator
            Image(systemName: action.status == .completed ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 18))
                .foregroundColor(action.status == .completed ? .green : GranolaTheme.textSecondary)

            VStack(alignment: .leading, spacing: 4) {
                Text(action.task)
                    .font(.system(size: 14))
                    .foregroundColor(GranolaTheme.textPrimary)
                    .strikethrough(action.status == .completed)

                HStack(spacing: 8) {
                    if !action.owner.isEmpty {
                        HStack(spacing: 4) {
                            Image(systemName: "person.fill")
                                .font(.system(size: 10))
                            Text(action.owner)
                        }
                        .font(.system(size: 11))
                        .foregroundColor(GranolaTheme.textSecondary)
                    }

                    if !action.dueDate.isEmpty {
                        HStack(spacing: 4) {
                            Image(systemName: "calendar")
                                .font(.system(size: 10))
                            Text(action.dueDate)
                        }
                        .font(.system(size: 11))
                        .foregroundColor(action.dueDate.lowercased().contains("overdue") ? .red : GranolaTheme.textSecondary)
                    }

                    Text("from \(action.source)")
                        .font(.system(size: 11))
                        .foregroundColor(GranolaTheme.textSecondary.opacity(0.7))
                }
            }

            Spacer()
        }
        .padding(14)
        .background(GranolaTheme.creamDark)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(GranolaTheme.creamBorder, lineWidth: 1)
        )
    }
}

// MARK: - Patterns Section

struct PatternsSection: View {
    let patterns: [PatternIntel]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Recurring Patterns")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(GranolaTheme.textSecondary)
                .textCase(.uppercase)
                .tracking(0.5)

            ForEach(patterns) { pattern in
                PatternCard(pattern: pattern)
            }
        }
    }
}

struct PatternCard: View {
    let pattern: PatternIntel

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "chart.bar.fill")
                    .font(.system(size: 14))
                    .foregroundColor(.purple)

                Text(pattern.name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(GranolaTheme.textPrimary)

                Spacer()

                if pattern.frequency > 0 {
                    Text("\(pattern.frequency)x")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.purple)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.purple.opacity(0.1))
                        .cornerRadius(4)
                }
            }

            Text(pattern.description)
                .font(.system(size: 13))
                .foregroundColor(GranolaTheme.textSecondary)
                .lineSpacing(4)

            if !pattern.examples.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Examples")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(GranolaTheme.textSecondary.opacity(0.7))

                    ForEach(pattern.examples.prefix(3), id: \.self) { example in
                        HStack(alignment: .top, spacing: 8) {
                            Circle()
                                .fill(Color.purple.opacity(0.5))
                                .frame(width: 4, height: 4)
                                .padding(.top, 6)
                            Text(example)
                                .font(.system(size: 12))
                                .foregroundColor(GranolaTheme.textSecondary)
                        }
                    }
                }
            }
        }
        .padding(16)
        .background(GranolaTheme.creamDark)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(GranolaTheme.creamBorder, lineWidth: 1)
        )
    }
}

// MARK: - Concepts Section

struct ConceptsSection: View {
    let concepts: [ConceptIntel]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Mental Models & Frameworks")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(GranolaTheme.textSecondary)
                .textCase(.uppercase)
                .tracking(0.5)

            ForEach(concepts) { concept in
                ConceptCard(concept: concept)
            }
        }
    }
}

struct ConceptCard: View {
    let concept: ConceptIntel

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "lightbulb.fill")
                    .font(.system(size: 14))
                    .foregroundColor(.orange)

                Text(concept.name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(GranolaTheme.textPrimary)

                Spacer()
            }

            Text(concept.description)
                .font(.system(size: 13))
                .foregroundColor(GranolaTheme.textSecondary)
                .lineSpacing(4)

            HStack(spacing: 12) {
                if !concept.source.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "doc.fill")
                            .font(.system(size: 10))
                        Text(concept.source)
                    }
                    .font(.system(size: 11))
                    .foregroundColor(GranolaTheme.textSecondary.opacity(0.7))
                }

                if !concept.relatedPeople.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "person.2.fill")
                            .font(.system(size: 10))
                        Text(concept.relatedPeople.joined(separator: ", "))
                    }
                    .font(.system(size: 11))
                    .foregroundColor(GranolaTheme.textSecondary.opacity(0.7))
                }
            }
        }
        .padding(16)
        .background(GranolaTheme.creamDark)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(GranolaTheme.creamBorder, lineWidth: 1)
        )
    }
}

// MARK: - Data Models

struct IntelligenceData: Codable {
    let people: [PersonIntel]
    let actionItems: [ActionItem]
    let patterns: [PatternIntel]
    let concepts: [ConceptIntel]
}

struct PersonIntel: Identifiable, Codable {
    var id: String { name }
    let name: String
    let role: String
    let company: String
    let context: String
    let meetingCount: Int
    let lastContact: String?
}

struct ActionItem: Identifiable, Codable {
    var id: String { task }
    let task: String
    let owner: String
    let dueDate: String
    let status: ActionStatus
    let source: String
}

enum ActionStatus: String, Codable {
    case pending
    case completed
    case overdue
}

struct PatternIntel: Identifiable, Codable {
    var id: String { name }
    let name: String
    let description: String
    let frequency: Int
    let examples: [String]
}

struct ConceptIntel: Identifiable, Codable {
    var id: String { name }
    let name: String
    let description: String
    let source: String
    let relatedPeople: [String]
}

#Preview {
    IntelligenceView()
        .environmentObject(AppState.shared)
        .frame(width: 700, height: 800)
}
