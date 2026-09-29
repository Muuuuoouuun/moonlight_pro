import Foundation

struct LocalTask: Codable, Identifiable, Equatable, Sendable {
    var id: UUID
    var title: String
    var isDone: Bool
}
