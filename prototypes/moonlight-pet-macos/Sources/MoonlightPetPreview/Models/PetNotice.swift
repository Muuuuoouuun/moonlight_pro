import Foundation

enum PetNoticeKind: String, Codable { case inquiry, calendar, agent }
struct PetNotice: Identifiable, Equatable {
    let id: String
    let title: String
    let detail: String
    let kind: PetNoticeKind
    let createdAt: Date
    let path: String
    var eventDate: Date? = nil
    var agentID: String? = nil
    var scope: String? = nil
    var origin: String? = nil
    var conversation: OfficeConversationKey? = nil

    var owner: OfficeAgent? {
        OfficeRoleCatalog.noticeOwner(for: kind == .agent ? "agentReply" : kind.rawValue,
                                      actualOwnerId: agentID).flatMap(OfficeAgent.init(rawValue:))
    }
    var topicKey: OfficeConversationKey? {
        if kind == .agent { return conversation }
        guard let origin else { return nil }
        return .init(origin: origin, scope: scope.flatMap(OfficeChatScope.init(rawValue:)) ?? .all, topicID: id)
    }
    var topicSource: OfficeTopicSource {
        .init(title: title, detail: detail, date: eventDate ?? createdAt, path: path, isNoticeSummary: true)
    }
    func originalURL(currentOrigin: String) -> URL? {
        guard origin == currentOrigin, let base = URL(string: currentOrigin),
              let validated = try? HubTransport.validatedBaseURL(base),
              path.hasPrefix("/dashboard/"), !path.contains("\\"),
              let url = URL(string: path, relativeTo: validated)?.absoluteURL,
              url.scheme == validated.scheme, url.host == validated.host, url.port == validated.port,
              url.user == nil, url.password == nil, url.fragment == nil,
              ["/dashboard/revenue/inquiries", "/dashboard/work/calendar"].contains(url.path) else { return nil }
        return url
    }
}
