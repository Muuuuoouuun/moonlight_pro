import Foundation

private struct CompletionFailure: Error { let message: String }
@MainActor
func runTaskCompletionFeedbackTests() async throws -> Int {
    func check(_ condition: Bool, _ message: String) throws {
        if !condition { throw CompletionFailure(message: message) }
    }
    let first = LocalTask(id: UUID(), title: "첫 항목", isDone: false)
    let second = LocalTask(id: UUID(), title: "둘째 항목", isDone: false)
    var done = first; done.isDone = true
    let feedback = TaskCompletionFeedback(delay: .milliseconds(80))
    feedback.retain(first.id, in: [first.id, second.id])
    // Hub sorts completed rows last; presentation must keep the clicked row in place.
    try check(feedback.visible(in: [second, done], includeCompleted: false).map(\.id) == [first.id, second.id], "Completed row moved before grace period")
    try await Task.sleep(for: .milliseconds(120))
    try check(feedback.visible(in: [second, done], includeCompleted: false) == [second], "Completed row did not disappear")
    try check(feedback.visible(in: [second, done], includeCompleted: true) == [second, done], "Completed record must remain recoverable")
    feedback.retain(first.id, in: [first.id, second.id])
    feedback.cancel(first.id)
    try check(feedback.visible(in: [first, second], includeCompleted: false) == [first, second], "Undo lost source row")
    try await Task.sleep(for: .milliseconds(50))
    feedback.retain(first.id, in: [first.id, second.id])
    try await Task.sleep(for: .milliseconds(45))
    try check(feedback.visible(in: [second, done], includeCompleted: false).count == 2, "Cancelled timer hid a newer completion")
    feedback.reset()
    try check(feedback.visible(in: [second, done], includeCompleted: false) == [second], "Source switch retained old completion")
    feedback.retain(first.id, in: [first.id, second.id])
    try check(feedback.visible(in: [second], includeCompleted: false) == [second], "Deleted row was resurrected")
    feedback.reset()
    // Expiring one completed sibling must not move another below its next neighbor.
    let third = LocalTask(id: UUID(), title: "셋째 항목", isDone: false)
    var doneSecond = second; doneSecond.isDone = true
    let order = [first.id, second.id, third.id]
    feedback.retain(first.id, in: order)
    feedback.retain(second.id, in: order)
    feedback.cancel(first.id)
    try check(feedback.visible(in: [third, done, doneSecond], includeCompleted: false).map(\.id) == [second.id, third.id], "Sibling expiry reordered the retained row")
    let inserted = LocalTask(id: UUID(), title: "추가 항목", isDone: false)
    try check(feedback.visible(in: [inserted, third, doneSecond], includeCompleted: false).map(\.id) == [inserted.id, second.id, third.id], "New input displaced the original neighbor relationship")
    feedback.reset()
    return 8
}
