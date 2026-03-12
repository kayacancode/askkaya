import SwiftUI

// MARK: - Knowledge Graph View

struct KnowledgeGraphView: View {
    @EnvironmentObject var appState: AppState
    @State private var nodes: [GraphNode] = []
    @State private var edges: [GraphEdge] = []
    @State private var isLoading = true
    @State private var selectedNode: GraphNode?
    @State private var scale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var lastDragOffset: CGSize = .zero

    var body: some View {
        ZStack {
            GranolaTheme.cream.ignoresSafeArea()

            VStack(spacing: 0) {
                // Header
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Knowledge Graph")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(GranolaTheme.textPrimary)
                        Text("Visualize connections in your knowledge")
                            .font(.system(size: 13))
                            .foregroundColor(GranolaTheme.textSecondary)
                    }

                    Spacer()

                    // Zoom controls
                    HStack(spacing: 8) {
                        Button(action: { withAnimation { scale = max(0.5, scale - 0.2) } }) {
                            Image(systemName: "minus.magnifyingglass")
                                .font(.system(size: 14))
                                .foregroundColor(GranolaTheme.textSecondary)
                        }
                        .buttonStyle(.plain)

                        Text("\(Int(scale * 100))%")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(GranolaTheme.textSecondary)
                            .frame(width: 40)

                        Button(action: { withAnimation { scale = min(2.0, scale + 0.2) } }) {
                            Image(systemName: "plus.magnifyingglass")
                                .font(.system(size: 14))
                                .foregroundColor(GranolaTheme.textSecondary)
                        }
                        .buttonStyle(.plain)

                        Divider()
                            .frame(height: 16)

                        Button(action: { Task { await loadGraphData() } }) {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 14))
                                .foregroundColor(GranolaTheme.textSecondary)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(GranolaTheme.creamDark)
                    .cornerRadius(8)
                }
                .padding(.horizontal, 24)
                .padding(.top, 24)
                .padding(.bottom, 16)

                Rectangle()
                    .fill(GranolaTheme.creamBorder)
                    .frame(height: 1)

                // Graph canvas
                if isLoading {
                    Spacer()
                    VStack(spacing: 12) {
                        ProgressView()
                            .scaleEffect(1.2)
                        Text("Building knowledge graph...")
                            .font(.system(size: 14))
                            .foregroundColor(GranolaTheme.textSecondary)
                    }
                    Spacer()
                } else if nodes.isEmpty {
                    Spacer()
                    VStack(spacing: 16) {
                        Image(systemName: "point.3.connected.trianglepath.dotted")
                            .font(.system(size: 48))
                            .foregroundColor(GranolaTheme.textSecondary.opacity(0.5))
                        Text("No connections yet")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(GranolaTheme.textSecondary)
                        Text("Add more content to see your knowledge graph")
                            .font(.system(size: 13))
                            .foregroundColor(GranolaTheme.textSecondary.opacity(0.7))
                    }
                    Spacer()
                } else {
                    GeometryReader { geometry in
                        ZStack {
                            // Edges
                            ForEach(edges) { edge in
                                if let fromNode = nodes.first(where: { $0.id == edge.from }),
                                   let toNode = nodes.first(where: { $0.id == edge.to }) {
                                    GraphEdgeView(
                                        from: fromNode.position,
                                        to: toNode.position,
                                        strength: edge.strength
                                    )
                                }
                            }

                            // Nodes
                            ForEach(nodes) { node in
                                GraphNodeView(
                                    node: node,
                                    isSelected: selectedNode?.id == node.id,
                                    onTap: { selectedNode = node },
                                    onDrag: { newPosition in
                                        if let index = nodes.firstIndex(where: { $0.id == node.id }) {
                                            nodes[index].position = newPosition
                                        }
                                    }
                                )
                            }
                        }
                        .scaleEffect(scale)
                        .offset(offset)
                        .gesture(
                            DragGesture()
                                .onChanged { value in
                                    offset = CGSize(
                                        width: lastDragOffset.width + value.translation.width,
                                        height: lastDragOffset.height + value.translation.height
                                    )
                                }
                                .onEnded { _ in
                                    lastDragOffset = offset
                                }
                        )
                        .gesture(
                            MagnificationGesture()
                                .onChanged { value in
                                    scale = max(0.5, min(2.0, value))
                                }
                        )
                        .onTapGesture {
                            selectedNode = nil
                        }
                    }
                    .clipped()
                }

                // Selected node details
                if let node = selectedNode {
                    NodeDetailPanel(node: node, onClose: { selectedNode = nil })
                }
            }
        }
        .task {
            await loadGraphData()
        }
    }

    private func loadGraphData() async {
        await MainActor.run { isLoading = true }

        // Load from Granola cache and KB articles
        let graphData = await buildGraphFromSources()

        await MainActor.run {
            nodes = graphData.nodes
            edges = graphData.edges
            isLoading = false
        }
    }

    private func buildGraphFromSources() async -> (nodes: [GraphNode], edges: [GraphEdge]) {
        var nodeDict: [String: GraphNode] = [:]
        var edgeSet: Set<String> = []
        var edgeList: [GraphEdge] = []

        // Extract from Granola cache
        let baseURL = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Granola")
        var cacheURL = baseURL.appendingPathComponent("cache-v6.json")
        if !FileManager.default.fileExists(atPath: cacheURL.path) {
            cacheURL = baseURL.appendingPathComponent("cache-v4.json")
        }

        if let data = try? Data(contentsOf: cacheURL),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let documents = json["documents"] as? [[String: Any]] {

            for doc in documents {
                let title = doc["title"] as? String ?? "Untitled"
                let transcript = doc["transcript"] as? String ?? ""
                let notes = doc["notes"] as? String ?? ""
                let content = transcript + " " + notes

                // Create meeting node
                let meetingId = "meeting_\(title.hashValue)"
                if nodeDict[meetingId] == nil {
                    nodeDict[meetingId] = GraphNode(
                        id: meetingId,
                        label: title,
                        type: .meeting,
                        position: randomPosition(),
                        metadata: ["content": String(content.prefix(200))]
                    )
                }

                // Extract people
                if let participants = doc["participants"] as? [[String: Any]] {
                    for participant in participants {
                        let name = participant["name"] as? String ?? ""
                        if name.isEmpty || name == "Unknown" { continue }

                        let personId = "person_\(name.hashValue)"
                        if nodeDict[personId] == nil {
                            nodeDict[personId] = GraphNode(
                                id: personId,
                                label: name,
                                type: .person,
                                position: randomPosition(),
                                metadata: ["email": participant["email"] as? String ?? ""]
                            )
                        }

                        // Connect person to meeting
                        let edgeKey = "\(personId)_\(meetingId)"
                        if !edgeSet.contains(edgeKey) {
                            edgeSet.insert(edgeKey)
                            edgeList.append(GraphEdge(
                                id: edgeKey,
                                from: personId,
                                to: meetingId,
                                strength: 0.8
                            ))
                        }
                    }
                }

                // Extract topics from content
                let topics = extractTopics(from: content)
                for topic in topics.prefix(3) {
                    let topicId = "topic_\(topic.hashValue)"
                    if nodeDict[topicId] == nil {
                        nodeDict[topicId] = GraphNode(
                            id: topicId,
                            label: topic,
                            type: .topic,
                            position: randomPosition(),
                            metadata: [:]
                        )
                    }

                    // Connect topic to meeting
                    let edgeKey = "\(meetingId)_\(topicId)"
                    if !edgeSet.contains(edgeKey) {
                        edgeSet.insert(edgeKey)
                        edgeList.append(GraphEdge(
                            id: edgeKey,
                            from: meetingId,
                            to: topicId,
                            strength: 0.5
                        ))
                    }
                }
            }
        }

        // Apply force-directed layout
        var nodes = Array(nodeDict.values)
        nodes = applyForceLayout(nodes: nodes, edges: edgeList)

        return (nodes, edgeList)
    }

    private func randomPosition() -> CGPoint {
        CGPoint(
            x: CGFloat.random(in: 100...500),
            y: CGFloat.random(in: 100...400)
        )
    }

    private func extractTopics(from text: String) -> [String] {
        let words = text.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { $0.count > 5 }

        var counts: [String: Int] = [:]
        for word in words {
            counts[word, default: 0] += 1
        }

        return counts
            .filter { $0.value > 2 }
            .sorted { $0.value > $1.value }
            .prefix(5)
            .map { $0.key.capitalized }
    }

    private func applyForceLayout(nodes: [GraphNode], edges: [GraphEdge]) -> [GraphNode] {
        var result = nodes
        let iterations = 50
        let repulsion: CGFloat = 5000
        let attraction: CGFloat = 0.01
        let damping: CGFloat = 0.9

        for _ in 0..<iterations {
            var forces: [String: CGVector] = [:]

            // Initialize forces
            for node in result {
                forces[node.id] = .zero
            }

            // Repulsion between all nodes
            for i in 0..<result.count {
                for j in (i + 1)..<result.count {
                    let dx = result[j].position.x - result[i].position.x
                    let dy = result[j].position.y - result[i].position.y
                    let distance = max(sqrt(dx * dx + dy * dy), 1)
                    let force = repulsion / (distance * distance)

                    let fx = (dx / distance) * force
                    let fy = (dy / distance) * force

                    forces[result[i].id]!.dx -= fx
                    forces[result[i].id]!.dy -= fy
                    forces[result[j].id]!.dx += fx
                    forces[result[j].id]!.dy += fy
                }
            }

            // Attraction along edges
            for edge in edges {
                guard let fromIdx = result.firstIndex(where: { $0.id == edge.from }),
                      let toIdx = result.firstIndex(where: { $0.id == edge.to }) else { continue }

                let dx = result[toIdx].position.x - result[fromIdx].position.x
                let dy = result[toIdx].position.y - result[fromIdx].position.y
                let distance = sqrt(dx * dx + dy * dy)

                let fx = dx * attraction * distance
                let fy = dy * attraction * distance

                forces[result[fromIdx].id]!.dx += fx
                forces[result[fromIdx].id]!.dy += fy
                forces[result[toIdx].id]!.dx -= fx
                forces[result[toIdx].id]!.dy -= fy
            }

            // Apply forces with damping
            for i in 0..<result.count {
                let force = forces[result[i].id]!
                result[i].position.x += force.dx * damping
                result[i].position.y += force.dy * damping

                // Keep in bounds
                result[i].position.x = max(50, min(550, result[i].position.x))
                result[i].position.y = max(50, min(450, result[i].position.y))
            }
        }

        return result
    }
}

// MARK: - Graph Node View

struct GraphNodeView: View {
    let node: GraphNode
    let isSelected: Bool
    let onTap: () -> Void
    let onDrag: (CGPoint) -> Void

    @State private var isDragging = false

    var body: some View {
        VStack(spacing: 4) {
            Circle()
                .fill(node.type.color.opacity(isSelected ? 1 : 0.8))
                .frame(width: node.type.size, height: node.type.size)
                .overlay(
                    Circle()
                        .stroke(isSelected ? GranolaTheme.textPrimary : Color.clear, lineWidth: 2)
                )
                .overlay(
                    Image(systemName: node.type.icon)
                        .font(.system(size: node.type.size * 0.4))
                        .foregroundColor(.white)
                )
                .shadow(color: node.type.color.opacity(0.3), radius: isSelected ? 8 : 4)

            Text(node.label)
                .font(.system(size: 10, weight: isSelected ? .semibold : .regular))
                .foregroundColor(GranolaTheme.textPrimary)
                .lineLimit(1)
                .frame(maxWidth: 80)
        }
        .position(node.position)
        .gesture(
            DragGesture()
                .onChanged { value in
                    isDragging = true
                    onDrag(value.location)
                }
                .onEnded { _ in
                    isDragging = false
                }
        )
        .onTapGesture {
            onTap()
        }
    }
}

// MARK: - Graph Edge View

struct GraphEdgeView: View {
    let from: CGPoint
    let to: CGPoint
    let strength: Double

    var body: some View {
        Path { path in
            path.move(to: from)
            path.addLine(to: to)
        }
        .stroke(
            GranolaTheme.textSecondary.opacity(strength * 0.5),
            style: StrokeStyle(lineWidth: 1 + strength, lineCap: .round)
        )
    }
}

// MARK: - Node Detail Panel

struct NodeDetailPanel: View {
    let node: GraphNode
    let onClose: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Rectangle()
                .fill(GranolaTheme.creamBorder)
                .frame(height: 1)

            HStack(spacing: 14) {
                Circle()
                    .fill(node.type.color)
                    .frame(width: 32, height: 32)
                    .overlay(
                        Image(systemName: node.type.icon)
                            .font(.system(size: 14))
                            .foregroundColor(.white)
                    )

                VStack(alignment: .leading, spacing: 2) {
                    Text(node.label)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(GranolaTheme.textPrimary)
                    Text(node.type.displayName)
                        .font(.system(size: 12))
                        .foregroundColor(GranolaTheme.textSecondary)
                }

                Spacer()

                if let content = node.metadata["content"] {
                    Text(content)
                        .font(.system(size: 12))
                        .foregroundColor(GranolaTheme.textSecondary)
                        .lineLimit(2)
                        .frame(maxWidth: 200)
                }

                Button(action: onClose) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 18))
                        .foregroundColor(GranolaTheme.textSecondary)
                }
                .buttonStyle(.plain)
            }
            .padding(16)
            .background(GranolaTheme.creamDark)
        }
    }
}

// MARK: - Models

struct GraphNode: Identifiable {
    let id: String
    let label: String
    let type: NodeType
    var position: CGPoint
    let metadata: [String: String]
}

struct GraphEdge: Identifiable {
    let id: String
    let from: String
    let to: String
    let strength: Double
}

enum NodeType {
    case person
    case meeting
    case topic
    case document
    case concept

    var color: Color {
        switch self {
        case .person: return .blue
        case .meeting: return .green
        case .topic: return .purple
        case .document: return .orange
        case .concept: return .pink
        }
    }

    var icon: String {
        switch self {
        case .person: return "person.fill"
        case .meeting: return "calendar"
        case .topic: return "tag.fill"
        case .document: return "doc.fill"
        case .concept: return "lightbulb.fill"
        }
    }

    var size: CGFloat {
        switch self {
        case .person: return 36
        case .meeting: return 32
        case .topic: return 28
        case .document: return 30
        case .concept: return 26
        }
    }

    var displayName: String {
        switch self {
        case .person: return "Person"
        case .meeting: return "Meeting"
        case .topic: return "Topic"
        case .document: return "Document"
        case .concept: return "Concept"
        }
    }
}

#Preview {
    KnowledgeGraphView()
        .environmentObject(AppState.shared)
        .frame(width: 800, height: 600)
}
