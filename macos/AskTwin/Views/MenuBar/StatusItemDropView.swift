import AppKit
import SwiftUI
import UniformTypeIdentifiers

/// Custom view for the status item that accepts file drops
class StatusItemDropView: NSView {
    private var isReceivingDrag = false
    private var iconImageView: NSImageView!
    private var onFilesDropped: (([URL]) -> Void)?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setup()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setup()
    }

    private func setup() {
        // Register for file drops
        registerForDraggedTypes([.fileURL])

        // Create icon image view
        iconImageView = NSImageView(frame: bounds)
        iconImageView.autoresizingMask = [.width, .height]
        if let image = NSImage(systemSymbolName: "person.crop.circle.fill", accessibilityDescription: "AskTwin") {
            image.isTemplate = true
            iconImageView.image = image
        }
        iconImageView.imageScaling = .scaleProportionallyDown
        addSubview(iconImageView)
    }

    func setDropHandler(_ handler: @escaping ([URL]) -> Void) {
        self.onFilesDropped = handler
    }

    // MARK: - Drag & Drop

    override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
        if sender.draggingPasteboard.canReadObject(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) {
            isReceivingDrag = true
            updateAppearance()
            return .copy
        }
        return []
    }

    override func draggingExited(_ sender: NSDraggingInfo?) {
        isReceivingDrag = false
        updateAppearance()
    }

    override func draggingEnded(_ sender: NSDraggingInfo) {
        isReceivingDrag = false
        updateAppearance()
    }

    override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        isReceivingDrag = false
        updateAppearance()

        guard let urls = sender.draggingPasteboard.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL] else {
            return false
        }

        if !urls.isEmpty {
            onFilesDropped?(urls)
            return true
        }

        return false
    }

    private func updateAppearance() {
        if isReceivingDrag {
            // Highlight when dragging over
            iconImageView.contentTintColor = .systemBlue
            layer?.backgroundColor = NSColor.systemBlue.withAlphaComponent(0.2).cgColor
            layer?.cornerRadius = 4
        } else {
            iconImageView.contentTintColor = nil
            layer?.backgroundColor = nil
        }
    }

    override var wantsUpdateLayer: Bool { true }

    override func updateLayer() {
        wantsLayer = true
    }
}

/// Coordinator to handle ingestion from the status item
class StatusItemDropCoordinator {
    static let shared = StatusItemDropCoordinator()

    private init() {}

    func handleDroppedFiles(_ urls: [URL]) {
        Task {
            await ingestFiles(urls)
        }
    }

    @MainActor
    private func ingestFiles(_ urls: [URL]) async {
        let twin = AppState.shared.selectedTwin
        let tenantId = AppState.shared.currentTenantId

        guard let twinId = twin?.twinId, let tenantId = tenantId else {
            showNotification(title: "No Twin Selected", message: "Please select a twin first")
            return
        }

        var successCount = 0
        var failCount = 0

        for url in urls {
            do {
                _ = try await APIClient.shared.ingestDocument(
                    fileURL: url,
                    twinId: twinId,
                    tenantId: tenantId
                )
                successCount += 1
            } catch {
                NSLog("[StatusItemDrop] Ingest failed for \(url.lastPathComponent): \(error)")
                failCount += 1
            }
        }

        if failCount == 0 {
            showNotification(title: "Files Added", message: "Added \(successCount) file\(successCount == 1 ? "" : "s") to KB")
        } else if successCount == 0 {
            showNotification(title: "Ingestion Failed", message: "Failed to add files")
        } else {
            showNotification(title: "Partial Success", message: "Added \(successCount), failed \(failCount)")
        }
    }

    private func showNotification(title: String, message: String) {
        let notification = NSUserNotification()
        notification.title = title
        notification.informativeText = message
        notification.soundName = NSUserNotificationDefaultSoundName
        NSUserNotificationCenter.default.deliver(notification)
    }
}
