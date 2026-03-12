import Foundation
import PDFKit

/// API Client for AskTwin backend
actor APIClient {
    static let shared = APIClient()

    private let baseURL = "https://us-central1-askkaya-47cef.cloudfunctions.net"
    private let session: URLSession

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        self.session = URLSession(configuration: config)
    }

    // MARK: - Authentication

    func login(email: String, password: String) async throws -> AuthResponse {
        // Use Firebase Auth REST API directly
        let url = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=\(Config.firebaseAPIKey)"

        let body = [
            "email": email,
            "password": password,
            "returnSecureToken": true
        ] as [String: Any]

        var request = URLRequest(url: URL(string: url)!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode != 200 {
            // Parse Firebase error
            if let errorJson = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let error = errorJson["error"] as? [String: Any],
               let message = error["message"] as? String {
                throw APIError.httpError(statusCode: httpResponse.statusCode, data: message.data(using: .utf8) ?? data)
            }
            throw APIError.httpError(statusCode: httpResponse.statusCode, data: data)
        }

        // Parse Firebase Auth response
        let firebaseResponse = try JSONDecoder().decode(FirebaseAuthResponse.self, from: data)

        return AuthResponse(
            idToken: firebaseResponse.idToken,
            refreshToken: firebaseResponse.refreshToken,
            expiresIn: Int(firebaseResponse.expiresIn) ?? 3600,
            userId: firebaseResponse.localId,
            email: firebaseResponse.email
        )
    }

    func signup(email: String, password: String) async throws -> AuthResponse {
        // Use Firebase Auth REST API for signup
        let url = "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=\(Config.firebaseAPIKey)"

        let body = [
            "email": email,
            "password": password,
            "returnSecureToken": true
        ] as [String: Any]

        var request = URLRequest(url: URL(string: url)!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode != 200 {
            // Parse Firebase error
            if let errorJson = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let error = errorJson["error"] as? [String: Any],
               let message = error["message"] as? String {
                // Convert Firebase error codes to friendly messages
                let friendlyMessage: String
                switch message {
                case "EMAIL_EXISTS":
                    friendlyMessage = "An account with this email already exists"
                case "WEAK_PASSWORD : Password should be at least 6 characters":
                    friendlyMessage = "Password must be at least 6 characters"
                case "INVALID_EMAIL":
                    friendlyMessage = "Please enter a valid email address"
                default:
                    friendlyMessage = message
                }
                throw APIError.httpError(statusCode: httpResponse.statusCode, data: friendlyMessage.data(using: .utf8) ?? data)
            }
            throw APIError.httpError(statusCode: httpResponse.statusCode, data: data)
        }

        let firebaseResponse = try JSONDecoder().decode(FirebaseAuthResponse.self, from: data)

        return AuthResponse(
            idToken: firebaseResponse.idToken,
            refreshToken: firebaseResponse.refreshToken,
            expiresIn: Int(firebaseResponse.expiresIn) ?? 3600,
            userId: firebaseResponse.localId,
            email: firebaseResponse.email
        )
    }

    func refreshToken(_ refreshToken: String) async throws -> AuthResponse {
        // Uses Firebase Auth REST API - returns different structure than login
        let url = "https://securetoken.googleapis.com/v1/token?key=\(Config.firebaseAPIKey)"
        let body = ["grant_type": "refresh_token", "refresh_token": refreshToken]

        var request = URLRequest(url: URL(string: url)!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        // Form encode the body (Firebase expects form data, not JSON)
        let formBody = body.map { "\($0.key)=\($0.value)" }.joined(separator: "&")
        request.httpBody = formBody.data(using: .utf8)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw APIError.unauthorized
        }

        // Parse the refresh token response (snake_case keys)
        let refreshResponse = try JSONDecoder().decode(FirebaseRefreshResponse.self, from: data)

        return AuthResponse(
            idToken: refreshResponse.id_token,
            refreshToken: refreshResponse.refresh_token,
            expiresIn: Int(refreshResponse.expires_in) ?? 3600,
            userId: refreshResponse.user_id,
            email: ""  // Refresh response doesn't include email
        )
    }

    func getMe() async throws -> MeResponse {
        return try await get("/meApiV2")
    }

    // MARK: - Twins

    func listTwins(tenantId: String) async throws -> TwinsResponse {
        return try await get("/twinsApi", tenantId: tenantId)
    }

    func getTwin(id: String, tenantId: String) async throws -> Twin {
        return try await get("/twinsApi/\(id)", tenantId: tenantId)
    }

    // MARK: - Ask

    func ask(question: String, target: String? = nil, tenantId: String, image: Data? = nil) async throws -> AskResponse {
        var request = AskRequest(question: question, target: target)

        if let imageData = image {
            request.image = ImageData(
                data: imageData.base64EncodedString(),
                mediaType: "image/png"
            )
        }

        return try await post("/askApi", body: request, tenantId: tenantId)
    }

    // MARK: - Ingestion

    func ingestDocument(
        fileURL: URL,
        twinId: String,
        tenantId: String
    ) async throws -> IngestResponse {
        let token = try await AuthService.shared.getValidToken()

        let filename = fileURL.lastPathComponent
        let fileExtension = fileURL.pathExtension.lowercased()

        // Extract text content based on file type
        let content: String
        if fileExtension == "pdf" {
            // Use PDFKit to extract text from PDF
            guard let pdfDocument = PDFDocument(url: fileURL) else {
                throw APIError.invalidResponse
            }
            var extractedText = ""
            for pageIndex in 0..<pdfDocument.pageCount {
                if let page = pdfDocument.page(at: pageIndex),
                   let pageText = page.string {
                    extractedText += pageText + "\n\n"
                }
            }
            guard !extractedText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                throw APIError.httpError(statusCode: 400, data: "PDF contains no extractable text".data(using: .utf8)!)
            }
            content = extractedText.trimmingCharacters(in: .whitespacesAndNewlines)
        } else {
            // Text files - read as UTF-8
            let fileData = try Data(contentsOf: fileURL)
            guard let textContent = String(data: fileData, encoding: .utf8) else {
                throw APIError.invalidResponse
            }
            content = textContent
        }

        var request = URLRequest(url: URL(string: "\(baseURL)/ingestApi")!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(tenantId, forHTTPHeaderField: "X-Tenant-ID")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let item: [String: Any] = [
            "content": content,
            "title": filename,
            "source": "file",
            "client_id": tenantId
        ]

        let body: [String: Any] = ["items": [item]]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard 200..<300 ~= httpResponse.statusCode else {
            throw APIError.httpError(statusCode: httpResponse.statusCode, data: data)
        }

        return try JSONDecoder().decode(IngestResponse.self, from: data)
    }

    // MARK: - Private Helpers

    private func get<T: Decodable>(_ path: String, tenantId: String? = nil) async throws -> T {
        let token = try await AuthService.shared.getValidToken()

        var request = URLRequest(url: URL(string: "\(baseURL)\(path)")!)
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        if let tenantId = tenantId {
            request.setValue(tenantId, forHTTPHeaderField: "X-Tenant-ID")
        }

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard 200..<300 ~= httpResponse.statusCode else {
            throw APIError.httpError(statusCode: httpResponse.statusCode, data: data)
        }

        return try JSONDecoder().decode(T.self, from: data)
    }

    private func post<T: Decodable, B: Encodable>(
        _ path: String,
        body: B,
        tenantId: String? = nil
    ) async throws -> T {
        let token = try await AuthService.shared.getValidToken()

        var request = URLRequest(url: URL(string: "\(baseURL)\(path)")!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let tenantId = tenantId {
            request.setValue(tenantId, forHTTPHeaderField: "X-Tenant-ID")
        }

        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard 200..<300 ~= httpResponse.statusCode else {
            throw APIError.httpError(statusCode: httpResponse.statusCode, data: data)
        }

        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            // Log the raw response for debugging
            if let jsonStr = String(data: data, encoding: .utf8) {
                NSLog("[APIClient] POST decode error. Response: %@", jsonStr.prefix(1000).description)
                NSLog("[APIClient] Decode error: %@", String(describing: error))
            }
            throw error
        }
    }

    private func mimeType(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "pdf": return "application/pdf"
        case "md": return "text/markdown"
        case "txt": return "text/plain"
        case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        case "html": return "text/html"
        default: return "application/octet-stream"
        }
    }
}

// MARK: - Request/Response Types

struct LoginRequest: Codable {
    let email: String
    let password: String
}

struct FirebaseAuthResponse: Codable {
    let idToken: String
    let refreshToken: String
    let expiresIn: String
    let localId: String
    let email: String
}

struct FirebaseRefreshResponse: Codable {
    let id_token: String
    let refresh_token: String
    let expires_in: String
    let user_id: String
    let token_type: String
    let project_id: String
}

struct AuthResponse: Codable {
    let idToken: String
    let refreshToken: String
    let expiresIn: Int
    let userId: String
    let email: String
}

struct MeResponse: Codable {
    let userId: String
    let email: String?
    let clientId: String?
    let defaultTenantId: String?
    let memberships: [Membership]?
    let tenants: [Tenant]?
    let role: String?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case email
        case clientId = "client_id"
        case defaultTenantId = "default_tenant_id"
        case memberships, tenants, role
    }

    /// Create User object from response fields
    var user: User {
        User(uid: userId, email: email ?? "", displayName: nil)
    }
}

struct User: Codable {
    let uid: String
    let email: String
    let displayName: String?
}

struct Tenant: Codable {
    let id: String
    let name: String
    let slug: String
}

struct Membership: Codable {
    let tenantId: String
    let role: String
    let teamIds: [String]?
}

struct TwinsResponse: Codable {
    let twins: [Twin]
}

struct Twin: Codable, Identifiable, Hashable {
    let twinId: String
    let tenantId: String
    let type: String
    let name: String
    let slug: String
    let visibility: String
    let expertiseAreas: [String]
    let ownerUid: String?
    let description: String?

    var id: String { twinId }

    var icon: String {
        switch type {
        case "person": return "person.fill"
        case "team": return "person.3.fill"
        case "organization": return "building.2.fill"
        default: return "questionmark.circle"
        }
    }
}

struct AskRequest: Codable {
    let question: String
    let target: String?
    var image: ImageData?
    let includeTeamContext: Bool?

    init(question: String, target: String? = nil, image: ImageData? = nil) {
        self.question = question
        self.target = target
        self.image = image
        self.includeTeamContext = nil
    }
}

struct ImageData: Codable {
    let data: String
    let mediaType: String
}

struct AskResponse: Codable {
    let targetTwin: TwinInfo
    let answer: String
    let confidence: Double
    let sources: [Source]
    let escalated: Bool
    let expertiseAreas: [String]?
}

struct TwinInfo: Codable {
    let id: String
    let name: String
    let type: String
}

struct Source: Codable {
    let sourceId: String
    let title: String
    let sourceType: String
}

struct IngestResponse: Codable {
    let total: Int
    let created: Int
    let updated: Int
    let skipped: Int
    let failed: Int
    let results: [IngestResultItem]?
}

struct IngestResultItem: Codable {
    let success: Bool
    let articleId: String?
    let action: String?
    let error: String?

    enum CodingKeys: String, CodingKey {
        case success
        case articleId = "article_id"
        case action
        case error
    }
}

// MARK: - Errors

enum APIError: LocalizedError {
    case invalidResponse
    case httpError(statusCode: Int, data: Data)
    case unauthorized
    case notFound

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid response from server"
        case .httpError(let code, let data):
            if let message = try? JSONDecoder().decode([String: String].self, from: data)["error"] {
                return "HTTP \(code): \(message)"
            }
            return "HTTP error: \(code)"
        case .unauthorized:
            return "Authentication required"
        case .notFound:
            return "Resource not found"
        }
    }
}

// MARK: - Config

enum Config {
    static let firebaseAPIKey = "AIzaSyB73ewGKfrvzmYfM-YdAxhsWRslVxjv0ic"
}
