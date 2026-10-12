import Foundation

struct OfficeCouncilResult: Equatable, Sendable {
    let recommendation: String
    let evidence: [String]
    let dissent: [String]
    let discussion: OfficeDiscussion
}

struct OfficeDiscussion: Codable, Equatable, Sendable {
    let version: String
    let settings: Settings
    let turns: [OfficeDiscussionTurn]
    let modelCalls: Int

    struct Settings: Codable, Equatable, Sendable {
        let profile: String
        let challenge: Int
        let depth: Int
        let warmth: Int
        let convergence: Int
        let influence: [String: Int]
    }

    func validate(participants: [OfficeAgent]) throws {
        let weights = Dictionary(uniqueKeysWithValues: participants.map { ($0.rawValue, 1) })
        let expected = Settings(profile: "balanced", challenge: 2, depth: 2, warmth: 2, convergence: 2, influence: weights)
        guard version == "2026-09-22.v1", settings == expected,
              turns.count == participants.count * 2, modelCalls == turns.count + 1 else { throw OfficeChatError.invalidResponse }
        for (index, turn) in turns.enumerated() {
            let round = index < participants.count ? "position" : "response"
            guard turn.ownerId == participants[index % participants.count], turn.round == round,
                  Self.text(turn.position, 600), turn.evidence.count <= 2,
                  turn.evidence.allSatisfy({ Self.text($0, 300) }),
                  Self.text(turn.objection, 400, empty: true), Self.text(turn.revisionCondition, 300),
                  Set(turn.replyTo).count == turn.replyTo.count,
                  turn.replyTo.allSatisfy({ $0 != turn.ownerId && participants.contains($0) }),
                  Self.text(turn.changeReason, 400, empty: round == "position"),
                  round == "position" ? (!turn.changed && turn.replyTo.isEmpty) : !turn.replyTo.isEmpty
            else { throw OfficeChatError.invalidResponse }
        }
        let encoder = JSONEncoder(); encoder.outputFormatting = [.withoutEscapingSlashes]
        guard try encoder.encode(self).count <= 18_000 else { throw OfficeChatError.invalidResponse }
    }

    private static func text(_ value: String, _ limit: Int, empty: Bool = false) -> Bool {
        value.utf16.count <= limit && !value.contains("\0")
            && (empty || !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }
}

struct OfficeDiscussionTurn: Codable, Equatable, Sendable {
    let ownerId: OfficeAgent
    let round: String
    let position: String
    let evidence: [String]
    let objection: String
    let revisionCondition: String
    let changed: Bool
    let replyTo: [OfficeAgent]
    let changeReason: String
}
