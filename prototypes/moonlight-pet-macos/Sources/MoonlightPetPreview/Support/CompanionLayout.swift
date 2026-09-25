import Foundation

/// Content sizes plus the native glass's eight-point shadow gutter.
enum CompanionLayout {
    static let glassRadius: CGFloat = 26
    static let gutter: CGFloat = 8
    static let perchSize: CGFloat = 72
    static let perchRise: CGFloat = 54
    static let perchInset: CGFloat = 20

    static func size(for mode: QuickMode, perched: Bool = true) -> CGSize {
        let rise = perched ? perchRise : 0
        switch mode {
        case .tasks: return CGSize(width: 336, height: 504 + rise)
        case .calendar: return CGSize(width: 336, height: 484 + rise)
        case .memo: return CGSize(width: 520, height: 386 + rise)
        case .office: return CGSize(width: 424, height: 296 + rise)
        case .council: return CGSize(width: 460, height: 460 + rise)
        case .notifications: return CGSize(width: 360, height: 480 + rise)
        case .focus: return CGSize(width: 380, height: 320 + rise)
        }
    }
}

enum CompanionDate {
    static func label(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.dateFormat = "M월 d일 EEEE"
        return formatter.string(from: date)
    }

    static func week(containing date: Date, calendar: Calendar = .current) -> [Date] {
        let day = calendar.startOfDay(for: date)
        let offset = (calendar.component(.weekday, from: day) + 5) % 7
        guard let monday = calendar.date(byAdding: .day, value: -offset, to: day) else { return [] }
        return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: monday) }
    }

    static func weekday(_ date: Date) -> String {
        ["일", "월", "화", "수", "목", "금", "토"][Calendar.current.component(.weekday, from: date) - 1]
    }
}
