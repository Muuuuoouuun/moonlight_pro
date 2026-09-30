import Foundation
import CoreGraphics

/// Focus and text editing do not latch the transient character wash on.
struct GlassPressState {
    private enum Phase { case idle, pressed, dragging }
    private var phase = Phase.idle
    mutating func press() {
        if phase == .idle { phase = .pressed }
    }
    // A drag may originate in the separate pet window, without a local press.
    mutating func drag() { phase = .dragging }
    mutating func release() { phase = .idle }
    func showsTint(accessibilityRequiresSolid: Bool) -> Bool {
        accessibilityRequiresSolid || phase != .idle
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

    mutating func translation(to point: CGPoint) -> CGPoint? {
        guard let previous else { return nil }
        if !isDragging {
            guard hypot(point.x - previous.x, point.y - previous.y) >= 3 else { return nil }
            isDragging = true
        }
        self.previous = point
        return CGPoint(x: point.x - previous.x, y: point.y - previous.y)
    }

    mutating func end() {
        previous = nil
        isDragging = false
    }
}

enum PanelMove {
    case drag(delta: CGPoint, pointer: CGPoint)
    case finish(pointer: CGPoint)
    case nudge(CGPoint)
    case nextDisplay
}

struct PanelDisplay: Equatable {
    let id: UInt32
    let frame: CGRect
    let visibleFrame: CGRect
}

/// Display-relative coordinates survive resolution/Dock changes. Keep the preferred
/// display while it is disconnected; only an explicit move changes that preference.
struct SavedPetPlacement: Codable {
    let displayID: UInt32
    let visibleFrame: CGRect
    let x: CGFloat
    let y: CGFloat

    init(frame: CGRect, display: PanelDisplay) {
        displayID = display.id
        visibleFrame = display.visibleFrame
        let safe = visibleFrame.insetBy(dx: 8, dy: 8)
        x = min(1, max(0, (frame.minX - safe.minX) / max(1, safe.width - frame.width)))
        y = min(1, max(0, (frame.minY - safe.minY) / max(1, safe.height - frame.height)))
    }

    func restored(size: CGSize, displays: [PanelDisplay]) -> CGRect? {
        guard x.isFinite, y.isFinite,
              let display = displays.first(where: { $0.id == displayID })
                ?? PanelGeometry.display(at: CGPoint(x: visibleFrame.midX, y: visibleFrame.midY), in: displays) else { return nil }
        let safe = display.visibleFrame.insetBy(dx: 8, dy: 8)
        return PanelGeometry.fitted(CGRect(
            x: safe.minX + x * max(0, safe.width - size.width),
            y: safe.minY + y * max(0, safe.height - size.height),
            width: size.width, height: size.height
        ), in: display.visibleFrame)
    }
}

enum PanelGeometry {
    static func companion(size: CGSize, pet: CGRect, perched: Bool, in visible: CGRect) -> CGRect {
        if perched {
            return fitted(CGRect(x: pet.maxX - size.width, y: pet.maxY - size.height,
                                 width: size.width, height: size.height), in: visible)
        }
        let leftRoom = pet.minX - visible.minX
        let rightRoom = visible.maxX - pet.maxX
        let x = leftRoom >= size.width + 10 || leftRoom >= rightRoom
            ? pet.minX - size.width - 10 : pet.maxX + 10
        return fitted(CGRect(x: x, y: pet.midY - size.height / 2,
                             width: size.width, height: size.height), in: visible)
    }

    static func pet(size: CGSize, companion: CGRect, perched: Bool, in visible: CGRect) -> CGRect {
        let origin = perched
            ? CGPoint(x: companion.maxX - size.width, y: companion.maxY - size.height)
            : CGPoint(x: companion.maxX + size.width + 10 <= visible.maxX - 8
                ? companion.maxX + 10 : companion.minX - size.width - 10,
                      y: companion.midY - size.height / 2)
        return fitted(CGRect(origin: origin, size: size), in: visible)
    }

    static func display(at point: CGPoint, in displays: [PanelDisplay]) -> PanelDisplay? {
        displays.first(where: { $0.frame.contains(point) }) ?? displays.min {
            distance(from: point, to: $0.frame) < distance(from: point, to: $1.frame)
        }
    }

    static func display(for frame: CGRect, in displays: [PanelDisplay]) -> PanelDisplay? {
        let overlapping = displays.max {
            overlap(frame, $0.frame) < overlap(frame, $1.frame)
        }
        if let overlapping, overlap(frame, overlapping.frame) > 0 { return overlapping }
        return display(at: CGPoint(x: frame.midX, y: frame.midY), in: displays)
    }

    private static func overlap(_ a: CGRect, _ b: CGRect) -> CGFloat {
        let intersection = a.intersection(b)
        return intersection.isNull ? 0 : intersection.width * intersection.height
    }

    private static func distance(from point: CGPoint, to rect: CGRect) -> CGFloat {
        hypot(max(rect.minX - point.x, 0, point.x - rect.maxX),
              max(rect.minY - point.y, 0, point.y - rect.maxY))
    }

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
