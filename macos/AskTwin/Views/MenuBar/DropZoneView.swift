import SwiftUI
import UniformTypeIdentifiers

/// Drop zone for ingesting files into the KB
struct MenuBarDropZoneView: View {
    @State private var isTargeted = false
    @State private var isIngesting = false
    @State private var statusMessage: String?
    @State private var statusIsError = false

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(
                        isTargeted ? Color.blue : Color.secondary.opacity(0.3),
                        style: StrokeStyle(lineWidth: 2, dash: [6])
                    )
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(isTargeted ? Color.blue.opacity(0.1) : Color.clear)
                    )

                if isIngesting {
                    VStack(spacing: 6) {
                        ProgressView()
                            .scaleEffect(0.8)
                        Text("Ingesting...")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    VStack(spacing: 4) {
                        Image(systemName: "doc.badge.plus")
                            .font(.title2)
                            .foregroundStyle(isTargeted ? .blue : .secondary)
                        Text("Drop files to add to KB")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .frame(height: 60)
            .onDrop(of: [.fileURL], isTargeted: $isTargeted) { providers in
                handleDrop(providers: providers)
                return true
            }

            // Status message
            if let message = statusMessage {
                HStack(spacing: 4) {
                    Image(systemName: statusIsError ? "xmark.circle.fill" : "checkmark.circle.fill")
                        .foregroundColor(statusIsError ? .red : .green)
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(statusIsError ? .red : .secondary)
                }
                .transition(.opacity)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(width: 280)
    }

    private func handleDrop(providers: [NSItemProvider]) {
        isIngesting = true
        statusMessage = nil

        Task {
            var successCount = 0
            var failCount = 0

            // Get current twin and tenant
            let twin = await MainActor.run { AppState.shared.selectedTwin }
            let tenantId = await MainActor.run { AppState.shared.currentTenantId }

            guard let twinId = twin?.twinId, let tenantId = tenantId else {
                await MainActor.run {
                    isIngesting = false
                    statusMessage = "No twin selected"
                    statusIsError = true
                }
                return
            }

            for provider in providers {
                if let url = await loadFileURL(from: provider) {
                    do {
                        _ = try await APIClient.shared.ingestDocument(
                            fileURL: url,
                            twinId: twinId,
                            tenantId: tenantId
                        )
                        successCount += 1
                    } catch {
                        NSLog("[DropZone] Ingest failed: \(error)")
                        failCount += 1
                    }
                }
            }

            await MainActor.run {
                isIngesting = false
                if failCount == 0 {
                    statusMessage = "Added \(successCount) file\(successCount == 1 ? "" : "s")"
                    statusIsError = false
                } else if successCount == 0 {
                    statusMessage = "Failed to add files"
                    statusIsError = true
                } else {
                    statusMessage = "Added \(successCount), failed \(failCount)"
                    statusIsError = true
                }

                // Clear message after delay
                Task {
                    try? await Task.sleep(nanoseconds: 3_000_000_000)
                    await MainActor.run {
                        withAnimation {
                            statusMessage = nil
                        }
                    }
                }
            }
        }
    }

    private func loadFileURL(from provider: NSItemProvider) async -> URL? {
        return await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, error in
                if let data = item as? Data,
                   let url = URL(dataRepresentation: data, relativeTo: nil) {
                    continuation.resume(returning: url)
                } else if let url = item as? URL {
                    continuation.resume(returning: url)
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }
}

/// Granola sync button (placeholder - needs API/CLI support)
struct GranolaSyncButton: View {
    @State private var isSyncing = false
    @State private var statusMessage: String?

    var body: some View {
        HStack {
            Button(action: syncGranola) {
                HStack(spacing: 6) {
                    if isSyncing {
                        ProgressView()
                            .scaleEffect(0.7)
                    } else {
                        Image(systemName: "arrow.triangle.2.circlepath")
                    }
                    Text("Sync Granola Notes")
                        .font(.system(size: 12))
                }
            }
            .buttonStyle(.bordered)
            .disabled(isSyncing)

            if let message = statusMessage {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 4)
        .frame(width: 280, alignment: .leading)
    }

    private func syncGranola() {
        isSyncing = true
        statusMessage = "Coming soon..."

        // TODO: Implement Granola sync when API supports it
        Task {
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            await MainActor.run {
                isSyncing = false
            }
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            await MainActor.run {
                statusMessage = nil
            }
        }
    }
}

#Preview {
    VStack {
        MenuBarDropZoneView()
        GranolaSyncButton()
    }
    .frame(width: 300, height: 200)
}
