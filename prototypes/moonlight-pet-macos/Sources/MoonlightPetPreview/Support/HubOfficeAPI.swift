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

protocol HubOfficeMeetingServing: HubOfficeServing {
    func officeMeetings(scope: OfficeChatScope) async throws -> [OfficeMeeting]
    func officeMeeting(id: UUID) async throws -> OfficeMeetingDetail
    func officeMeeting(id: UUID, scope: OfficeChatScope) async throws -> OfficeMeetingDetail
    func createOfficeMeeting(id: UUID, title: String, scope: OfficeChatScope, owner: OfficeAgent, sourceTaskID: UUID?) async throws -> OfficeMeetingDetail
    func sendOfficeMeeting(id: UUID, requestID: UUID, revision: Int, message: String) async throws -> OfficeMeetingDetail
    func sendOfficeMeeting(id: UUID, scope: OfficeChatScope, requestID: UUID, revision: Int, message: String) async throws -> OfficeMeetingDetail
}

// Existing custom services retain source compatibility. The production HubAPI
// overrides both scoped requirements; the store never guesses a lane from data.
extension HubOfficeMeetingServing {
    func officeMeeting(id: UUID, scope: OfficeChatScope) async throws -> OfficeMeetingDetail {
        guard scope != .all else { throw OfficeChatError.invalidInput }
        let detail = try await officeMeeting(id: id)
        guard detail.meeting.meetingId == id, detail.meeting.scope == scope else { throw OfficeChatError.invalidResponse }
        return detail
    }
    func sendOfficeMeeting(id: UUID, scope: OfficeChatScope, requestID: UUID, revision: Int, message: String) async throws -> OfficeMeetingDetail {
        guard scope != .all else { throw OfficeChatError.invalidInput }
        let detail = try await sendOfficeMeeting(id: id, requestID: requestID, revision: revision, message: message)
        guard detail.meeting.meetingId == id, detail.meeting.scope == scope else { throw OfficeChatError.invalidResponse }
        return detail
    }
}

extension HubAPI: HubOfficeMeetingServing {
    func officeMeetings(scope: OfficeChatScope) async throws -> [OfficeMeeting] {
        guard scope != .all else { throw OfficeChatError.invalidInput }
        let response = try await transport.request(path: "/api/hub/office/meetings?scope=\(scope.rawValue)&limit=20", method: "GET", body: nil)
        try officeMeetingStatus(response, expected: ["ready"])
        struct Page: Decodable { let meetings: [OfficeMeeting] }
        let page = try JSONDecoder().decode(Page.self, from: response.data)
        guard page.meetings.allSatisfy({ $0.scope == scope && $0.revision >= 0 && ["open", "closed"].contains($0.state) }) else { throw OfficeChatError.invalidResponse }
        return page.meetings
    }
    // Legacy unscoped entry point remains a full-response read. Production uses
    // the scoped overload below. Never infer requested scope from page zero.
    func officeMeeting(id: UUID) async throws -> OfficeMeetingDetail {
        let response = try await transport.request(path: meetingPath(id), method: "GET", body: nil)
        return try meetingDetail(response, id: id, expected: ["ready"])
    }
    func officeMeeting(id: UUID, scope: OfficeChatScope) async throws -> OfficeMeetingDetail {
        guard scope != .all else { throw OfficeChatError.invalidInput }
        return try await withMeetingOperation { operation, deadline, lease in
            try await restoreMeeting(id: id, scope: scope, operation: operation, deadline: deadline, lease: lease)
        }
    }
    func createOfficeMeeting(id: UUID, title: String, scope: OfficeChatScope, owner: OfficeAgent, sourceTaskID: UUID?) async throws -> OfficeMeetingDetail {
        guard scope != .all, OfficeChatCommand.validText(title, limit: 200) else { throw OfficeChatError.invalidInput }
        var input: [String: Any] = ["meetingId": id.uuidString.lowercased(), "title": title, "scope": scope.rawValue,
                                   "ownerId": owner.rawValue, "reviewers": [String](), "mode": "chat"]
        if let sourceTaskID { input["sourceTaskId"] = sourceTaskID.uuidString.lowercased() }
        let body = try JSONSerialization.data(withJSONObject: input)
        return try await withMeetingOperation { operation, deadline, lease in
            let response = try await transport.officeRequest(path: "/api/hub/office/meetings", method: "POST", body: body, operation: operation, deadline: deadline)
            let detail: OfficeMeetingDetail
            if response.status == "accepted" {
                try validateMeetingReceipt(response, id: id, requestID: nil)
                detail = try await recoverAcceptedMeeting(id: id, scope: scope, operation: operation, deadline: deadline, lease: lease)
            } else { detail = try boundedMeetingDetail(response, id: id, scope: scope, expected: ["ready"]) }
            guard detail.meeting.scope == scope, detail.meeting.ownerId == owner,
                  detail.meeting.sourceTask?.id == sourceTaskID else { throw OfficeChatError.invalidResponse }
            return detail
        }
    }
    // Retained only for old callers; no new store calls this overload.
    func sendOfficeMeeting(id: UUID, requestID: UUID, revision: Int, message: String) async throws -> OfficeMeetingDetail {
        let body = try meetingTurnBody(requestID: requestID, revision: revision, message: message)
        let response = try await transport.request(path: meetingPath(id) + "/turns", method: "POST", body: body)
        return try meetingDetail(response, id: id, expected: ["generated"])
    }
    func sendOfficeMeeting(id: UUID, scope: OfficeChatScope, requestID: UUID, revision: Int, message: String) async throws -> OfficeMeetingDetail {
        guard scope != .all else { throw OfficeChatError.invalidInput }
        let body = try meetingTurnBody(requestID: requestID, revision: revision, message: message)
        return try await withMeetingOperation { operation, deadline, lease in
            let response = try await transport.officeRequest(path: meetingPath(id) + "/turns", method: "POST", body: body, operation: operation, deadline: deadline)
            let detail: OfficeMeetingDetail
            if response.status == "accepted" {
                try validateMeetingReceipt(response, id: id, requestID: requestID)
                detail = try await recoverAcceptedMeeting(id: id, scope: scope, operation: operation, deadline: deadline, lease: lease)
            } else { detail = try boundedMeetingDetail(response, id: id, scope: scope, expected: ["generated"]) }
            guard detail.meeting.revision > revision,
                  let round = detail.turns.first(where: { $0.id == requestID }), round.state == "generated",
                  round.request.message.utf8.elementsEqual(message.utf8), round.request.mode == "chat" else { throw OfficeChatError.unconfirmed }
            return detail
        }
    }
    private func meetingTurnBody(requestID: UUID, revision: Int, message: String) throws -> Data {
        guard revision >= 0, OfficeChatCommand.validText(message, limit: 6000) else { throw OfficeChatError.invalidInput }
        return try JSONSerialization.data(withJSONObject: ["requestId": requestID.uuidString.lowercased(), "expectedRevision": revision,
                                                           "message": message, "mode": "chat", "includeProjects": false])
    }
    private func withMeetingOperation(_ work: @escaping @Sendable (HubOfficeOperation?, Date, UUID) async throws -> OfficeMeetingDetail) async throws -> OfficeMeetingDetail {
        try Task.checkCancellation()
        let budget = OfficeMeetingReadBudget.shared
        let lease = try await budget.acquire()
        do {
            let detail = try await OfficeMeetingDeadline.run { deadline in
                let operation = try await transport.beginOfficeOperation()
                let result = try await work(operation, deadline, lease)
                try await transport.validateOfficeOperation(operation)
                return result
            }
            await budget.release(lease)
            return detail
        } catch { await budget.release(lease); throw error }
    }
    private func restoreMeeting(id: UUID, scope: OfficeChatScope, operation: HubOfficeOperation?, deadline: Date, lease: UUID) async throws -> OfficeMeetingDetail {
        var assembly = OfficeMeetingPageAssembly(id: id, scope: scope)
        for _ in 0..<OfficeMeetingPageLimits.pages {
            try Task.checkCancellation()
            guard Date() < deadline else { throw OfficeMeetingReadError.timeout }
            var query = URLComponents(); query.path = meetingPath(id)
            query.queryItems = [URLQueryItem(name: "readVersion", value: "1"), URLQueryItem(name: "scope", value: scope.rawValue)]
            if let cursor = assembly.nextCursor { query.queryItems?.append(URLQueryItem(name: "cursor", value: cursor)) }
            guard let path = query.string else { throw OfficeMeetingReadError.invalidPage }
            let response = try await transport.officeRequest(path: path, method: "GET", body: nil, operation: operation, deadline: deadline)
            try Task.checkCancellation()
            guard response.data.count <= OfficeMeetingPageLimits.envelopeBytes else { throw OfficeMeetingReadError.resourceLimit }
            try OfficeMeetingPageAssembly.checkError(response.data)
            guard let envelope = try JSONSerialization.jsonObject(with: response.data) as? [String: Any] else { throw OfficeMeetingReadError.invalidPage }
            if envelope["page"] == nil {
                // An old server may ignore readVersion. Only its complete bounded
                // response is compatible; never silently accept a partial body.
                guard assembly.verifiedPages == 0 else { throw OfficeMeetingReadError.invalidPage }
                try await OfficeMeetingReadBudget.shared.reserve(response.data.count, for: lease)
                return try boundedMeetingDetail(response, id: id, scope: scope, expected: ["ready"])
            }
            if assembly.verifiedPages == 0 {
                try await OfficeMeetingReadBudget.shared.reserve(OfficeMeetingPageAssembly.advertisedBytes(response.data), for: lease)
            }
            if let body = try assembly.accept(response.data) {
                var detail = try meetingDetail(HubResponse(data: body, status: "ready"), id: id, expected: ["ready"])
                try assembly.validateCompletion()
                detail.historyComplete = true; detail.restoration = assembly.restoration; detail.unresolved = assembly.unresolved
                return detail
            }
        }
        throw OfficeMeetingReadError.resourceLimit
    }
    private func recoverAcceptedMeeting(id: UUID, scope: OfficeChatScope, operation: HubOfficeOperation?, deadline: Date, lease: UUID) async throws -> OfficeMeetingDetail {
        do { return try await restoreMeeting(id: id, scope: scope, operation: operation, deadline: deadline, lease: lease) }
        catch is CancellationError { throw CancellationError() }
        catch {
            // A failed GET (even preview/401/404) cannot reject the preceding
            // accepted write. Preserve its original command and creation ID.
            throw OfficeChatError.unconfirmed
        }
    }
    private func validateMeetingReceipt(_ response: HubResponse, id: UUID, requestID: UUID?) throws {
        struct Receipt: Decodable {
            struct Recovery: Decodable { let method: String; let readVersion: Int }
            let status: String; let receiptVersion: Int; let meetingId: UUID; let requestId: UUID?
            let persisted: Bool?; let outcome: String; let historyComplete: Bool; let businessWrites: Bool; let recovery: Recovery
        }
        guard response.data.count <= OfficeMeetingPageLimits.envelopeBytes else { throw OfficeMeetingReadError.resourceLimit }
        let receipt = try JSONDecoder().decode(Receipt.self, from: response.data)
        guard OfficeMeetingPageAssembly.isUTF8JSON(response.data), receipt.status == "accepted", receipt.receiptVersion == 1, receipt.meetingId == id, receipt.requestId == requestID,
              receipt.persisted != false, ["ready", "generated", "running", "unknown", "error"].contains(receipt.outcome),
              !receipt.historyComplete, !receipt.businessWrites, receipt.recovery.method == "GET", receipt.recovery.readVersion == 1 else { throw OfficeChatError.unconfirmed }
        // The receipt is only a pointer for verification, never proof of completion.
    }
    private func boundedMeetingDetail(_ response: HubResponse, id: UUID, scope: OfficeChatScope, expected: Set<String>) throws -> OfficeMeetingDetail {
        try officeMeetingStatus(response, expected: expected)
        guard response.data.count <= OfficeMeetingPageLimits.envelopeBytes else { throw OfficeMeetingReadError.resourceLimit }
        try OfficeMeetingPageAssembly.validateBody(response.data, id: id.uuidString.lowercased(), scope: scope.rawValue, statuses: expected)
        var detail = try meetingDetail(response, id: id, expected: expected)
        detail.historyComplete = true
        return detail
    }
    private func meetingPath(_ id: UUID) -> String { "/api/hub/office/meetings/" + id.uuidString.lowercased() }
    private func officeMeetingStatus(_ response: HubResponse, expected: Set<String>) throws {
        if response.isPreview { throw OfficeChatError.preview }
        if ["running", "unknown"].contains(response.status ?? "") { throw OfficeChatError.unconfirmed }
        guard expected.contains(response.status ?? ""), response.source != "error" else { throw OfficeChatError.invalidResponse }
    }
    private func meetingDetail(_ response: HubResponse, id: UUID, expected: Set<String>) throws -> OfficeMeetingDetail {
        try officeMeetingStatus(response, expected: expected)
        var detail = try JSONDecoder().decode(OfficeMeetingDetail.self, from: response.data)
        guard detail.persisted, detail.historyComplete != false, detail.meeting.meetingId == id, detail.meeting.scope != .all,
              (0...9_007_199_254_740_991).contains(detail.meeting.revision),
              ["open", "closed"].contains(detail.meeting.state),
              Set(detail.turns.map(\.id)).count == detail.turns.count,
              zip(detail.turns, detail.turns.dropFirst()).allSatisfy({ $0.roundNumber < $1.roundNumber }),
              detail.turns.allSatisfy({ round in
                  guard ["running", "generated", "error", "unknown"].contains(round.state), round.roundNumber > 0 else { return false }
                  if round.state != "generated" { return true }
                  guard let result = round.result else { return false }
                  return result.scope == detail.meeting.scope && result.ownerId == round.request.ownerId && result.mode == round.request.mode
                      && OfficeChatCommand.validText(result.answer, limit: 20_000)
                      && OfficeChatCommand.validText(result.nextAction, limit: 6000)
              }) else { throw OfficeChatError.invalidResponse }
        detail.originalData = response.data
        return detail
    }
}
