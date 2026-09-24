import AppKit
import QuartzCore
import SwiftUI

// Native equivalents of DESIGN.md's hover, panel, and overlay motion tokens.
enum PetMotion {
    static let hoverDuration: TimeInterval = 0.12
    static let panelDuration: TimeInterval = 0.18
    static let overlayDuration: TimeInterval = 0.16

    static var reduceMotion: Bool { NSWorkspace.shared.accessibilityDisplayShouldReduceMotion }

    static var hover: Animation? { animation(duration: hoverDuration) }
    static var panel: Animation? { animation(duration: panelDuration) }
    static var overlay: Animation? { animation(duration: overlayDuration) }
    static var petPress: Animation? {
        reduceMotion ? nil : .interactiveSpring(response: 0.12, dampingFraction: 0.92, blendDuration: 0.04)
    }
    static var petRelease: Animation? {
        reduceMotion ? nil : .interactiveSpring(response: 0.21, dampingFraction: 0.82, blendDuration: 0.06)
    }
    static var petCharacter: Animation? { animation(duration: panelDuration) }

    static var timingFunction: CAMediaTimingFunction {
        CAMediaTimingFunction(controlPoints: 0.2, 0.7, 0.3, 1)
    }

    private static func animation(duration: TimeInterval) -> Animation? {
        reduceMotion ? nil : .timingCurve(0.2, 0.7, 0.3, 1, duration: duration)
    }
}

struct PetPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !PetMotion.reduceMotion ? 0.96 : 1)
            .opacity(configuration.isPressed ? 0.84 : 1)
            .animation(configuration.isPressed ? PetMotion.petPress : PetMotion.petRelease,
                       value: configuration.isPressed)
    }
}
