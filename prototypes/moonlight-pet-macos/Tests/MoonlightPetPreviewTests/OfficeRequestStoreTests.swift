import Foundation

private actor OfficeRequestGate: HubOfficeRequestsServing {
    private var lists: [CheckedContinuation<OfficeRequestPage, Error>] = []
    private var receipts: [CheckedContinuation<OfficeRequestDetail, Error>] = []
    private(set) var scopes: [OfficeRequestScope] = []
    private(set) var cursors: [OfficeRequestCursor?] = []
    private(set) var readItems: [OfficeRequestSummary] = []
    func officeInbox(scope: OfficeRequestScope, cursor: OfficeRequestCursor?) async throws -> OfficeRequestPage {
        scopes.append(scope); cursors.append(cursor)
        return try await withCheckedThrowingContinuation { lists.append($0) }
    }
    func officeReceipt(_ request: OfficeRequestSummary) async throws -> OfficeRequestDetail {
        readItems.append(request)
        return try await withCheckedThrowingContinuation { receipts.append($0) }
    }
    func finishList(_ page: OfficeRequestPage) { lists.removeFirst().resume(returning: page) }
    func failList(_ error: Error) { lists.removeFirst().resume(throwing: error) }
    func finishReceipt(_ detail: OfficeRequestDetail) { receipts.removeFirst().resume(returning: detail) }
    func failReceipt(_ error: Error) { receipts.removeFirst().resume(throwing: error) }
}

@MainActor func runOfficeRequestStoreTests() async throws -> Int {
    var count = 0
    let service = OfficeRequestGate(), store = OfficeRequestStore()
    try requestCheck(store.scope == .personal && store.items.isEmpty && !store.hasConnection && store.lastLoadedAt == nil, "Store starts with no fabricated data")
    store.configure(service: service, origin: "https://one.example")
    let first = try requestSummary(), second = try requestSummary(date: Date(timeIntervalSince1970: 1_790_899_200))
    let firstPage = OfficeRequestPage(items: [first], hasMore: true, nextCursor: try OfficeRequestCursor(createdAt: "2026-10-03T00:00:00Z", id: first.id))
    let load = Task { await store.refresh() }
    while await service.scopes.count < 1 { await Task.yield() }
    try requestCheck(store.isLoading, "Refresh exposes loading")
    await store.refresh()
    try requestCheck(await service.scopes.count == 1, "Duplicate refresh does not send a request")
    await service.finishList(firstPage); await load.value
    try requestCheck(store.items == [first] && store.hasMore && store.lastLoadedAt != nil && store.errorMessage == nil, "Successful metadata read sets freshness")
    count += 1

    let more = Task { await store.loadMore() }
    while await service.scopes.count < 2 { await Task.yield() }
    await store.loadMore()
    let moreCalls = await service.scopes.count, moreCursor = await service.cursors.last!
    try requestCheck(moreCalls == 2 && moreCursor == firstPage.nextCursor, "Duplicate pagination uses one stable cursor")
    await service.finishList(OfficeRequestPage(items: [second], hasMore: false, nextCursor: nil)); await more.value
    try requestCheck(store.items == [first, second] && !store.hasMore, "Pagination appends older requests")
    let stamp = store.lastLoadedAt
    let failure = Task { await store.refresh() }
    while await service.scopes.count < 3 { await Task.yield() }
    await service.failList(HubTransportError.offline); await failure.value
    try requestCheck(store.items == [first, second] && store.lastLoadedAt == stamp && store.errorMessage != nil && store.isStale, "Offline keeps last good metadata clearly stale")
    let retry = Task { await store.refresh() }
    while await service.scopes.count < 4 { await Task.yield() }
    try requestCheck(store.isStale && store.lastLoadedAt == stamp && store.items == [first, second], "Pending retry cannot relabel stale metadata as fresh")
    await service.failList(HubTransportError.offline); await retry.value
    count += 1

    store.select(first)
    let read = Task { await store.readSelected() }
    while await service.readItems.count < 1 { await Task.yield() }
    await store.readSelected()
    try requestCheck(await service.readItems.count == 1 && store.isReading, "Duplicate result reads do not issue multiple requests")
    store.select(second)
    await service.finishReceipt(OfficeRequestDetail(request: first, body: "첫 결과")); await read.value
    try requestCheck(store.selected == second && store.detail == nil && !store.isReading, "Late previous selection cannot open in current detail")
    let selectedRead = Task { await store.readSelected() }
    while await service.readItems.count < 2 { await Task.yield() }
    await service.finishReceipt(OfficeRequestDetail(request: second, body: "선택한 결과")); await selectedRead.value
    try requestCheck(store.detail?.body == "선택한 결과", "Verified selected result opens")
    store.closeDetail()
    try requestCheck(store.detail == nil && store.selected == second, "Back closes body and retains selection")
    count += 1

    let scopeLoad = Task { await store.refresh() }
    while await service.scopes.count < 5 { await Task.yield() }
    store.scope = .classin
    try requestCheck(store.items.isEmpty && store.selected == nil && store.detail == nil && store.lastLoadedAt == nil && !store.isLoading, "Scope change erases metadata and read state")
    await service.finishList(firstPage); await scopeLoad.value
    try requestCheck(store.items.isEmpty && store.errorMessage == nil, "Late personal metadata never enters company scope")
    let company = try requestSummary(scope: .classin)
    let companyLoad = Task { await store.refresh() }
    while await service.scopes.count < 6 { await Task.yield() }
    await service.finishList(OfficeRequestPage(items: [company], hasMore: false, nextCursor: nil)); await companyLoad.value
    store.select(company)
    let companyRead = Task { await store.readSelected() }
    while await service.readItems.count < 3 { await Task.yield() }
    store.configure(service: service, origin: "https://one.example")
    await service.finishReceipt(OfficeRequestDetail(request: company, body: "이전 로그인 결과")); await companyRead.value
    try requestCheck(store.items.isEmpty && store.selected == nil && store.detail == nil && store.lastLoadedAt == nil, "Same-origin reauthentication clears data and ignores prior receipt")
    count += 1

    let preview = Task { await store.refresh() }
    while await service.scopes.count < 7 { await Task.yield() }
    await service.failList(OfficeRequestError.preview); await preview.value
    try requestCheck(store.isPreview && store.items.isEmpty && store.lastLoadedAt == nil && !store.needsLogin, "Preview remains distinct from actual empty")
    let empty = Task { await store.refresh() }
    while await service.scopes.count < 8 { await Task.yield() }
    await service.finishList(OfficeRequestPage(items: [], hasMore: false, nextCursor: nil)); await empty.value
    try requestCheck(!store.isPreview && store.lastLoadedAt != nil && store.errorMessage == nil && store.items.isEmpty, "Actual empty read has a successful freshness stamp")
    let unauthorized = Task { await store.refresh() }
    while await service.scopes.count < 9 { await Task.yield() }
    await service.failList(HubTransportError.unauthorized); await unauthorized.value
    try requestCheck(store.needsLogin && store.errorMessage != nil, "Authentication failure has explicit login state")
    count += 1

    let initial = Task { await store.refresh() }
    while await service.scopes.count < 10 { await Task.yield() }
    await service.finishList(OfficeRequestPage(items: [company], hasMore: false, nextCursor: nil)); await initial.value
    store.select(company)
    let wrongRead = Task { await store.readSelected() }
    while await service.readItems.count < 4 { await Task.yield() }
    await service.finishReceipt(OfficeRequestDetail(request: first, body: "다른 요청")); await wrongRead.value
    try requestCheck(store.detail == nil && store.detailErrorMessage != nil && store.items == [company], "Foreign receipt never opens and preserves metadata")
    let readFailure = Task { await store.readSelected() }
    while await service.readItems.count < 5 { await Task.yield() }
    await service.failReceipt(HubTransportError.unauthorized); await readFailure.value
    try requestCheck(store.needsLogin && store.detailErrorMessage != nil, "Receipt authentication failure routes to login")
    count += 1

    let cancel = Task { await store.refresh() }
    while await service.scopes.count < 11 { await Task.yield() }
    cancel.cancel(); await service.finishList(OfficeRequestPage(items: [], hasMore: false, nextCursor: nil)); await cancel.value
    try requestCheck(store.items == [company] && !store.isLoading, "Canceled caller never replaces last good inbox")
    store.configure(service: nil, origin: nil)
    await store.refresh(); await store.readSelected(); await store.loadMore()
    try requestCheck(!store.hasConnection && store.items.isEmpty && store.lastLoadedAt == nil && store.detail == nil && !store.isLoading, "Disconnected store cannot load or retain authenticated data")
    count += 1

    let retryService = OfficeRequestGate(), retryStore = OfficeRequestStore()
    retryStore.configure(service: retryService, origin: "https://retry.example")
    let retryInitial = Task { await retryStore.refresh() }
    while await retryService.scopes.count < 1 { await Task.yield() }
    await retryService.finishList(firstPage); await retryInitial.value
    let retryStamp = retryStore.lastLoadedAt
    let failedRefresh = Task { await retryStore.refresh() }
    while await retryService.scopes.count < 2 { await Task.yield() }
    await retryService.failList(HubTransportError.offline); await failedRefresh.value
    let priorError = retryStore.errorMessage
    try requestCheck(priorError != nil && retryStore.isStale, "Retry cancellation test begins with a known read failure")

    let canceledRetry = Task { await retryStore.refresh() }
    while await retryService.scopes.count < 3 { await Task.yield() }
    canceledRetry.cancel()
    await retryService.finishList(OfficeRequestPage(items: [], hasMore: false, nextCursor: nil)); await canceledRetry.value
    try requestCheck(retryStore.items == [first] && retryStore.lastLoadedAt == retryStamp && !retryStore.isLoading,
                     "Canceled refresh keeps the last verified metadata and timestamp")
    try requestCheck(retryStore.errorMessage == priorError && retryStore.isStale,
                     "Canceled retry cannot erase the earlier read failure or mark its metadata fresh")
    count += 1

    let canceledAppend = Task { await retryStore.loadMore() }
    while await retryService.scopes.count < 4 { await Task.yield() }
    canceledAppend.cancel(); await retryService.failList(CancellationError()); await canceledAppend.value
    try requestCheck(retryStore.items == [first] && retryStore.lastLoadedAt == retryStamp && retryStore.hasMore && !retryStore.isLoading,
                     "Canceled pagination preserves metadata, timestamp and its remaining cursor")
    try requestCheck(retryStore.errorMessage == priorError && retryStore.isStale,
                     "Canceled pagination cannot erase the earlier read failure or mark its metadata fresh")
    let recovered = Task { await retryStore.refresh() }
    while await retryService.scopes.count < 5 { await Task.yield() }
    await retryService.finishList(firstPage); await recovered.value
    try requestCheck(retryStore.errorMessage == nil && !retryStore.isStale,
                     "Only a verified successful retry clears the read failure")
    count += 1
    return count
}
