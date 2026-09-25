import Foundation

struct HubInquiry: Identifiable, Equatable, Sendable {
    let id: String
    let title: String
    let subtitle: String
    let updatedAt: Date?
    let path: String
    /// New inbound messages advance this identity; read/classification edits do not.
    let token: String
}

struct HubInquiryPage: Equatable, Sendable {
    let inquiries: [HubInquiry]
    /// Exact server count, independent of the bounded rows preview.
    let unreadCount: Int
}
