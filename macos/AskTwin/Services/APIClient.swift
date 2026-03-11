import Foundation

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
        let request = LoginRequest(email: email, password: password)
        return try await post("/loginApi", body: request)
    }

    func refreshToken(_ refreshToken: String) async throws -> AuthResponse {
        // Uses Firebase Auth REST API
        let url = "https://securetoken.googleapis.com/v1/token?key=\(Config.firebaseAPIKey)"
        let body = ["grant_type": "refresh_token", "refresh_token": refreshToken]

        var request = URLRequest(url: URL(string: url)!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, _) = try await session.data(for: request)
        return try JSONDecoder().decode(AuthResponse.self, from: data)
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

        var request = URLRequest(url: URL(string: "\(baseURL)/ingestApi")!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(tenantId, forHTTPHeaderField: "X-Tenant-ID")

        let boundary = UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()

        // Add file
        let fileData = try Data(contentsOf: fileURL)
        let filename = fileURL.lastPathComponent
        let mimeType = mimeType(for: fileURL)

        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n".data(using: .utf8)!)

        // Add metadata
        let metadata = ["filename": filename, "twinId": twinId]
        let metadataJSON = try JSONEncoder().encode(metadata)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"metadata\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: application/json\r\n\r\n".data(using: .utf8)!)
        body.append(metadataJSON)
        body.append("\r\n".data(using: .utf8)!)

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

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

        return try JSONDecoder().decode(T.self, from: data)
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

struct AuthResponse: Codable {
    let idToken: String
    let refreshToken: String
    let expiresIn: Int
    let userId: String
    let email: String
}

struct MeResponse: Codable {
    let user: User
    let tenants: [Tenant]?
    let memberships: [Membership]?
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

struct Twin: Codable, Identifiable {
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
    let sourceId: String?
    let status: String
    let message: String?
    let chunksCreated: Int?
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
    static let firebaseAPIKey = "AIzaSyD4HV-C_eG8qjJNmw7EQMjDIqH5EFqMFBM"
}
