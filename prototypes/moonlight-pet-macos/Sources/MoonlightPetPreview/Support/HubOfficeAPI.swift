import Foundation

protocol HubOfficeServing: Sendable {
    func chat(_ command: OfficeChatCommand) async throws -> OfficeChatReply
}

extension HubAPI: HubOfficeServing {
    func chat(_ command: OfficeChatCommand) async throws -> OfficeChatReply {
        try command.validate()
        let body = try JSONEncoder().encode(command)
        // This generation endpoint has no idempotency key or request receipt.
        // A manual retry is a new model call; never replay automatically here.
        let response = try await transport.request(path: "/api/hub/office/chat", method: "POST", body: body)
        if response.isPreview { throw OfficeChatError.preview }
        guard response.status == "generated", response.source != "error" else { throw OfficeChatError.invalidResponse }
        do {
            let wire = try JSONDecoder().decode(OfficeChatResponse.self, from: response.data)
            guard wire.status == "generated", wire.version == OfficeChatCommand.contractVersion,
                  wire.ownerId == command.ownerId.rawValue, wire.scope == command.scope.rawValue,
                  wire.mode == command.mode, wire.simulation == (command.mode == "council"),
                  wire.participants == command.participants.map(\.rawValue),
                  !wire.businessWrites, OfficeChatCommand.validText(wire.answer, limit: 10_000),
                  OfficeChatCommand.validText(wire.nextAction, limit: 1000),
                  wire.context.scope == command.scope.rawValue,
                  wire.context.source == "provided", wire.context.projects.isEmpty,
                  OfficeChatCommand.validText(wire.context.note, limit: 1000) else { throw OfficeChatError.invalidResponse }
            var council: OfficeCouncilResult?
            if command.mode == "council" {
                guard let recommendation = wire.recommendation, let evidence = wire.evidence,
                      let dissent = wire.dissent, let discussion = wire.discussion,
                      OfficeChatCommand.validText(recommendation, limit: 2000),
                      evidence.count <= 5, dissent.count <= 5,
                      (evidence + dissent).allSatisfy({ OfficeChatCommand.validText($0, limit: 1000) })
                else { throw OfficeChatError.invalidResponse }
                try discussion.validate(participants: command.participants)
                council = OfficeCouncilResult(recommendation: recommendation, evidence: evidence, dissent: dissent, discussion: discussion)
            }
            let runId = wire.log.runId
            if wire.log.persisted {
                guard let runId, let uuid = UUID(uuidString: runId), runId.count == 36,
                      uuid.uuidString.lowercased() == runId.lowercased() else { throw OfficeChatError.invalidResponse }
            } else if runId != nil { throw OfficeChatError.invalidResponse }
            return OfficeChatReply(answer: wire.answer, nextAction: wire.nextAction, contextNote: wire.context.note,
                                   contextSource: wire.context.source, logPersisted: wire.log.persisted, runId: runId?.lowercased(), council: council)
        } catch { throw OfficeChatError.invalidResponse }
    }
}

private struct OfficeChatResponse: Decodable {
    let status: String
    let version: String
    let ownerId: String
    let scope: String
    let mode: String
    let simulation: Bool
    let participants: [String]
    let answer: String
    let nextAction: String
    let context: Context
    let log: Log
    let businessWrites: Bool
    let recommendation: String?
    let evidence: [String]?
    let dissent: [String]?
    let discussion: OfficeDiscussion?
    struct Context: Decodable {
        let source: String
        let scope: String
        let projects: [HubJSON]
        let note: String
    }
    struct Log: Decodable { let persisted: Bool; let runId: String? }
    private enum CodingKeys: String, CodingKey {
        case status, version, ownerId, scope, mode, simulation, participants, answer, nextAction, context, log, businessWrites, lens
        case recommendation, evidence, dissent, discussion
    }
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        // Individual chat must not be mislabeled Council output or a Legend lens.
        mode = try container.decode(String.self, forKey: .mode)
        guard container.contains(.lens), try container.decodeNil(forKey: .lens),
              mode == "council" || ![CodingKeys.recommendation, .evidence, .dissent, .discussion].contains(where: { container.contains($0) }) else {
            throw OfficeChatError.invalidResponse
        }
        status = try container.decode(String.self, forKey: .status)
        version = try container.decode(String.self, forKey: .version)
        ownerId = try container.decode(String.self, forKey: .ownerId)
        scope = try container.decode(String.self, forKey: .scope)
        recommendation = try container.decodeIfPresent(String.self, forKey: .recommendation)
        evidence = try container.decodeIfPresent([String].self, forKey: .evidence)
        dissent = try container.decodeIfPresent([String].self, forKey: .dissent)
        discussion = try container.decodeIfPresent(OfficeDiscussion.self, forKey: .discussion)
        simulation = try container.decode(Bool.self, forKey: .simulation)
        participants = try container.decode([String].self, forKey: .participants)
        answer = try container.decode(String.self, forKey: .answer)
        nextAction = try container.decode(String.self, forKey: .nextAction)
        context = try container.decode(Context.self, forKey: .context)
        log = try container.decode(Log.self, forKey: .log)
        businessWrites = try container.decode(Bool.self, forKey: .businessWrites)
    }
}
