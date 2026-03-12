import SwiftUI
import PDFKit

/// Document preview and redaction view before ingestion
struct DocumentPreviewView: View {
    let documents: [PendingDocument]
    let onConfirm: ([PendingDocument]) -> Void
    let onCancel: () -> Void

    @State private var editableDocuments: [PendingDocument]
    @State private var selectedIndex = 0
    @State private var isProcessing = false

    init(documents: [PendingDocument], onConfirm: @escaping ([PendingDocument]) -> Void, onCancel: @escaping () -> Void) {
        self.documents = documents
        self.onConfirm = onConfirm
        self.onCancel = onCancel
        self._editableDocuments = State(initialValue: documents)
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Review Before Adding to KB")
                    .font(.headline)
                Spacer()
                Text("\(editableDocuments.count) document\(editableDocuments.count == 1 ? "" : "s")")
                    .foregroundStyle(.secondary)
            }
            .padding()
            .background(Color(NSColor.windowBackgroundColor))

            Divider()

            // Document tabs if multiple
            if editableDocuments.count > 1 {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 4) {
                        ForEach(Array(editableDocuments.enumerated()), id: \.element.id) { index, doc in
                            Button(action: { selectedIndex = index }) {
                                HStack(spacing: 4) {
                                    Image(systemName: doc.icon)
                                    Text(doc.filename)
                                        .lineLimit(1)
                                }
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(selectedIndex == index ? Color.accentColor : Color.secondary.opacity(0.2))
                                .foregroundColor(selectedIndex == index ? .white : .primary)
                                .cornerRadius(6)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                }
                .background(Color(NSColor.controlBackgroundColor))
                Divider()
            }

            // Content editor
            if selectedIndex < editableDocuments.count {
                DocumentEditor(document: $editableDocuments[selectedIndex])
            }

            Divider()

            // Footer with actions
            HStack {
                Button("Cancel") {
                    onCancel()
                }
                .keyboardShortcut(.cancelAction)

                Spacer()

                Text("Redact sensitive info by selecting and deleting")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()

                Button(action: confirmIngestion) {
                    if isProcessing {
                        ProgressView()
                            .scaleEffect(0.7)
                    } else {
                        Text("Add to Knowledge Base")
                    }
                }
                .keyboardShortcut(.defaultAction)
                .disabled(isProcessing || editableDocuments.allSatisfy { $0.content.isEmpty })
            }
            .padding()
            .background(Color(NSColor.windowBackgroundColor))
        }
        .frame(minWidth: 700, minHeight: 500)
    }

    private func confirmIngestion() {
        isProcessing = true
        // Filter out empty documents
        let nonEmpty = editableDocuments.filter { !$0.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        onConfirm(nonEmpty)
    }
}

// MARK: - Document Editor

struct DocumentEditor: View {
    @Binding var document: PendingDocument

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Title editor
            HStack {
                Text("Title:")
                    .foregroundStyle(.secondary)
                TextField("Document title", text: $document.title)
                    .textFieldStyle(.roundedBorder)
            }
            .padding(.horizontal)
            .padding(.top, 8)

            // Content editor
            TextEditor(text: $document.content)
                .font(.system(.body, design: .monospaced))
                .padding(4)
                .background(Color(NSColor.textBackgroundColor))
                .cornerRadius(8)
                .padding(.horizontal)
                .padding(.bottom, 8)

            // Stats
            HStack {
                Text("\(document.content.count) characters")
                Text("•")
                Text("\(document.content.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.count) words")
                Spacer()
                if document.wasModified {
                    Label("Modified", systemImage: "pencil.circle.fill")
                        .foregroundColor(.orange)
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .padding(.horizontal)
            .padding(.bottom, 8)
        }
    }
}

// MARK: - Models

struct PendingDocument: Identifiable {
    let id = UUID()
    let sourceURL: URL?
    var filename: String
    var title: String
    var content: String
    let originalContent: String

    var wasModified: Bool {
        content != originalContent
    }

    var icon: String {
        guard let url = sourceURL else { return "doc.text" }
        switch url.pathExtension.lowercased() {
        case "pdf": return "doc.richtext"
        case "md": return "doc.text"
        case "txt": return "doc.plaintext"
        case "json": return "curlybraces"
        default: return "doc"
        }
    }
}

// MARK: - Document Loader

enum DocumentLoader {
    /// Load documents from URLs, extracting text content
    static func loadDocuments(from urls: [URL]) async -> [PendingDocument] {
        var documents: [PendingDocument] = []

        for url in urls {
            if let doc = await loadDocument(from: url) {
                documents.append(doc)
            }
        }

        return documents
    }

    static func loadDocument(from url: URL) async -> PendingDocument? {
        let filename = url.lastPathComponent
        let ext = url.pathExtension.lowercased()

        do {
            let content: String

            if ext == "pdf" {
                guard let pdfDoc = PDFDocument(url: url) else { return nil }
                var text = ""
                for i in 0..<pdfDoc.pageCount {
                    if let page = pdfDoc.page(at: i), let pageText = page.string {
                        text += pageText + "\n\n"
                    }
                }
                content = text.trimmingCharacters(in: .whitespacesAndNewlines)
            } else {
                let data = try Data(contentsOf: url)
                guard let text = String(data: data, encoding: .utf8) else { return nil }
                content = text
            }

            guard !content.isEmpty else { return nil }

            return PendingDocument(
                sourceURL: url,
                filename: filename,
                title: filename,
                content: content,
                originalContent: content
            )
        } catch {
            NSLog("[DocumentLoader] Failed to load \(filename): \(error)")
            return nil
        }
    }
}

// MARK: - Preview

#Preview {
    DocumentPreviewView(
        documents: [
            PendingDocument(
                sourceURL: nil,
                filename: "meeting-notes.md",
                title: "Meeting Notes",
                content: "# Team Sync\n\nDiscussed Q2 roadmap...\n\n## Action Items\n- Review PRD\n- Schedule design review",
                originalContent: "# Team Sync\n\nDiscussed Q2 roadmap..."
            )
        ],
        onConfirm: { _ in },
        onCancel: { }
    )
}
