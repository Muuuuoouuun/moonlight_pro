import Foundation
import Combine

/// Presentation-only grace period. The source remains responsible for persistence.
@MainActor
final class TaskCompletionFeedback: ObservableObject {
    private struct Entry {
        let id: UUID
        let preceding: Set<UUID>
        let following: Set<UUID>
        let token: UUID
        let timer: Task<Void, Never>
    }
    private var entries: [Entry] = []
    private let delay: Duration

    init(delay: Duration = .seconds(3)) { self.delay = delay }

    func retain(_ id: UUID, in order: [UUID]) {
        cancel(id)
        let token = UUID()
        let delay = delay
        let timer = Task { [weak self] in
            do { try await Task.sleep(for: delay) } catch { return }
            guard let self, self.entries.contains(where: { $0.token == token }) else { return }
            self.cancel(id)
        }
        objectWillChange.send()
        let position = order.firstIndex(of: id) ?? order.count
        entries.append(Entry(id: id, preceding: Set(order.prefix(position)),
                             following: Set(order.dropFirst(min(position + 1, order.count))), token: token, timer: timer))
    }

    func cancel(_ id: UUID) {
        guard entries.contains(where: { $0.id == id }) else { return }
        objectWillChange.send()
        entries.filter { $0.id == id }.forEach { $0.timer.cancel() }
        entries.removeAll { $0.id == id }
    }

    func reset() {
        objectWillChange.send()
        entries.forEach { $0.timer.cancel() }
        entries.removeAll()
    }

    func visible(in source: [LocalTask], includeCompleted: Bool) -> [LocalTask] {
        if includeCompleted { return source }
        var result = source.filter { !$0.isDone }
        for entry in entries.reversed() {
            guard let task = source.first(where: { $0.id == entry.id && $0.isDone }) else { continue }
            let position = result.firstIndex(where: { entry.following.contains($0.id) })
                ?? result.lastIndex(where: { entry.preceding.contains($0.id) }).map { $0 + 1 }
                ?? result.count
            result.insert(task, at: position)
        }
        return result
    }
}
