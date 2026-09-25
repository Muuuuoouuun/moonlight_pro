import Foundation
import Combine

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
}

/// Local presentation state only. Hiding a notice never changes Hub unread state.
@MainActor
final class PetActivityStore: ObservableObject {
    @Published private(set) var notices: [PetNotice] = []
    @Published private(set) var isRefreshing = false
    @Published private(set) var message: String? = "Hub에 연결하면 문의와 다가오는 일정을 확인해요."
    @Published var bannersEnabled: Bool {
        didSet {
            defaults.set(bannersEnabled, forKey: "petNotices.banners")
            if !bannersEnabled { dismissBanner() }
            else { presentNext() }
        }
    }
    @Published private(set) var banner: PetNotice?
    @Published private(set) var totalInquiryCount = 0
    var unreadCount: Int { notices.count }
    var onBanner: ((PetNotice) -> Bool)?
    var onBannerDismissed: (() -> Void)?
    private let defaults: UserDefaults
    private var api: (any HubActivityServing)?
    private var generation = 0
    private var loop: Task<Void, Never>?
    private var storageKey: String?
    private var state = DeliveryState()
    private var inquiryNotices: [PetNotice] = []
    private var calendarNotices: [PetNotice] = []
    private var agentNotices: [PetNotice] = []
    private var eligible: Set<String> = []
    private var hasInquiryBaseline = false
    private var receivedInquiries: Set<String> = []
    private var sourcesReady: Set<PetNoticeKind> = []
    private struct DeliveryState: Codable {
        var delivered: [String] = []
        var hidden: [String] = []
    }
    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        bannersEnabled = defaults.object(forKey: "petNotices.banners") as? Bool ?? true
    }
    func configure(service: (any HubActivityServing)?, origin: String?) {
        loop?.cancel(); generation += 1; api = service; isRefreshing = false
        dismissBanner(); notices = []; inquiryNotices = []; calendarNotices = []; agentNotices = []
        totalInquiryCount = 0; eligible = []; hasInquiryBaseline = false; receivedInquiries = []; sourcesReady = []
        storageKey = origin.map { "petNotices.delivery.v1." + $0 }
        state = storageKey.flatMap { defaults.data(forKey: $0) }.flatMap { try? JSONDecoder().decode(DeliveryState.self, from: $0) } ?? DeliveryState()
        message = service == nil ? "Hub 연결이 필요해요. 연결 설정에서 확인해 주세요." : "알림을 불러오는 중이에요."
        guard service != nil else { return }
        loop = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                await self.refresh()
                do { try await Task.sleep(for: .seconds(60)) } catch { return }
            }
        }
    }
    func refresh(now: Date = Date()) async {
        guard let api, !isRefreshing else { return }
        let ticket = generation
        isRefreshing = true
        defer { if ticket == generation { isRefreshing = false } }
        async let inquiries = Self.result { try await api.inquiries() }
        async let calendar = Self.result { try await api.calendar(from: now, to: now.addingTimeInterval(86400)) }
        let (inquiryResult, calendarResult) = await (inquiries, calendar)
        guard ticket == generation else { return }
        var messages: [String] = []
        switch inquiryResult {
        case .success(let page):
            sourcesReady.insert(.inquiry)
            totalInquiryCount = page.unreadCount
            let tokens = Set(page.inquiries.map(\.token))
            // Existing unread messages populate the inbox quietly on first connection.
            if hasInquiryBaseline { eligible.formUnion(tokens.subtracting(receivedInquiries)) }
            else { hasInquiryBaseline = true }
            receivedInquiries.formUnion(tokens)
            inquiryNotices = page.inquiries.map {
                PetNotice(id: $0.token, title: $0.title, detail: $0.subtitle, kind: .inquiry,
                          createdAt: $0.updatedAt ?? now, path: $0.path)
            }
            if page.unreadCount > page.inquiries.count {
                messages.append("문의 최신 \(page.inquiries.count)개 · 전체 미확인 \(page.unreadCount)개")
            }
        case .failure(let error):
            sourcesReady.remove(.inquiry)
            messages.append("문의: " + error.localizedDescription)
        }
        switch calendarResult {
        case .success(let page):
            sourcesReady.insert(.calendar)
            calendarNotices = page.events.filter { !$0.allDay && $0.start >= now && $0.start.timeIntervalSince(now) <= 600 }.map {
                let token = "calendar:\($0.id):\(Int($0.start.timeIntervalSince1970))"
                return PetNotice(id: token, title: $0.title, detail: "\($0.timeLabel) 시작 · 일정이 곧 있어요.", kind: .calendar,
                                 createdAt: $0.start, path: "/dashboard/work/calendar", eventDate: $0.start)
            }
            eligible.formUnion(calendarNotices.map(\.id))
            if page.partial { messages.append("일정 일부만 확인했어요. 전체 일정은 Hub에서 확인해 주세요.") }
        case .failure(let error):
            sourcesReady.remove(.calendar)
            messages.append("일정: " + error.localizedDescription)
        }
        message = messages.isEmpty ? nil : messages.joined(separator: "\n")
        rebuild(now: now)
        presentNext(now: now)
    }
    func presentNext(now: Date = Date()) {
        rebuild(now: now)
        guard bannersEnabled, banner == nil else { return }
        guard let next = notices.first(where: { eligible.contains($0.id) && !state.delivered.contains($0.id) && sourcesReady.contains($0.kind) }) else { return }
        banner = next
        if onBanner?(next) == true { state.delivered.append(next.id); persist() }
        else { banner = nil }
    }
    func addAgentReply(id: String, agentID: String, scope: String, title: String, detail: String) {
        let token = "agent:" + id
        agentNotices.insert(PetNotice(id: token, title: title, detail: detail, kind: .agent,
            createdAt: Date(), path: "", agentID: agentID, scope: scope), at: 0)
        agentNotices = Array(agentNotices.prefix(30))
        sourcesReady.insert(.agent); eligible.insert(token)
        presentNext()
    }
    func acknowledgeAgentReplies(agentID: String, scope: String) {
        let ids = Set(agentNotices.filter { $0.agentID == agentID && $0.scope == scope }.map(\.id))
        agentNotices.removeAll { ids.contains($0.id) }
        if let banner, ids.contains(banner.id) { dismissBanner() }
        rebuild(now: Date())
    }
    func dismiss(id: String) {
        state.hidden.append(id); persist()
        if banner?.id == id { dismissBanner() }
        rebuild(now: Date())
    }
    func dismissBanner() {
        guard banner != nil else { return }
        banner = nil
        onBannerDismissed?()
    }
    private func rebuild(now: Date) {
        let hidden = Set(state.hidden)
        notices = (agentNotices + calendarNotices + inquiryNotices).filter {
            !hidden.contains($0.id) && ($0.eventDate == nil || $0.eventDate! >= now)
        }
        if let banner, !notices.contains(where: { $0.id == banner.id }) { dismissBanner() }
    }
    private func persist() {
        // Bounded preferences: enough history for repeated refreshes without unbounded growth.
        state.delivered = Self.recentUnique(state.delivered)
        state.hidden = Self.recentUnique(state.hidden)
        if let key = storageKey, let data = try? JSONEncoder().encode(state) { defaults.set(data, forKey: key) }
    }
    nonisolated private static func recentUnique(_ values: [String]) -> [String] {
        var seen = Set<String>()
        return Array(values.reversed().filter { seen.insert($0).inserted }.prefix(1000).reversed())
    }
    nonisolated private static func result<T: Sendable>(_ operation: @Sendable () async throws -> T) async -> Result<T, Error> {
        do { return .success(try await operation()) } catch { return .failure(error) }
    }
}
