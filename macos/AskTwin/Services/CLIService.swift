import Foundation

/// Service that calls the bundled askkaya CLI binary
actor CLIService {
    static let shared = CLIService()

    private init() {}

    /// Path to the bundled CLI binary
    private var cliBinaryPath: String? {
        Bundle.main.path(forResource: "askkaya", ofType: nil)
    }

    /// Ask a question using the CLI
    func ask(question: String, target: String? = nil) async throws -> CLIAskResponse {
        guard let binaryPath = cliBinaryPath else {
            throw CLIError.binaryNotFound
        }

        // Build command arguments - CLI uses "query" command
        let arguments = ["query", question]

        // Run the CLI
        var result = try await runCLI(binaryPath: binaryPath, arguments: arguments)

        // If not logged in, try to login with stored credentials and retry
        if result.output.contains("not logged in") || result.errorOutput.contains("not logged in") {
            let loginSuccess = try await ensureLoggedIn(binaryPath: binaryPath)
            if loginSuccess {
                result = try await runCLI(binaryPath: binaryPath, arguments: arguments)
            }
        }

        // Parse the output
        return parseAskResponse(result)
    }

    /// Ensure CLI is logged in, using stored app credentials
    private func ensureLoggedIn(binaryPath: String) async throws -> Bool {
        // Get credentials from keychain (same ones the app uses)
        guard let email = KeychainService.load(key: "userEmail"),
              let password = KeychainService.load(key: "userPassword") else {
            // No stored credentials - user needs to login via app
            throw CLIError.notSupported("Please login through the app first")
        }

        let loginArgs = ["auth", "login", "-e", email, "-p", password]
        let result = try await runCLI(binaryPath: binaryPath, arguments: loginArgs)

        return result.exitCode == 0
    }

    /// Ingest a file using the CLI
    func ingest(filePath: String) async throws -> CLIIngestResponse {
        guard let binaryPath = cliBinaryPath else {
            throw CLIError.binaryNotFound
        }

        let arguments = ["ingest", filePath]
        let result = try await runCLI(binaryPath: binaryPath, arguments: arguments)

        return CLIIngestResponse(success: result.exitCode == 0, message: result.output)
    }

    /// List available twins
    func listTwins() async throws -> [CLITwin] {
        guard let binaryPath = cliBinaryPath else {
            throw CLIError.binaryNotFound
        }

        let arguments = ["twin", "list", "--json"]
        let result = try await runCLI(binaryPath: binaryPath, arguments: arguments)

        // Try to parse JSON output
        if let data = result.output.data(using: .utf8),
           let twins = try? JSONDecoder().decode([CLITwin].self, from: data) {
            return twins
        }

        // Fallback: parse text output
        return parseTextTwinList(result.output)
    }

    /// Check if user is logged in
    func isLoggedIn() async -> Bool {
        guard let binaryPath = cliBinaryPath else {
            return false
        }

        do {
            let result = try await runCLI(binaryPath: binaryPath, arguments: ["me"])
            return result.exitCode == 0 && !result.output.contains("not logged in")
        } catch {
            return false
        }
    }

    /// Login with email and password
    func login(email: String, password: String) async throws {
        guard let binaryPath = cliBinaryPath else {
            throw CLIError.binaryNotFound
        }

        // The CLI login command reads password interactively, so we need to handle this differently
        // For now, we'll use the API directly for login and let CLI use the stored credentials
        throw CLIError.notSupported("CLI login requires interactive input. Use the API login.")
    }

    // MARK: - Private Helpers

    private func runCLI(binaryPath: String, arguments: [String]) async throws -> CLIResult {
        return try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let process = Process()
                process.executableURL = URL(fileURLWithPath: binaryPath)
                process.arguments = arguments

                // Set up environment - inherit user's home for keychain access
                var env = ProcessInfo.processInfo.environment
                env["HOME"] = FileManager.default.homeDirectoryForCurrentUser.path
                process.environment = env

                let outputPipe = Pipe()
                let errorPipe = Pipe()
                process.standardOutput = outputPipe
                process.standardError = errorPipe

                do {
                    try process.run()
                    process.waitUntilExit()

                    let outputData = outputPipe.fileHandleForReading.readDataToEndOfFile()
                    let errorData = errorPipe.fileHandleForReading.readDataToEndOfFile()

                    let output = String(data: outputData, encoding: .utf8) ?? ""
                    let errorOutput = String(data: errorData, encoding: .utf8) ?? ""

                    let result = CLIResult(
                        output: output,
                        errorOutput: errorOutput,
                        exitCode: process.terminationStatus
                    )

                    continuation.resume(returning: result)
                } catch {
                    continuation.resume(throwing: CLIError.executionFailed(error.localizedDescription))
                }
            }
        }
    }

    private func parseAskResponse(_ result: CLIResult) -> CLIAskResponse {
        if result.exitCode != 0 {
            return CLIAskResponse(
                answer: result.errorOutput.isEmpty ? result.output : result.errorOutput,
                confidence: 0,
                escalated: true,
                sources: []
            )
        }

        // The CLI outputs the answer directly
        // Look for confidence and source markers if present
        let output = result.output.trimmingCharacters(in: .whitespacesAndNewlines)

        // Simple parsing - the CLI might output structured info later
        return CLIAskResponse(
            answer: output,
            confidence: 1.0,
            escalated: false,
            sources: []
        )
    }

    private func parseTextTwinList(_ output: String) -> [CLITwin] {
        // Parse text output like:
        // • kaya (person) - Kaya
        // • kayarjones901-org (organization) - kayarjones901
        var twins: [CLITwin] = []

        let lines = output.components(separatedBy: .newlines)
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("•") || trimmed.hasPrefix("-") {
                // Extract slug, type, name from the line
                // Format: "• slug (type) - name" or similar
                if let match = trimmed.range(of: #"(\w[\w-]*)\s*\((\w+)\)\s*[-–]\s*(.+)"#, options: .regularExpression) {
                    let matchStr = String(trimmed[match])
                    // Simple extraction
                    let parts = trimmed.dropFirst(2).components(separatedBy: "(")
                    if parts.count >= 2 {
                        let slug = parts[0].trimmingCharacters(in: .whitespaces)
                        let rest = parts[1].components(separatedBy: ")")
                        if rest.count >= 2 {
                            let type = rest[0]
                            let name = rest[1].replacingOccurrences(of: "-", with: "").trimmingCharacters(in: .whitespaces)
                            twins.append(CLITwin(slug: slug, name: name, type: type))
                        }
                    }
                }
            }
        }

        return twins
    }
}

// MARK: - Types

struct CLIResult {
    let output: String
    let errorOutput: String
    let exitCode: Int32
}

struct CLIAskResponse {
    let answer: String
    let confidence: Double
    let escalated: Bool
    let sources: [String]
}

struct CLIIngestResponse {
    let success: Bool
    let message: String
}

struct CLITwin: Codable {
    let slug: String
    let name: String
    let type: String
}

enum CLIError: LocalizedError {
    case binaryNotFound
    case executionFailed(String)
    case notSupported(String)

    var errorDescription: String? {
        switch self {
        case .binaryNotFound:
            return "CLI binary not found in app bundle"
        case .executionFailed(let message):
            return "CLI execution failed: \(message)"
        case .notSupported(let message):
            return message
        }
    }
}
