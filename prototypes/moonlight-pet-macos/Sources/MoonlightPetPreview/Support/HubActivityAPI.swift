import Foundation

protocol HubActivityServing: Sendable {
    func inquiries() async throws -> HubInquiryPage
    func calendar(from: Date, to: Date) async throws -> HubCalendarPage
}

extension HubAPI: HubActivityServing {
    func inquiries() async throws -> HubInquiryPage {
        let response = try await transport.request(path: "/api/hub/inquiries?filter=unread&pageSize=25", method: "GET", body: nil)
        if response.isPreview { throw HubDataError.preview }
        // This ledger returns a complete count or an error, never partial data.
        guard response.status == "live", response.source != "error" else { throw HubDataError.invalidResponse }
        let page = try JSONDecoder().decode(InquiryEnvelope.self, from: response.data)
        guard page.status == "live", page.source == "supabase", page.unreadCount >= 0,
              page.rows.count <= 25, page.rows.count <= page.unreadCount else { throw HubDataError.invalidResponse }
        let inquiries = try page.rows.map { try $0.inquiry() }
        guard Set(inquiries.map(\.id)).count == inquiries.count else { throw HubDataError.invalidResponse }
        return HubInquiryPage(inquiries: inquiries, unreadCount: page.unreadCount)
    }
}

private struct InquiryEnvelope: Decodable {
    let status: String
    let source: String
    let rows: [InquiryRow]
    let unreadCount: Int
}

private struct InquiryRow: Decodable {
    let id: String
    let subject: String
    let kind: String
    let status: String
    let classification: String
    let sources: [String]
    let unread: Bool
    let last_inbound_seq: Int64
    let last_read_seq: Int64
    let updated_at: String?
    let received_at: String?

    func inquiry() throws -> HubInquiry {
        guard let uuid = UUID(uuidString: id), id.count == 36,
              uuid.uuidString.lowercased() == id.lowercased(),
              unread, last_inbound_seq > last_read_seq, last_read_seq >= 0,
              last_inbound_seq <= 9_007_199_254_740_991,
              ["new", "in_progress", "waiting"].contains(status),
              ["inquiry", "review"].contains(classification) else { throw HubDataError.invalidResponse }
        let title = subject.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { throw HubDataError.invalidResponse }
        let identifier = uuid.uuidString.lowercased()
        var destination = URLComponents()
        destination.path = "/dashboard/revenue/inquiries"
        destination.queryItems = [URLQueryItem(name: "inquiry", value: identifier)]
        guard let path = destination.string else { throw HubDataError.invalidResponse }
        let kinds = ["sales": "영업 문의", "support": "지원 문의", "partnership": "제휴 문의", "general": "일반 문의"]
        let channelNames = ["gmail": "메일", "webhook": "웹", "manual": "직접 등록"]
        guard let kindLabel = kinds[kind], sources.allSatisfy({ channelNames[$0] != nil }) else { throw HubDataError.invalidResponse }
        let channels = ["gmail", "webhook", "manual"].filter { sources.contains($0) }.compactMap { channelNames[$0] }
        let subtitle = ([kindLabel] + channels).joined(separator: " · ")
        let updatedAt: Date?
        if let text = updated_at ?? received_at {
            guard let parsed = Self.date(text) else { throw HubDataError.invalidResponse }
            updatedAt = parsed
        } else { updatedAt = nil }
        return HubInquiry(id: identifier, title: title, subtitle: subtitle, updatedAt: updatedAt, path: path,
                          token: "inquiry:\(identifier):\(last_inbound_seq)")
    }

    private static func date(_ text: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: text) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: text)
    }
}
