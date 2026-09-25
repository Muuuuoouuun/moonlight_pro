import SwiftUI

/// A shared count badge for the desktop pet and its speech bubble.
struct NotificationCountBadge: View {
    let count: Int

    var body: some View {
        if count > 0 {
            Text(count > 99 ? "99+" : String(count))
                .font(.system(size: 10.5, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(.white)
                .padding(.horizontal, 4)
                .frame(minWidth: 18, minHeight: 18)
                .background(Color(nsColor: .systemRed), in: Capsule())
                .fixedSize()
                .allowsHitTesting(false)
                .accessibilityLabel("알림 \(count)개")
        }
    }
}
