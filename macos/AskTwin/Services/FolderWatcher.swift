import Foundation
import UserNotifications

/// Watches a folder for new files and triggers ingestion
class FolderWatcher {
    static let shared = FolderWatcher()

    private var source: DispatchSourceFileSystemObject?
    private var fileDescriptor: Int32 = -1
    private var watchedPath: String?
    private var knownFiles: Set<String> = []

    private init() {}

    func startWatching(path: String) {
        stopWatching()

        watchedPath = path
        fileDescriptor = open(path, O_EVTONLY)

        guard fileDescriptor >= 0 else {
            print("Failed to open directory for watching: \(path)")
            return
        }

        source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fileDescriptor,
            eventMask: .write,
            queue: .global()
        )

        source?.setEventHandler { [weak self] in
            self?.handleFileSystemEvent()
        }

        source?.setCancelHandler { [weak self] in
            if let fd = self?.fileDescriptor, fd >= 0 {
                close(fd)
            }
            self?.fileDescriptor = -1
        }

        // Initialize known files
        if let contents = try? FileManager.default.contentsOfDirectory(atPath: path) {
            knownFiles = Set(contents)
        }

        source?.resume()
        print("Started watching: \(path)")
    }

    func stopWatching() {
        source?.cancel()
        source = nil
    }

    private func handleFileSystemEvent() {
        guard let path = watchedPath else { return }

        do {
            let currentFiles = Set(try FileManager.default.contentsOfDirectory(atPath: path))
            let newFiles = currentFiles.subtracting(knownFiles)

            for filename in newFiles {
                // Skip hidden files and partial downloads
                guard !filename.hasPrefix("."),
                      !filename.hasSuffix(".download"),
                      !filename.hasSuffix(".part") else {
                    continue
                }

                let filePath = (path as NSString).appendingPathComponent(filename)

                // Wait a moment for file to finish writing
                DispatchQueue.global().asyncAfter(deadline: .now() + 1) { [weak self] in
                    self?.ingestFile(at: filePath, filename: filename)
                }
            }

            knownFiles = currentFiles
        } catch {
            print("Error reading directory: \(error)")
        }
    }

    private func ingestFile(at path: String, filename: String) {
        let fileURL = URL(fileURLWithPath: path)

        // Check if supported file type
        let supportedExtensions = ["pdf", "md", "txt", "docx", "html"]
        guard supportedExtensions.contains(fileURL.pathExtension.lowercased()) else {
            print("Skipping unsupported file: \(filename)")
            return
        }

        showNotification(
            title: "Ingesting Document",
            body: "Processing \(filename)..."
        )

        Task {
            do {
                // Get current twin and tenant
                let appState = await AppState.shared
                guard let tenantId = await appState.currentTenantId,
                      let twin = await appState.selectedTwin else {
                    throw IngestionError.noTwinSelected
                }

                let response = try await APIClient.shared.ingestDocument(
                    fileURL: fileURL,
                    twinId: twin.twinId,
                    tenantId: tenantId
                )

                // Move to processed folder
                await moveToProcessed(fileURL: fileURL)

                await MainActor.run {
                    showNotification(
                        title: "Document Added",
                        body: "\(filename) added to \(twin.name)'s knowledge base"
                    )
                }

                print("Successfully ingested: \(filename), sourceId: \(response.sourceId ?? "unknown")")
            } catch {
                await moveToFailed(fileURL: fileURL)

                await MainActor.run {
                    showNotification(
                        title: "Ingestion Failed",
                        body: "Failed to process \(filename): \(error.localizedDescription)"
                    )
                }

                print("Failed to ingest \(filename): \(error)")
            }
        }
    }

    private func moveToProcessed(fileURL: URL) async {
        let processedDir = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("AskTwin")
            .appendingPathComponent("Processed")

        let destination = processedDir.appendingPathComponent(fileURL.lastPathComponent)

        do {
            // Remove existing file if present
            try? FileManager.default.removeItem(at: destination)
            try FileManager.default.moveItem(at: fileURL, to: destination)
        } catch {
            print("Failed to move file to Processed: \(error)")
        }
    }

    private func moveToFailed(fileURL: URL) async {
        let failedDir = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("AskTwin")
            .appendingPathComponent("Failed")

        try? FileManager.default.createDirectory(at: failedDir, withIntermediateDirectories: true)

        let destination = failedDir.appendingPathComponent(fileURL.lastPathComponent)

        do {
            try? FileManager.default.removeItem(at: destination)
            try FileManager.default.moveItem(at: fileURL, to: destination)
        } catch {
            print("Failed to move file to Failed: \(error)")
        }
    }

    private func showNotification(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil
        )

        UNUserNotificationCenter.current().add(request)
    }
}

enum IngestionError: LocalizedError {
    case noTwinSelected
    case uploadFailed(String)

    var errorDescription: String? {
        switch self {
        case .noTwinSelected:
            return "No twin selected for ingestion"
        case .uploadFailed(let message):
            return "Upload failed: \(message)"
        }
    }
}
