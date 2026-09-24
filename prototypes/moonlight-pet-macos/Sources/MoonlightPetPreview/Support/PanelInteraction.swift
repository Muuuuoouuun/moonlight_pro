import Foundation

/// Focus and text editing do not latch the transient character wash on.
struct GlassPressState {
    private var pressed = false
    mutating func press() { pressed = true }
    mutating func release() { pressed = false }
    func showsTint(accessibilityRequiresSolid: Bool) -> Bool {
        accessibilityRequiresSolid || pressed
    }
}

/// Screen coordinates stay stable while the window underneath the pointer moves.
struct ScreenDragTracker {
    private var previous: CGPoint?
    private(set) var isDragging = false

    mutating func begin(at point: CGPoint) {
        previous = point
        isDragging = false
    }

    mutating func translation(to point: CGPoint) -> CGFloat? {
        guard let previous else { return nil }
        if !isDragging {
            guard hypot(point.x - previous.x, point.y - previous.y) >= 3 else { return nil }
            isDragging = true
        }
        self.previous = point
        return point.y - previous.y
    }

    mutating func end() {
        previous = nil
        isDragging = false
    }
}

enum PanelGeometry {
    static func fitted(_ frame: CGRect, in visible: CGRect) -> CGRect {
        let safe = visible.insetBy(dx: 8, dy: 8)
        var result = frame
        result.size.width = min(frame.width, max(1, safe.width))
        result.size.height = min(frame.height, max(1, safe.height))
        result.origin.x = min(max(frame.minX, safe.minX), safe.maxX - result.width)
        result.origin.y = min(max(frame.minY, safe.minY), safe.maxY - result.height)
        return result
    }

    static func resizedKeepingTopRight(_ frame: CGRect, size: CGSize, in visible: CGRect) -> CGRect {
        fitted(CGRect(x: frame.maxX - size.width, y: frame.maxY - size.height,
                      width: size.width, height: size.height), in: visible)
    }
}
