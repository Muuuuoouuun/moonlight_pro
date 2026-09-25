import Foundation
import Combine

enum CouncilDraftSource: String, Codable { case text, memo, task }

@MainActor
final class CouncilDraftStore: ObservableObject {
    @Published var draft: String { didSet { defaults.set(draft, forKey: "petCouncil.draft"); handoffMessage = nil } }
    @Published var source: CouncilDraftSource { didSet { defaults.set(source.rawValue, forKey: "petCouncil.source") } }
    @Published var handoffMessage: String?
    private let defaults: UserDefaults
    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        draft = defaults.string(forKey: "petCouncil.draft") ?? ""
        source = CouncilDraftSource(rawValue: defaults.string(forKey: "petCouncil.source") ?? "") ?? .text
    }
    var validationMessage: String? {
        if draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "함께 검토할 안건을 적어 주세요." }
        if draft.utf16.count > 4000 { return "안건은 4,000자까지 전달할 수 있어요. 원문은 그대로 보관돼요." }
        return nil
    }
    var canOpen: Bool { validationMessage == nil }
    func prepare(_ text: String, source: CouncilDraftSource) { draft = text; self.source = source }
    func handoffURL(baseURL: String) throws -> URL {
        guard canOpen, let base = URL(string: baseURL) else { throw HubDataError.invalidMemo }
        let origin = try HubTransport.validatedBaseURL(base)
        struct Source: Encodable { let kind: String }
        struct Payload: Encodable { let version: Int; let draft: String; let source: Source }
        let data = try JSONEncoder().encode(Payload(version: 1, draft: draft, source: Source(kind: source.rawValue)))
        let payload = data.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        guard payload.count + "#moonlight-council=".count <= 24000, var components = URLComponents(url: origin, resolvingAgainstBaseURL: false) else { throw HubDataError.invalidMemo }
        components.path = "/dashboard/agents/council"
        components.fragment = "moonlight-council=" + payload
        guard let url = components.url else { throw HubTransportError.rejectedURL }
        return url
    }
}
