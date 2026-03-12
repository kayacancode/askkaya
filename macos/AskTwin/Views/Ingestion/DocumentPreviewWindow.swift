import SwiftUI
import AppKit

/// Window controller for document preview/redaction
class DocumentPreviewWindowController {
    static let shared = DocumentPreviewWindowController()

    private var window: NSWindow?

    private init() {}

    /// Show preview window for documents before ingestion
    func showPreview(for urls: [URL], tenantId: String, completion: @escaping (Int, Int) -> Void) {
        Task {
            let documents = await DocumentLoader.loadDocuments(from: urls)

            guard !documents.isEmpty else {
                await MainActor.run {
                    let alert = NSAlert()
                    alert.messageText = "No Content Found"
                    alert.informativeText = "Could not extract text from the selected files."
                    alert.alertStyle = .warning
                    alert.runModal()
                    completion(0, urls.count)
                }
                return
            }

            await MainActor.run {
                let previewView = DocumentPreviewView(
                    documents: documents,
                    onConfirm: { [weak self] finalDocs in
                        self?.ingestDocuments(finalDocs, tenantId: tenantId, completion: completion)
                    },
                    onCancel: { [weak self] in
                        self?.closeWindow()
                        completion(0, 0)
                    }
                )

                let hostingView = NSHostingView(rootView: previewView)

                let window = NSWindow(
                    contentRect: NSRect(x: 0, y: 0, width: 800, height: 600),
                    styleMask: [.titled, .closable, .resizable, .miniaturizable],
                    backing: .buffered,
                    defer: false
                )
                window.title = "Review Documents"
                window.contentView = hostingView
                window.center()
                window.isReleasedWhenClosed = false

                self.window = window
                window.makeKeyAndOrderFront(nil)
                NSApp.activate(ignoringOtherApps: true)
            }
        }
    }

    private func ingestDocuments(_ documents: [PendingDocument], tenantId: String, completion: @escaping (Int, Int) -> Void) {
        Task {
            var success = 0
            var failed = 0

            do {
                let token = try await AuthService.shared.getValidToken()

                for doc in documents {
                    do {
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

                        let (_, response) = try await URLSession.shared.data(for: request)

                        if let httpResponse = response as? HTTPURLResponse, 200..<300 ~= httpResponse.statusCode {
                            success += 1
                        } else {
                            failed += 1
                        }
                    } catch {
                        NSLog("[DocumentPreview] Failed to ingest \(doc.filename): \(error)")
                        failed += 1
                    }
                }
            } catch {
                failed = documents.count
            }

            await MainActor.run {
                self.closeWindow()

                let alert = NSAlert()
                if failed == 0 {
                    alert.messageText = "Documents Added"
                    alert.informativeText = "Added \(success) document\(success == 1 ? "" : "s") to your knowledge base."
                    alert.alertStyle = .informational
                } else if success == 0 {
                    alert.messageText = "Ingestion Failed"
                    alert.informativeText = "Failed to add documents to knowledge base."
                    alert.alertStyle = .warning
                } else {
                    alert.messageText = "Partial Success"
                    alert.informativeText = "Added \(success), failed \(failed)."
                    alert.alertStyle = .warning
                }
                alert.runModal()

                completion(success, failed)
            }
        }
    }

    private func closeWindow() {
        window?.close()
        window = nil
    }
}
