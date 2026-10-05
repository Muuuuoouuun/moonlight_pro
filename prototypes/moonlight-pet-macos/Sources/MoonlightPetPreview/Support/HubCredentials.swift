import Foundation
import Security

struct HubCredentials: Codable, Equatable, Sendable {
    let username: String
    let password: String
}

protocol HubCredentialStoring: Sendable {
    func load(origin: String) throws -> HubCredentials?
    func save(_ credentials: HubCredentials, origin: String) throws
    func remove(origin: String) throws
}

/// The login keychain protects this app's credentials. Each canonical Hub origin
/// has its own item; passwords never enter UserDefaults, files, URLs or logs.
struct KeychainHubCredentialStore: HubCredentialStoring {
    let service: String

    init(service: String = "app.moonlight.pet-preview.hub-login") { self.service = service }

    private func query(origin: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: origin,
         kSecAttrSynchronizable as String: false]
    }

    func load(origin: String) throws -> HubCredentials? {
        var query = query(origin: origin)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data,
              let credentials = try? JSONDecoder().decode(HubCredentials.self, from: data),
              !credentials.username.isEmpty, !credentials.password.isEmpty else {
            throw HubTransportError.credentialStorage
        }
        return credentials
    }

    func save(_ credentials: HubCredentials, origin: String) throws {
        let data = try JSONEncoder().encode(credentials)
        let query = query(origin: origin)
        let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var item = query
            item[kSecValueData as String] = data
            item[kSecAttrLabel as String] = "Moonlight 펫 자동 로그인 · \(origin)"
            guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { throw HubTransportError.credentialStorage }
        } else if status != errSecSuccess { throw HubTransportError.credentialStorage }
    }

    func remove(origin: String) throws {
        let status = SecItemDelete(query(origin: origin) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw HubTransportError.credentialStorage }
    }
}
