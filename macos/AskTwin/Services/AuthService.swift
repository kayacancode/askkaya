import Foundation
import Security

/// Manages authentication state and token lifecycle
actor AuthService {
    static let shared = AuthService()

    private var cachedToken: String?
    private var tokenExpiry: Date?
    private var refreshToken: String?

    private init() {
        // Load from keychain synchronously during init
        let stored = Self.loadFromKeychainSync()
        self.cachedToken = stored.token
        self.refreshToken = stored.refresh
        self.tokenExpiry = stored.expiry
    }

    // MARK: - Public API

    var isLoggedIn: Bool {
        get async {
            return refreshToken != nil
        }
    }

    func login(email: String, password: String) async throws -> User {
        let response = try await APIClient.shared.login(email: email, password: password)

        cachedToken = response.idToken
        refreshToken = response.refreshToken
        tokenExpiry = Date().addingTimeInterval(TimeInterval(response.expiresIn - 60))

        saveToKeychain()

        // Also login the bundled CLI so it can make queries
        Task {
            await loginCLI(email: email, password: password)
        }

        return User(uid: response.userId, email: response.email, displayName: nil)
    }

    func signup(email: String, password: String) async throws -> User {
        let response = try await APIClient.shared.signup(email: email, password: password)

        cachedToken = response.idToken
        refreshToken = response.refreshToken
        tokenExpiry = Date().addingTimeInterval(TimeInterval(response.expiresIn - 60))

        saveToKeychain()

        // Also login the bundled CLI
        Task {
            await loginCLI(email: email, password: password)
        }

        return User(uid: response.userId, email: response.email, displayName: nil)
    }

    /// Login the bundled CLI with the same credentials
    private func loginCLI(email: String, password: String) async {
        guard let binaryPath = Bundle.main.path(forResource: "askkaya", ofType: nil) else {
            return
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: binaryPath)
        process.arguments = ["auth", "login", "-e", email, "-p", password]

        // Set HOME so CLI can access keychain
        var env = ProcessInfo.processInfo.environment
        env["HOME"] = FileManager.default.homeDirectoryForCurrentUser.path
        process.environment = env

        do {
            try process.run()
            process.waitUntilExit()
            NSLog("[AuthService] CLI login completed with exit code: \(process.terminationStatus)")
        } catch {
            NSLog("[AuthService] CLI login failed: \(error)")
        }
    }

    func logout() {
        cachedToken = nil
        refreshToken = nil
        tokenExpiry = nil
        clearKeychain()
    }

    func getValidToken() async throws -> String {
        // Check if we have a valid cached token
        if let token = cachedToken, let expiry = tokenExpiry, Date() < expiry {
            return token
        }

        // Try to refresh
        guard let refresh = refreshToken else {
            throw APIError.unauthorized
        }

        let response = try await APIClient.shared.refreshToken(refresh)

        cachedToken = response.idToken
        refreshToken = response.refreshToken
        tokenExpiry = Date().addingTimeInterval(TimeInterval(response.expiresIn - 60))

        saveToKeychain()

        return response.idToken
    }

    // MARK: - Keychain

    private static func loadFromKeychainSync() -> (token: String?, refresh: String?, expiry: Date?) {
        let token = KeychainService.load(key: "idToken")
        let refresh = KeychainService.load(key: "refreshToken")

        var expiry: Date? = nil
        if let expiryString = KeychainService.load(key: "tokenExpiry"),
           let expiryInterval = TimeInterval(expiryString) {
            expiry = Date(timeIntervalSince1970: expiryInterval)
        }

        return (token, refresh, expiry)
    }

    private func saveToKeychain() {
        if let token = cachedToken {
            KeychainService.save(key: "idToken", value: token)
        }
        if let refresh = refreshToken {
            KeychainService.save(key: "refreshToken", value: refresh)
        }
        if let expiry = tokenExpiry {
            KeychainService.save(key: "tokenExpiry", value: String(expiry.timeIntervalSince1970))
        }
    }

    private func clearKeychain() {
        KeychainService.delete(key: "idToken")
        KeychainService.delete(key: "refreshToken")
        KeychainService.delete(key: "tokenExpiry")
    }
}

// MARK: - Keychain Service

enum KeychainService {
    private static let service = "com.askkaya.asktwin"

    static func save(key: String, value: String) {
        guard let data = value.data(using: .utf8) else { return }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]

        // Delete existing item first
        SecItemDelete(query as CFDictionary)

        // Add new item
        var newQuery = query
        newQuery[kSecValueData as String] = data

        SecItemAdd(newQuery as CFDictionary, nil)
    }

    static func load(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess,
              let data = result as? Data,
              let string = String(data: data, encoding: .utf8) else {
            return nil
        }

        return string
    }

    static func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]

        SecItemDelete(query as CFDictionary)
    }
}
