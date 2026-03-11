import Foundation
import Security

/// Manages authentication state and token lifecycle
actor AuthService {
    static let shared = AuthService()

    private var cachedToken: String?
    private var tokenExpiry: Date?
    private var refreshToken: String?

    private init() {
        loadFromKeychain()
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

        return User(uid: response.userId, email: response.email, displayName: nil)
    }

    func logout() async {
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

    private func loadFromKeychain() {
        cachedToken = KeychainService.load(key: "idToken")
        refreshToken = KeychainService.load(key: "refreshToken")

        if let expiryString = KeychainService.load(key: "tokenExpiry"),
           let expiryInterval = TimeInterval(expiryString) {
            tokenExpiry = Date(timeIntervalSince1970: expiryInterval)
        }
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
