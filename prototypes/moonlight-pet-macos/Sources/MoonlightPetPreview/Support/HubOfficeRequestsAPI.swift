import Foundation
import CoreFoundation

protocol HubOfficeRequestsServing: Sendable {
    func officeInbox(scope: OfficeRequestScope, cursor: OfficeRequestCursor?) async throws -> OfficeRequestPage
    func officeReceipt(_ request: OfficeRequestSummary) async throws -> OfficeRequestDetail
}

extension HubAPI: HubOfficeRequestsServing {
    func officeInbox(scope: OfficeRequestScope, cursor: OfficeRequestCursor?) async throws -> OfficeRequestPage {
        var path = URLComponents(); path.path = "/api/hub/office/inbox"
        path.queryItems = [URLQueryItem(name: "scope", value: scope.rawValue), URLQueryItem(name: "limit", value: "20")]
        if let cursor { path.queryItems?.append(URLQueryItem(name: "cursor", value: try cursor.encoded())) }
        guard let path = path.string else { throw OfficeRequestError.invalidResponse }
        let response = try await transport.request(path: path, method: "GET", body: nil)
        let object = try OfficeRequestWire.envelope(response, maxBytes: 65_536)
        guard object["status"] as? String == "ready", object["source"] as? String == "live",
              let rows = object["items"] as? [[String: Any]], rows.count <= 20,
              let hasMore = OfficeRequestWire.bool(object["hasMore"]), object.keys.contains("nextCursor") else {
            throw OfficeRequestError.invalidResponse
        }
        let items = try rows.map { try OfficeRequestWire.summary($0, metadataOnly: true) }
        let nextCursor: OfficeRequestCursor?
        if object["nextCursor"] is NSNull { nextCursor = nil }
        else {
            guard let value = object["nextCursor"] as? [String: Any], Set(value.keys) == Set(["createdAt", "id"]),
                  let stamp = value["createdAt"] as? String, let text = value["id"] as? String,
                  let id = OfficeRequestValidation.uuid(text) else { throw OfficeRequestError.invalidResponse }
            nextCursor = try OfficeRequestCursor(createdAt: stamp, id: id)
        }
        let page = OfficeRequestPage(items: items, hasMore: hasMore, nextCursor: nextCursor)
        try page.validate(scope: scope, after: cursor)
        return page
    }

    func officeReceipt(_ request: OfficeRequestSummary) async throws -> OfficeRequestDetail {
        let response = try await transport.request(path: "/api/hub/office/requests/\(request.id.uuidString.lowercased())", method: "GET", body: nil)
        let object = try OfficeRequestWire.envelope(response, maxBytes: 262_144)
        let summary = try OfficeRequestWire.summary(object, metadataOnly: false)
        guard summary.matchesIdentity(of: request),
              let persistence = object["persistence"] as? [String: Any], OfficeRequestWire.bool(persistence["persisted"]) == true else {
            throw OfficeRequestError.invalidResponse
        }
        var body: String?
        if summary.isReadable {
            guard let result = object["result"] as? [String: Any], result["version"] as? String == "2026-09-21.v1",
                  result["status"] as? String == "generated",
                  OfficeRequestWire.integer(object["resultRevision"]) == 1, OfficeRequestWire.integer(result["resultRevision"]) == 1,
                  let idText = result["requestId"] as? String, OfficeRequestValidation.uuid(idText) == request.id,
                  result["scope"] as? String == request.scope.rawValue, result["ownerId"] as? String == request.owner.rawValue,
                  result["mode"] as? String == request.mode.rawValue,
                  result["participants"] as? [String] == request.participants.map(\.rawValue),
                  let artifact = result["artifact"] as? [String: Any],
                  ["text", "markdown", "code"].contains(artifact["kind"] as? String ?? ""),
                  let text = artifact["body"] as? String, OfficeRequestValidation.text(text, limit: 24_000) else {
                throw OfficeRequestError.invalidResponse
            }
            body = text
        }
        let detail = OfficeRequestDetail(request: summary, body: body)
        try detail.validate(for: request)
        return detail
    }
}

private enum OfficeRequestWire {
    static let summaryKeys: Set<String> = ["requestId", "intent", "scope", "originRef", "ownerId", "mode", "participants", "createdAt", "status", "state", "expired"]
    static func envelope(_ response: HubResponse, maxBytes: Int) throws -> [String: Any] {
        guard response.data.count <= maxBytes else { throw OfficeRequestError.invalidResponse }
        let object: [String: Any]
        do {
            guard let value = try JSONSerialization.jsonObject(with: response.data) as? [String: Any] else { throw OfficeRequestError.invalidResponse }
            object = value
        } catch { throw OfficeRequestError.invalidResponse }
        if response.isPreview || object["status"] as? String == "preview" || object["source"] as? String == "preview" {
            throw OfficeRequestError.preview
        }
        guard response.status != "error", response.source != "error",
              object["status"] as? String != "error", object["source"] as? String != "error" else {
            throw OfficeRequestError.invalidResponse
        }
        return object
    }
    static func bool(_ value: Any?) -> Bool? {
        guard let value = value as? NSNumber, CFGetTypeID(value) == CFBooleanGetTypeID() else { return nil }
        return value.boolValue
    }
    static func integer(_ value: Any?) -> Int? {
        guard let value = value as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID(),
              value.doubleValue.isFinite, value.doubleValue == Double(value.intValue) else { return nil }
        return value.intValue
    }
    static func summary(_ object: [String: Any], metadataOnly: Bool) throws -> OfficeRequestSummary {
        guard !metadataOnly || Set(object.keys) == summaryKeys,
              let text = object["requestId"] as? String, let id = OfficeRequestValidation.uuid(text),
              let intentText = object["intent"] as? String, let intent = OfficeRequestIntent(rawValue: intentText),
              let scopeText = object["scope"] as? String, let scope = OfficeRequestScope(rawValue: scopeText),
              let ownerText = object["ownerId"] as? String, let owner = OfficeAgent(rawValue: ownerText),
              let modeText = object["mode"] as? String, let mode = OfficeRequestMode(rawValue: modeText),
              let names = object["participants"] as? [String], names.count <= 3,
              let stamp = object["createdAt"] as? String, let createdAt = OfficeRequestValidation.timestamp(stamp),
              let stateText = object["state"] as? String, let state = OfficeRequestState(rawValue: stateText),
              object["status"] as? String == stateText, let expired = bool(object["expired"]),
              let originObject = object["originRef"] as? [String: Any] else { throw OfficeRequestError.invalidResponse }
        let participants = try names.map { name in
            guard let agent = OfficeAgent(rawValue: name) else { throw OfficeRequestError.invalidResponse }
            return agent
        }
        let origin: OfficeRequestOrigin
        switch intent {
        case .weeklyReport:
            guard Set(originObject.keys) == Set(["periodStart", "periodEnd", "timezone"]),
                  let start = originObject["periodStart"] as? String, let end = originObject["periodEnd"] as? String,
                  let timezone = originObject["timezone"] as? String else { throw OfficeRequestError.invalidResponse }
            origin = .weekly(periodStart: start, periodEnd: end, timezone: timezone)
        case .customerReply:
            guard Set(originObject.keys) == Set(["entityType", "entityId"]),
                  let typeText = originObject["entityType"] as? String, let type = OfficeRequestEntityType(rawValue: typeText),
                  let idText = originObject["entityId"] as? String, let entityId = OfficeRequestValidation.uuid(idText) else {
                throw OfficeRequestError.invalidResponse
            }
            origin = .customer(entityType: type, entityId: entityId)
        }
        return try OfficeRequestSummary(id: id, intent: intent, scope: scope, owner: owner, createdAt: createdAt,
                                        origin: origin, mode: mode, participants: participants, state: state, expired: expired)
    }
}
