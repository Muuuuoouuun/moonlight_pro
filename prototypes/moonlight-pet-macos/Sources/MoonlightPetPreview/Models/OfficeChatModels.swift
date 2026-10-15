import Foundation

enum OfficeAgent: String, CaseIterable, Codable, Identifiable, Sendable {
    case eevee, vaporeon, jolteon, flareon, espeon, umbreon, leafeon, glaceon, sylveon
    var id: String { rawValue }
    var metadata: OfficeRoleMetadata { OfficeRoleCatalog.roles[rawValue]! }
    var title: String { metadata.name }
    var role: String { metadata.role }
    var responsibility: String { metadata.responsibility }
    var starters: [String] { metadata.starters }
    var handoff: String { metadata.handoff }

}

enum OfficeChatScope: String, CaseIterable, Codable, Identifiable, Sendable {
    case all, classin, personal
    var id: String { rawValue }
    var title: String {
        switch self {
        case .all: return "전체"
        case .classin: return "회사"
        case .personal: return "개인"
        }
    }
}

struct OfficeChatHistory: Codable, Equatable, Sendable {
    let role: String
    let text: String
}

struct OfficeChatCommand: Encodable, Equatable, Sendable {
    static let contractVersion = "2026-09-22.v3"
    let ownerId: OfficeAgent
    let scope: OfficeChatScope
    let message: String
    let history: [OfficeChatHistory]
    let participants: [OfficeAgent]
    var mode: String { participants.isEmpty ? "chat" : "council" }

    init(ownerId: OfficeAgent, scope: OfficeChatScope, message: String, history: [OfficeChatHistory] = [], participants: [OfficeAgent] = []) {
        self.ownerId = ownerId; self.scope = scope; self.message = message; self.history = history
        self.participants = participants
    }
    private enum CodingKeys: String, CodingKey {
        case ownerId, mode, scope, message, participants, lens, history, includeProjects
    }
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(ownerId, forKey: .ownerId)
        try container.encode(mode, forKey: .mode)
        try container.encode(scope, forKey: .scope)
        try container.encode(message, forKey: .message)
        try container.encode(participants, forKey: .participants)
        try container.encodeNil(forKey: .lens)
        try container.encode(history, forKey: .history)
        try container.encode(false, forKey: .includeProjects)
    }
    func validate() throws {
        guard participants.isEmpty || ((2...3).contains(participants.count)
              && Set(participants).count == participants.count && participants.contains(ownerId)) else {
            throw OfficeChatError.invalidParticipants
        }
        guard Self.validText(message, limit: 6000), history.count <= 8,
              history.allSatisfy({ ["user", "assistant"].contains($0.role) && Self.validText($0.text, limit: 6000) }) else {
            throw OfficeChatError.invalidInput
        }
        // The server measures JSON.stringify after trimming each history item.
        let normalized = history.map { OfficeChatHistory(role: $0.role, text: $0.text.trimmingCharacters(in: .whitespacesAndNewlines)) }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.withoutEscapingSlashes]
        let data = try encoder.encode(normalized)
        guard let text = String(data: data, encoding: .utf8), text.utf16.count <= 20_000,
              try encoder.encode(self).count <= 90_000 else { throw OfficeChatError.invalidInput }
    }
    static func validText(_ text: String, limit: Int) -> Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && text.utf16.count <= limit
    }
}

struct OfficeChatReply: Equatable, Sendable {
    let answer: String
    let nextAction: String
    let contextNote: String
    let contextSource: String
    let logPersisted: Bool
    let runId: String?
    var council: OfficeCouncilResult? = nil
}

enum OfficeChatError: Error, Equatable, LocalizedError {
    case invalidInput, invalidParticipants, invalidResponse, preview, unconfirmed
    var errorDescription: String? {
        switch self {
        case .invalidInput: return "질문은 6,000자 이내로 적어 주세요. 대화가 길어졌다면 새 대화를 시작해 주세요."
        case .invalidParticipants: return "주관을 포함해 서로 다른 담당 2~3명을 선택해 주세요."
        case .invalidResponse: return "담당자의 답변을 확인하지 못했어요. 질문은 보관돼 있어요."
        case .unconfirmed: return "회의 응답을 확인 중이에요. 다시 불러와 결과를 확인해 주세요."
        case .preview: return "Office AI 연결이 아직 준비되지 않았어요. 질문은 그대로 보관돼 있어요."
        }
    }
}
