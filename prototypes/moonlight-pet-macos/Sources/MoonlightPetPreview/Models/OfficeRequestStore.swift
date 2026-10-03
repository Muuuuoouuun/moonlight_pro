import Foundation
import Combine

/// Read-only request metadata and artifact bodies belong to the current operator session.
@MainActor
final class OfficeRequestStore: ObservableObject {
    @Published var scope: OfficeRequestScope = .personal { didSet { if scope != oldValue { resetSession() } } }
    @Published private(set) var items: [OfficeRequestSummary] = []
    @Published private(set) var selected: OfficeRequestSummary?
    @Published private(set) var detail: OfficeRequestDetail?
    @Published private(set) var hasMore = false
    @Published private(set) var isLoading = false
    @Published private(set) var isReading = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var detailErrorMessage: String?
    @Published private(set) var needsLogin = false
    @Published private(set) var isPreview = false
    @Published private(set) var hasConnection = false
    @Published private(set) var lastLoadedAt: Date?
    var isStale: Bool { lastLoadedAt != nil && (errorMessage != nil || isLoading) }

    private var service: (any HubOfficeRequestsServing)?
    private var origin: String?
    private var nextCursor: OfficeRequestCursor?
    private var sessionRevision = 0
    private var readRevision = 0
    private var listTask: Task<OfficeRequestPage, Error>?
    private var readTask: Task<OfficeRequestDetail, Error>?

    func configure(service: (any HubOfficeRequestsServing)?, origin: String?) {
        // Reconfiguration can represent logout/login on the same origin. Never
        // restore bodies or metadata left by the previous operator session.
        resetSession()
        self.service = service; self.origin = origin
        hasConnection = service != nil && origin?.isEmpty == false
    }
    func refresh() async { await load(append: false) }
    func loadMore() async {
        guard hasMore, nextCursor != nil else { return }
        await load(append: true)
    }
    func select(_ item: OfficeRequestSummary) {
        guard let current = items.first(where: { $0.id == item.id }), current == item else { return }
        guard selected != current else { return }
        invalidateRead()
        selected = current; detail = nil; detailErrorMessage = nil
    }
    func readSelected() async {
        guard !isReading, hasConnection, let service, let selected, selected.isReadable else { return }
        let ticket = sessionRevision, revision = readRevision
        isReading = true; detailErrorMessage = nil; detail = nil
        let task = Task { try await service.officeReceipt(selected) }
        readTask = task
        defer { if ticket == sessionRevision && revision == readRevision { isReading = false; readTask = nil } }
        do {
            let receipt = try await withTaskCancellationHandler(operation: { try await task.value }, onCancel: { task.cancel() })
            guard ticket == sessionRevision, revision == readRevision, self.selected == selected,
                  !task.isCancelled, !Task.isCancelled else { return }
            try receipt.validate(for: selected)
            self.selected = receipt.request
            if let index = items.firstIndex(where: { $0.id == receipt.request.id }) { items[index] = receipt.request }
            // A result can expire after the list read. Keep the revised state,
            // while withholding its previously generated body.
            detail = receipt; needsLogin = false
        } catch {
            guard ticket == sessionRevision, revision == readRevision, !Task.isCancelled else { return }
            if error is CancellationError { return }
            detailErrorMessage = error.localizedDescription
            if (error as? HubTransportError) == .unauthorized { needsLogin = true }
        }
    }
    func closeDetail() {
        invalidateRead()
        detail = nil; detailErrorMessage = nil
    }

    private func load(append: Bool) async {
        guard !isLoading, hasConnection, let service, origin != nil else { return }
        let ticket = sessionRevision, selectedScope = scope, cursor = append ? nextCursor : nil
        // Starting or canceling a retry does not recover a failed read. Keep
        // its failure visible until this session receives a verified page.
        isLoading = true
        let task = Task { try await service.officeInbox(scope: selectedScope, cursor: cursor) }
        listTask = task
        defer { if ticket == sessionRevision { isLoading = false; listTask = nil } }
        do {
            let page = try await withTaskCancellationHandler(operation: { try await task.value }, onCancel: { task.cancel() })
            guard ticket == sessionRevision, selectedScope == scope, !task.isCancelled, !Task.isCancelled else { return }
            try page.validate(scope: selectedScope, after: cursor)
            if append {
                guard Set(items.map(\.id)).isDisjoint(with: Set(page.items.map(\.id))),
                      items.last.map({ last in page.items.first.map { $0.isOlder(than: last) } ?? true }) ?? true else {
                    throw OfficeRequestError.invalidResponse
                }
                items.append(contentsOf: page.items)
            } else {
                items = page.items
                if let selected {
                    let current = items.first(where: { $0.id == selected.id })
                    if current != selected {
                        invalidateRead(); self.selected = current; detail = nil; detailErrorMessage = nil
                    }
                }
            }
            nextCursor = page.nextCursor; hasMore = page.hasMore
            lastLoadedAt = Date(); isPreview = false; needsLogin = false; errorMessage = nil
        } catch {
            guard ticket == sessionRevision, !Task.isCancelled else { return }
            if error is CancellationError { return }
            if (error as? OfficeRequestError) == .preview {
                invalidateRead(); items = []; selected = nil; detail = nil; detailErrorMessage = nil
                nextCursor = nil; hasMore = false; lastLoadedAt = nil; isPreview = true; needsLogin = false
            } else {
                isPreview = false
                if (error as? HubTransportError) == .unauthorized {
                    needsLogin = true; invalidateRead(); detail = nil
                }
            }
            errorMessage = error.localizedDescription
        }
    }
    private func invalidateRead() {
        readRevision += 1
        readTask?.cancel(); readTask = nil; isReading = false
    }
    private func resetSession() {
        sessionRevision += 1
        listTask?.cancel(); listTask = nil; isLoading = false
        invalidateRead()
        items = []; selected = nil; detail = nil; hasMore = false; nextCursor = nil
        errorMessage = nil; detailErrorMessage = nil; needsLogin = false; isPreview = false; lastLoadedAt = nil
    }
}
