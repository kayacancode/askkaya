import Foundation

/// Service to read Granola meeting notes from local cache
actor GranolaService {
    static let shared = GranolaService()

    private let cacheURL: URL = {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Granola/cache-v4.json")
    }()

    private init() {}

    // MARK: - Public API

    /// List all meetings from the last N days
    func listMeetings(days: Int = 30) async throws -> [GranolaMeeting] {
        let cache = try loadCache()
        let cutoffDate = Calendar.current.date(byAdding: .day, value: -days, to: Date()) ?? Date()

        NSLog("[GranolaService] Found \(cache.documents.count) total documents in cache")
        NSLog("[GranolaService] Cutoff date: \(cutoffDate)")

        var meetings: [GranolaMeeting] = []
        var skippedNoDate = 0
        var skippedOld = 0
        var skippedDeleted = 0

        for (id, doc) in cache.documents {
            guard let createdAt = doc.createdAt else {
                skippedNoDate += 1
                continue
            }
            guard createdAt > cutoffDate else {
                skippedOld += 1
                continue
            }
            guard doc.deletedAt == nil else {
                skippedDeleted += 1
                continue
            }

            let transcript = cache.transcripts[id]?.map { $0.text }.joined(separator: " ")

            meetings.append(GranolaMeeting(
                id: id,
                title: doc.title ?? "Untitled Meeting",
                createdAt: createdAt,
                notesMarkdown: doc.notesMarkdown,
                notesPlain: doc.notesPlain,
                summary: doc.summary,
                transcript: transcript,
                attendees: doc.people?.attendees?.compactMap { $0.email } ?? []
            ))
        }

        NSLog("[GranolaService] Skipped: noDate=\(skippedNoDate), old=\(skippedOld), deleted=\(skippedDeleted)")
        NSLog("[GranolaService] Found \(meetings.count) meetings in last \(days) days")

        return meetings.sorted { $0.createdAt > $1.createdAt }
    }

    /// Get a specific meeting by ID
    func getMeeting(id: String) async throws -> GranolaMeeting? {
        let cache = try loadCache()

        guard let doc = cache.documents[id] else {
            return nil
        }

        let transcript = cache.transcripts[id]?.map { $0.text }.joined(separator: " ")

        return GranolaMeeting(
            id: id,
            title: doc.title ?? "Untitled Meeting",
            createdAt: doc.createdAt ?? Date(),
            notesMarkdown: doc.notesMarkdown,
            notesPlain: doc.notesPlain,
            summary: doc.summary,
            transcript: transcript,
            attendees: doc.people?.attendees?.compactMap { $0.email } ?? []
        )
    }

    /// Sync all meetings from the last N days to KB
    func syncToKB(days: Int = 30, tenantId: String) async throws -> SyncResult {
        let meetings = try await listMeetings(days: days)
        let token = try await AuthService.shared.getValidToken()

        var synced = 0
        var failed = 0

        for meeting in meetings {
            do {
                try await ingestMeeting(meeting, token: token, tenantId: tenantId)
                synced += 1
            } catch {
                NSLog("[GranolaService] Failed to sync meeting \(meeting.id): \(error)")
                failed += 1
            }
        }

        return SyncResult(synced: synced, failed: failed, total: meetings.count)
    }

    // MARK: - Private

    private func loadCache() throws -> GranolaCache {
        guard FileManager.default.fileExists(atPath: cacheURL.path) else {
            throw GranolaError.cacheNotFound
        }

        let data = try Data(contentsOf: cacheURL)
        let wrapper = try JSONDecoder().decode(GranolaCacheWrapper.self, from: data)
        return wrapper.cache.state
    }

    private func ingestMeeting(_ meeting: GranolaMeeting, token: String, tenantId: String) async throws {
        // Build content from available fields
        var content = "# \(meeting.title)\n\n"
        content += "**Date:** \(meeting.createdAt.formatted())\n"

        if !meeting.attendees.isEmpty {
            content += "**Attendees:** \(meeting.attendees.joined(separator: ", "))\n"
        }

        content += "\n"

        if let summary = meeting.summary, !summary.isEmpty {
            content += "## Summary\n\(summary)\n\n"
        }

        if let notes = meeting.notesMarkdown, !notes.isEmpty {
            content += "## Notes\n\(notes)\n\n"
        } else if let notes = meeting.notesPlain, !notes.isEmpty {
            content += "## Notes\n\(notes)\n\n"
        }

        if let transcript = meeting.transcript, !transcript.isEmpty {
            content += "## Transcript\n\(transcript)\n"
        }

        // Send to ingestApi
        var request = URLRequest(url: URL(string: "https://us-central1-askkaya-47cef.cloudfunctions.net/ingestApi")!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(tenantId, forHTTPHeaderField: "X-Tenant-ID")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let item: [String: Any] = [
            "content": content,
            "title": meeting.title,
            "source": "granola",
            "source_id": meeting.id,
            "client_id": tenantId,
            "source_created_at": ISO8601DateFormatter().string(from: meeting.createdAt),
            "tags": ["granola", "meeting-notes"],
            "metadata": [
                "attendees": meeting.attendees,
                "meeting_id": meeting.id
            ]
        ]

        let body: [String: Any] = ["items": [item]]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, 200..<300 ~= httpResponse.statusCode else {
            throw GranolaError.syncFailed
        }
    }
}

// MARK: - Models

struct GranolaMeeting {
    let id: String
    let title: String
    let createdAt: Date
    let notesMarkdown: String?
    let notesPlain: String?
    let summary: String?
    let transcript: String?
    let attendees: [String]
}

struct SyncResult {
    let synced: Int
    let failed: Int
    let total: Int
}

enum GranolaError: LocalizedError {
    case cacheNotFound
    case syncFailed

    var errorDescription: String? {
        switch self {
        case .cacheNotFound:
            return "Granola cache not found. Is Granola installed?"
        case .syncFailed:
            return "Failed to sync meeting to KB"
        }
    }
}

// MARK: - Cache Parsing

private struct GranolaCacheWrapper: Decodable {
    let cache: CacheContainer
}

private struct CacheContainer: Decodable {
    let state: GranolaCache
}

private struct GranolaCache: Decodable {
    let documents: [String: GranolaDocument]
    let transcripts: [String: [TranscriptSegment]]

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DynamicCodingKey.self)

        // Parse documents
        var docs: [String: GranolaDocument] = [:]
        if let docsContainer = try? container.nestedContainer(keyedBy: DynamicCodingKey.self, forKey: DynamicCodingKey(stringValue: "documents")!) {
            for key in docsContainer.allKeys {
                if let doc = try? docsContainer.decode(GranolaDocument.self, forKey: key) {
                    docs[key.stringValue] = doc
                }
            }
        }
        self.documents = docs

        // Parse transcripts
        var trans: [String: [TranscriptSegment]] = [:]
        if let transContainer = try? container.nestedContainer(keyedBy: DynamicCodingKey.self, forKey: DynamicCodingKey(stringValue: "transcripts")!) {
            for key in transContainer.allKeys {
                if let segments = try? transContainer.decode([TranscriptSegment].self, forKey: key) {
                    trans[key.stringValue] = segments
                }
            }
        }
        self.transcripts = trans
    }
}

private struct DynamicCodingKey: CodingKey {
    var stringValue: String
    var intValue: Int?

    init?(stringValue: String) {
        self.stringValue = stringValue
        self.intValue = nil
    }

    init?(intValue: Int) {
        self.stringValue = String(intValue)
        self.intValue = intValue
    }
}

private struct GranolaDocument: Decodable {
    let title: String?
    let notesMarkdown: String?
    let notesPlain: String?
    let summary: String?
    let createdAt: Date?
    let deletedAt: Date?
    let people: PeopleInfo?

    enum CodingKeys: String, CodingKey {
        case title
        case notesMarkdown = "notes_markdown"
        case notesPlain = "notes_plain"
        case summary
        case createdAt = "created_at"
        case deletedAt = "deleted_at"
        case people
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        title = try? container.decode(String.self, forKey: .title)
        notesMarkdown = try? container.decode(String.self, forKey: .notesMarkdown)
        notesPlain = try? container.decode(String.self, forKey: .notesPlain)
        summary = try? container.decode(String.self, forKey: .summary)
        people = try? container.decode(PeopleInfo.self, forKey: .people)

        // Parse dates - try multiple formats
        func parseDate(_ str: String) -> Date? {
            // Try ISO8601 with fractional seconds
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = iso.date(from: str) { return date }

            // Try without fractional seconds
            iso.formatOptions = [.withInternetDateTime]
            if let date = iso.date(from: str) { return date }

            // Try custom format
            let df = DateFormatter()
            df.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
            df.locale = Locale(identifier: "en_US_POSIX")
            if let date = df.date(from: str) { return date }

            // Try without milliseconds
            df.dateFormat = "yyyy-MM-dd'T'HH:mm:ssZ"
            if let date = df.date(from: str) { return date }

            return nil
        }

        if let dateStr = try? container.decode(String.self, forKey: .createdAt) {
            createdAt = parseDate(dateStr)
        } else {
            createdAt = nil
        }

        if let dateStr = try? container.decode(String.self, forKey: .deletedAt) {
            deletedAt = parseDate(dateStr)
        } else {
            deletedAt = nil
        }
    }
}

private struct PeopleInfo: Decodable {
    let attendees: [Attendee]?
}

private struct Attendee: Decodable {
    let email: String?
    let name: String?
}

private struct TranscriptSegment: Decodable {
    let text: String
}
