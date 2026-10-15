import Foundation

/// Server records are the authority; native drafts remain local until an explicit send.
struct OfficeMeeting: Decodable, Identifiable, Sendable {
    let meetingId: UUID
    let title: String
    let scope: OfficeChatScope
    let ownerId: OfficeAgent
    let reviewers: [OfficeAgent]
    let mode: String
    let revision: Int
    let state: String
    let createdAt: String
    let updatedAt: String
    let sourceTask: OfficeMeetingTask?
    let turnCount: Int?
    var id: UUID { meetingId }
    func hubURL(baseURL: String) throws -> URL {
        guard let input = URL(string: baseURL) else { throw HubTransportError.rejectedURL }
        let origin = try HubTransport.validatedBaseURL(input)
        guard var url = URLComponents(url: origin, resolvingAgainstBaseURL: false) else { throw HubTransportError.rejectedURL }
        url.path = "/dashboard/agents/office-council"
        url.queryItems = [URLQueryItem(name: "meeting", value: meetingId.uuidString.lowercased()), URLQueryItem(name: "scope", value: scope.rawValue)]
        guard let result = url.url else { throw HubTransportError.rejectedURL }
        return result
    }
}
struct OfficeMeetingTask: Decodable, Sendable {
    let id: UUID
    let title: String
    let workspace: String
}
struct OfficeMeetingDetail: Decodable, Sendable {
    let status: String
    let persisted: Bool
    let meeting: OfficeMeeting
    let turns: [OfficeMeetingRound]
}
struct OfficeMeetingRound: Decodable, Identifiable, Sendable {
    let id: UUID
    let roundNumber: Int
    let state: String
    let request: Request
    let result: Result?
    private enum CodingKeys: String, CodingKey { case id, roundNumber, state, request, result }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        roundNumber = try c.decode(Int.self, forKey: .roundNumber)
        state = try c.decode(String.self, forKey: .state)
        request = try c.decode(Request.self, forKey: .request)
        // Error/unknown receipts carry error envelopes, not generated answer fields.
        result = state == "generated" ? try c.decode(Result.self, forKey: .result) : nil
    }
    struct Request: Decodable, Sendable { let message: String; let ownerId: OfficeAgent; let mode: String }
    struct Result: Decodable, Sendable {
        let answer: String
        let nextAction: String
        let ownerId: OfficeAgent
        let scope: OfficeChatScope
        let mode: String
        let context: Context?
        let log: Log?
        struct Context: Decodable, Sendable { let note: String?; let source: String? }
        struct Log: Decodable, Sendable { let persisted: Bool; let runId: String? }
    }
    func chatTurn(conversation: OfficeConversationKey) -> OfficeChatTurn? {
        guard state == "generated", let result, result.scope == conversation.scope else { return nil }
        return OfficeChatTurn(id: id, conversation: conversation, agent: result.ownerId, scope: conversation.scope, message: request.message,
                              reply: OfficeChatReply(answer: result.answer, nextAction: result.nextAction,
                                  contextNote: result.context?.note ?? "저장된 회의 문맥을 참고합니다.",
                                  contextSource: result.context?.source ?? "provided", logPersisted: result.log?.persisted ?? false,
                                  runId: result.log?.runId))
    }
}
