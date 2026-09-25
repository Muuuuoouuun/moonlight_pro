import Foundation

private struct PetActivityCheckFailure: Error, CustomStringConvertible {
    let description: String
}
private func petCheck(_ value: @autoclosure () -> Bool, _ message: String) throws {
    if !value() { throw PetActivityCheckFailure(description: message) }
}

private actor ControlledActivity: HubActivityServing {
    private var page = HubInquiryPage(inquiries: [], unreadCount: 0)
    private var events = HubCalendarPage(events: [], partial: false)
    private var hold = false
    private var continuation: CheckedContinuation<Void, Never>?
    private(set) var inquiryReads = 0
    func set(inquiries: [HubInquiry], total: Int? = nil, events: [HubCalendarEvent] = []) {
        page = HubInquiryPage(inquiries: inquiries, unreadCount: total ?? inquiries.count)
        self.events = HubCalendarPage(events: events, partial: false)
    }
    func holdInquiries() { hold = true }
    func releaseInquiries() { hold = false; continuation?.resume(); continuation = nil }
    func isWaiting() -> Bool { continuation != nil }
    func inquiries() async throws -> HubInquiryPage {
        let snapshot = page
        inquiryReads += 1
        if hold { await withCheckedContinuation { continuation = $0 } }
        return snapshot
    }
    func calendar(from: Date, to: Date) async throws -> HubCalendarPage { events }
}

private func testInquiry(_ id: String = UUID().uuidString.lowercased(), sequence: Int = 1) -> HubInquiry {
    HubInquiry(id: id, title: "문의 상태 검증", subtitle: "지원 문의 · 메일", updatedAt: Date(),
               path: "/dashboard/revenue/inquiries?inquiry=\(id)", token: "inquiry:\(id):\(sequence)")
}
private func testEvent(at date: Date, allDay: Bool = false) throws -> HubCalendarEvent {
    let formatter = ISO8601DateFormatter()
    return try HubCalendarEvent(id: UUID().uuidString, title: "일정 경계 검증", startText: formatter.string(from: date),
                                endText: formatter.string(from: date.addingTimeInterval(3600)), allDay: allDay, location: nil)
}

@MainActor
private func waitForActivity(_ condition: () async -> Bool) async throws {
    for _ in 0..<2000 {
        if await condition() { return }
        try await Task.sleep(nanoseconds: 1_000_000)
    }
    throw PetActivityCheckFailure(description: "Activity state did not settle within two seconds")
}
@MainActor
private func waitForLoad(_ store: PetActivityStore, api: ControlledActivity) async throws {
    try await waitForActivity { await api.inquiryReads > 0 && !store.isRefreshing && store.message != "알림을 불러오는 중이에요." }
}

@MainActor
func runPetActivityStoreTests() async throws -> Int {
    let suite = "moonlight.pet-activity-tests." + UUID().uuidString
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    var count = 0

    // Initial messages are listed quietly; only a later inbound token may pop up.
    do {
        let api = ControlledActivity(), id = UUID().uuidString.lowercased()
        await api.set(inquiries: [testInquiry(id)], total: 34)
        let store = PetActivityStore(defaults: defaults)
        var delivered: [String] = []
        store.onBanner = { delivered.append($0.id); return true }
        store.configure(service: api, origin: "https://initial.example.test")
        defer { store.configure(service: nil, origin: nil) }
        try await waitForLoad(store, api: api)
        try petCheck(store.notices.count == 1 && store.totalInquiryCount == 34 && store.banner == nil && delivered.isEmpty, "Initial unread data must list quietly with exact total count")
        try petCheck(store.message?.contains("전체 미확인 34개") == true, "Bounded inquiry preview must disclose exact larger count")
        await api.set(inquiries: [testInquiry(id, sequence: 2)])
        await store.refresh()
        try petCheck(delivered.count == 1 && store.banner?.id.hasSuffix(":2") == true, "New inbound revision should be delivered once")
        store.dismissBanner()
        await store.refresh()
        store.presentNext()
        try petCheck(delivered.count == 1 && store.banner == nil, "Same unread revision must not repeat after refresh or dismissal")
        count += 1
    }

    // Window/interaction coordinator can decline a banner without consuming it.
    do {
        let api = ControlledActivity(), store = PetActivityStore(defaults: defaults)
        let id = UUID().uuidString.lowercased()
        await api.set(inquiries: [testInquiry(id)])
        var mayPresent = false, accepted: [String] = []
        store.onBanner = { notice in
            if mayPresent { accepted.append(notice.id) }
            return mayPresent
        }
        store.configure(service: api, origin: "https://suppressed.example.test")
        defer { store.configure(service: nil, origin: nil) }
        try await waitForLoad(store, api: api)
        await api.set(inquiries: [testInquiry(id, sequence: 2)])
        await store.refresh()
        try petCheck(store.banner == nil && accepted.isEmpty, "Press/focus suppression must leave no displayed banner")
        mayPresent = true
        store.presentNext()
        try petCheck(accepted.count == 1 && store.banner != nil, "Previously suppressed notice must still be available after interaction ends")
        store.dismissBanner(); store.presentNext()
        try petCheck(accepted.count == 1, "Accepted deferred banner must not repeat")
        count += 1
    }

    do {
        let now = Date(), api = ControlledActivity(), store = PetActivityStore(defaults: defaults)
        let expired = try testEvent(at: now.addingTimeInterval(-60))
        let soon = try testEvent(at: now.addingTimeInterval(300))
        let later = try testEvent(at: now.addingTimeInterval(900))
        let allDay = try testEvent(at: now, allDay: true)
        await api.set(inquiries: [], events: [expired, soon, later, allDay])
        var presented = 0
        store.onBanner = { _ in presented += 1; return true }
        store.configure(service: api, origin: "https://calendar.example.test")
        defer { store.configure(service: nil, origin: nil) }
        try await waitForLoad(store, api: api)
        try petCheck(store.notices.count == 1 && store.notices[0].kind == .calendar && presented == 1, "Only future timed events within ten minutes may notify")
        store.presentNext(now: now.addingTimeInterval(301))
        try petCheck(store.notices.isEmpty && store.banner == nil, "A past event must disappear even between refreshes")
        count += 1
    }

    do {
        let api = ControlledActivity(), notice = testInquiry()
        await api.set(inquiries: [notice])
        let first = PetActivityStore(defaults: defaults)
        first.configure(service: api, origin: "https://hidden.example.test")
        try await waitForLoad(first, api: api)
        first.dismiss(id: notice.token)
        try petCheck(first.notices.isEmpty && first.totalInquiryCount == 1, "Local hiding must preserve the server unread count")
        first.configure(service: nil, origin: nil)
        let restored = PetActivityStore(defaults: defaults)
        restored.configure(service: api, origin: "https://hidden.example.test")
        defer { restored.configure(service: nil, origin: nil) }
        try await waitForLoad(restored, api: api)
        try petCheck(restored.notices.isEmpty, "Hidden notices must remain hidden after reopening the same origin")
        restored.configure(service: api, origin: "https://different.example.test")
        try petCheck(restored.notices.isEmpty && restored.totalInquiryCount == 0 && restored.banner == nil, "Origin switch must clear old contents immediately")
        try await waitForLoad(restored, api: api)
        try petCheck(restored.notices.count == 1, "A different origin must not inherit hidden preferences")
        count += 1
    }

    do {
        let oldAPI = ControlledActivity(), newAPI = ControlledActivity()
        let old = testInquiry(), current = testInquiry()
        await oldAPI.set(inquiries: [old]); await oldAPI.holdInquiries()
        await newAPI.set(inquiries: [current])
        let store = PetActivityStore(defaults: defaults)
        store.configure(service: oldAPI, origin: "https://old.example.test")
        defer { store.configure(service: nil, origin: nil) }
        try await waitForActivity { await oldAPI.isWaiting() }
        store.configure(service: newAPI, origin: "https://new.example.test")
        try await waitForLoad(store, api: newAPI)
        try petCheck(store.notices.map(\.id) == [current.token], "Reconnection must load the new origin")
        await oldAPI.releaseInquiries()
        for _ in 0..<20 { await Task.yield() }
        try petCheck(store.notices.map(\.id) == [current.token] && !store.isRefreshing, "Late prior-generation response must never replace current-origin data")
        store.configure(service: nil, origin: nil)
        try petCheck(store.notices.isEmpty && store.banner == nil && store.totalInquiryCount == 0, "Disconnect must clear private activity immediately")
        count += 1
    }

    // A newly received local reply contributes to the same badge without changing Hub unread state.
    do {
        let api = ControlledActivity(), store = PetActivityStore(defaults: defaults)
        let inquiry = testInquiry(), replyID = UUID().uuidString
        await api.set(inquiries: [inquiry], total: 7)
        var delivered: [String] = []
        store.onBanner = { delivered.append($0.id); return true }
        store.configure(service: api, origin: "https://agent-reply.example.test")
        defer { store.configure(service: nil, origin: nil) }
        try await waitForLoad(store, api: api)
        store.addAgentReply(id: replyID, agentID: "sylveon", scope: "personal", title: "님피아의 답변", detail: "답변이 도착했어요.")
        try petCheck(store.unreadCount == 2 && store.totalInquiryCount == 7, "Local agent reply must increment the visible badge without modifying server inquiry count")
        try petCheck(store.banner?.id == "agent:" + replyID && delivered == ["agent:" + replyID], "A new agent reply must be eligible for one banner immediately")
        try petCheck(store.banner?.kind == .agent && store.banner?.agentID == "sylveon" && store.banner?.scope == "personal" && store.banner?.path == "", "Reply notice must preserve its native agent and scope destination")
        store.dismissBanner()
        await store.refresh()
        store.presentNext()
        try petCheck(store.unreadCount == 2 && store.banner == nil && delivered.count == 1, "Dismissal only ends presentation; refreshing must retain the unread reply without a repeated banner")
        count += 1
    }

    // Viewing one conversation cannot acknowledge a different owner, scope, or an inquiry.
    do {
        let api = ControlledActivity(), store = PetActivityStore(defaults: defaults)
        let inquiry = testInquiry(), firstID = UUID().uuidString, secondID = UUID().uuidString, thirdID = UUID().uuidString
        await api.set(inquiries: [inquiry])
        var dismissed = 0
        store.onBanner = { _ in true }
        store.onBannerDismissed = { dismissed += 1 }
        store.configure(service: api, origin: "https://agent-acknowledge.example.test")
        defer { store.configure(service: nil, origin: nil) }
        try await waitForLoad(store, api: api)
        store.addAgentReply(id: firstID, agentID: "eevee", scope: "personal", title: "첫 답변", detail: "개인 범위")
        store.addAgentReply(id: secondID, agentID: "eevee", scope: "classin", title: "다른 범위", detail: "회사 범위")
        store.addAgentReply(id: thirdID, agentID: "sylveon", scope: "personal", title: "다른 담당", detail: "개인 범위")
        store.acknowledgeAgentReplies(agentID: "eevee", scope: "all")
        try petCheck(store.unreadCount == 4 && store.banner?.id == "agent:" + firstID, "A nonmatching scope must not consume a reply or dismiss its banner")
        store.acknowledgeAgentReplies(agentID: "eevee", scope: "personal")
        try petCheck(Set(store.notices.map(\.id)) == Set(["agent:" + secondID, "agent:" + thirdID, inquiry.token]), "Acknowledgment must require exact owner and scope and preserve unrelated inquiries")
        try petCheck(store.unreadCount == 3 && store.banner == nil && dismissed == 1, "Acknowledging the currently presented reply must dismiss that banner and decrement the badge")
        store.presentNext()
        try petCheck(store.banner?.id == "agent:" + thirdID, "Another owner's pending reply must remain eligible after acknowledgment")
        store.acknowledgeAgentReplies(agentID: "eevee", scope: "classin")
        try petCheck(store.unreadCount == 2 && store.banner?.id == "agent:" + thirdID && dismissed == 1, "Acknowledging a different conversation must leave the current banner intact")
        count += 1
    }

    do {
        let oldAPI = ControlledActivity(), newAPI = ControlledActivity(), store = PetActivityStore(defaults: defaults)
        var delivered: [String] = []
        store.onBanner = { delivered.append($0.id); return true }
        store.configure(service: oldAPI, origin: "https://agent-old.example.test")
        defer { store.configure(service: nil, origin: nil) }
        try await waitForLoad(store, api: oldAPI)
        store.addAgentReply(id: UUID().uuidString, agentID: "umbreon", scope: "all", title: "이전 Hub 답변", detail: "표시 중")
        store.addAgentReply(id: UUID().uuidString, agentID: "leafeon", scope: "personal", title: "이전 Hub 대기 답변", detail: "대기 중")
        try petCheck(store.unreadCount == 2 && store.banner != nil && delivered.count == 1, "Origin-change test must begin with visible and queued local replies")
        store.configure(service: newAPI, origin: "https://agent-new.example.test")
        try petCheck(store.unreadCount == 0 && store.notices.isEmpty && store.banner == nil, "Switching Hub origin must clear local replies and its badge immediately")
        try await waitForLoad(store, api: newAPI)
        store.presentNext()
        try petCheck(store.notices.isEmpty && store.banner == nil && delivered.count == 1, "Neither delivered nor queued prior-origin replies may surface after reconnecting")
        count += 1
    }

    do {
        let text = "한글과 🌓, 이브이 👨‍👩‍👧‍👦\n줄바꿈 e\u{301} &?#=+/% ", store = CouncilDraftStore(defaults: defaults)
        store.prepare(text, source: .memo)
        let url = try store.handoffURL(baseURL: "https://hub.example.test")
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        try petCheck(components.scheme == "https" && components.host == "hub.example.test" && components.path == "/dashboard/agents/council" && components.query == nil, "Council draft belongs only in fixed Hub route fragment")
        let prefix = "moonlight-council="
        guard let fragment = components.fragment, fragment.hasPrefix(prefix) else { throw PetActivityCheckFailure(description: "Missing Council fragment") }
        var encoded = String(fragment.dropFirst(prefix.count)).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        encoded += String(repeating: "=", count: (4 - encoded.count % 4) % 4)
        guard let data = Data(base64Encoded: encoded), let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw PetActivityCheckFailure(description: "Council payload did not decode") }
        try petCheck(Array((payload["draft"] as? String ?? "").utf16) == Array(text.utf16), "Council payload must preserve Unicode, combining characters, whitespace and punctuation exactly")
        try petCheck(payload["version"] as? Int == 1 && (payload["source"] as? [String: String])?["kind"] == "memo", "Council payload must preserve version and input source")
        let reopened = CouncilDraftStore(defaults: defaults)
        try petCheck(Array(reopened.draft.utf16) == Array(text.utf16) && reopened.source == .memo, "Council draft and origin type must persist locally")
        count += 1
    }

    do {
        let store = CouncilDraftStore(defaults: defaults)
        store.prepare(String(repeating: "🌓", count: 2000), source: .text)
        try petCheck(store.draft.utf16.count == 4000 && store.canOpen, "Exactly 4000 UTF16 units must remain valid")
        _ = try store.handoffURL(baseURL: "http://127.0.0.1:3000")
        store.draft += "가"
        try petCheck(!store.canOpen && store.validationMessage != nil, "4001 UTF16 units must be rejected without dropping text")
        do { _ = try store.handoffURL(baseURL: "http://127.0.0.1:3000"); throw PetActivityCheckFailure(description: "Oversized Council draft produced URL") }
        catch HubDataError.invalidMemo {}
        try petCheck(store.draft.utf16.count == 4001, "Oversized Council draft must remain intact")
        store.draft = " \n\t"
        try petCheck(!store.canOpen, "Whitespace-only Council draft is not an agenda")
        count += 1
    }

    do {
        let store = CouncilDraftStore(defaults: defaults)
        store.prepare("안건 검증", source: .task)
        for address in ["http://remote.example.test", "https://user:pass@hub.example.test", "https://hub.example.test/another-path", "https://hub.example.test?next=other", "https://hub.example.test#other", "file:///tmp/private", "javascript:alert(1)"] {
            do { _ = try store.handoffURL(baseURL: address) }
            catch { continue }
            throw PetActivityCheckFailure(description: "Unsafe Council origin accepted: \(address)")
        }
        try petCheck(store.draft == "안건 검증" && store.source == .task, "Rejected origins must leave Council draft intact")
        count += 1
    }
    return count
}
