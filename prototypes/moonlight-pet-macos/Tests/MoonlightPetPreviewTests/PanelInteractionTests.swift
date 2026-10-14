import Foundation
#if canImport(CoreGraphics)
import CoreGraphics
#endif

@main
enum PanelInteractionTests {
    static func main() throws {
        var checks = 0
        func check(_ condition: Bool, _ message: String) {
            precondition(condition, message)
            checks += 1
        }
        var drag = ScreenDragTracker()
        drag.begin(at: CGPoint(x: 1900, y: 400))
        check(drag.translation(to: CGPoint(x: 1901, y: 401)) == nil, "A click must not become a drag")
        check(drag.translation(to: CGPoint(x: 1904, y: 400)) == CGPoint(x: 4, y: 0), "Horizontal motion was discarded")
        check(drag.translation(to: CGPoint(x: 1904.5, y: 400.5)) == CGPoint(x: 0.5, y: 0.5), "Slow drag must stay continuous")
        check(drag.translation(to: CGPoint(x: 2050, y: 300)) == CGPoint(x: 145.5, y: -100.5), "Cross-screen motion lost an axis")
        drag.end()
        check(!drag.isDragging && drag.translation(to: .zero) == nil, "Mouse-up must release the drag")

        let landscape = PanelDisplay(id: 1, frame: CGRect(x: 0, y: 0, width: 1920, height: 1080),
                                     visibleFrame: CGRect(x: 0, y: 78, width: 1920, height: 972))
        let portrait = PanelDisplay(id: 2, frame: CGRect(x: 1920, y: -228, width: 1080, height: 1920),
                                    visibleFrame: CGRect(x: 1920, y: -228, width: 1080, height: 1920))
        let left = PanelDisplay(id: 3, frame: CGRect(x: -1440, y: 0, width: 1440, height: 900),
                                visibleFrame: CGRect(x: -1440, y: 24, width: 1440, height: 876))
        let above = PanelDisplay(id: 4, frame: CGRect(x: 0, y: 1080, width: 1600, height: 900),
                                 visibleFrame: CGRect(x: 0, y: 1080, width: 1600, height: 870))
        let screens = [landscape, portrait, left, above]
        // Both the idle icon and its panel must stay on the selected edge through
        // narrow/wide mode changes and displays with negative/global coordinates.
        for display in screens {
            let visible = display.visibleFrame
            for edge in PanelEdge.allCases {
                let icon = PanelGeometry.edgeAligned(CGRect(x: visible.midX, y: visible.midY, width: 56, height: 56),
                                                     edge: edge, in: visible)
                check(edge == .left ? icon.minX == visible.minX + 8 : icon.maxX == visible.maxX - 8,
                      "Enabling alignment must immediately attach the idle icon")
                for perched in [true, false] {
                    var previous = CGRect(x: visible.midX, y: visible.maxY - 600, width: 336, height: 558)
                    for size in [CGSize(width: 336, height: 558), CGSize(width: 520, height: 440), CGSize(width: 336, height: 538)] {
                        let resized = PanelGeometry.resizedKeepingTopRight(previous, size: size, in: visible)
                        let aligned = PanelGeometry.edgeAligned(resized, edge: edge,
                            outsidePet: perched ? nil : icon.size, in: visible)
                        let pet = PanelGeometry.pet(size: icon.size, companion: aligned, perched: perched, edge: edge, in: visible)
                        check(visible.insetBy(dx: 8, dy: 8).contains(aligned) && visible.insetBy(dx: 8, dy: 8).contains(pet),
                              "Alignment must keep the icon and panel reachable")
                        check(edge == .left ? pet.minX == visible.minX + 8 : pet.maxX == visible.maxX - 8,
                              "The icon must stay on the chosen outside edge after a mode switch")
                        check(aligned.maxY == previous.maxY, "A mode switch must retain the panel's top")
                        check(perched || !aligned.intersects(pet), "Quick-panel icon must not overlap the content")
                        check(PanelGeometry.edgeAligned(aligned, edge: edge, outsidePet: perched ? nil : icon.size, in: visible) == aligned,
                              "Repeated alignment must not drift")
                        previous = aligned
                    }
                }
            }
        }
        for (point, id) in [(CGPoint(x: 100, y: 400), UInt32(1)), (CGPoint(x: 2050, y: -100), 2),
                            (CGPoint(x: -900, y: 300), 3), (CGPoint(x: 400, y: 1500), 4)] {
            check(PanelGeometry.display(at: point, in: screens)?.id == id, "Incorrect destination screen")
        }
        check(PanelGeometry.display(at: CGPoint(x: -100, y: 1000), in: [landscape, left])?.id == 1,
              "Screen gaps must choose the nearest actual screen")
        check(PanelGeometry.display(at: .zero, in: []) == nil, "No-screen transition must be safe")
        let crossing = CGRect(x: 1880, y: 250, width: 336, height: 558)
        check(PanelGeometry.display(for: crossing, in: screens)?.id == 2, "A moved panel must not retain the old screen")
        let dropped = PanelGeometry.fitted(crossing, in: portrait.visibleFrame)
        check(portrait.visibleFrame.insetBy(dx: 8, dy: 8).contains(dropped), "Drop must be reachable on the new display")
        let memo = PanelGeometry.resizedKeepingTopRight(dropped, size: CGSize(width: 520, height: 440), in: portrait.visibleFrame)
        check(memo.maxY == dropped.maxY && portrait.visibleFrame.contains(memo), "Mode resize lost its display/vertical anchor")
        for perched in [true, false] {
            let frame = CGRect(x: 2220, y: 400, width: 520, height: 440)
            let anchor = PanelGeometry.pet(size: CGSize(width: 56, height: 56), companion: frame,
                                           perched: perched, in: portrait.visibleFrame)
            let reopened = PanelGeometry.companion(size: frame.size, pet: anchor,
                                                    perched: perched, in: portrait.visibleFrame)
            check(reopened == frame, "Closing/reopening a quick memo or widget must not drift")
        }

        let small = PanelDisplay(id: 5, frame: CGRect(x: 0, y: 0, width: 320, height: 240),
                                 visibleFrame: CGRect(x: 0, y: 24, width: 320, height: 216))
        for edge in PanelEdge.allCases {
            for perched in [true, false] {
                let frame = PanelGeometry.edgeAligned(CGRect(x: -100, y: -100, width: 520, height: 1300),
                    edge: edge, outsidePet: perched ? nil : CGSize(width: 56, height: 56), in: small.visibleFrame)
                let icon = PanelGeometry.pet(size: CGSize(width: 56, height: 56), companion: frame,
                                             perched: perched, edge: edge, in: small.visibleFrame)
                check(small.visibleFrame.insetBy(dx: 8, dy: 8).contains(frame)
                      && small.visibleFrame.insetBy(dx: 8, dy: 8).contains(icon),
                      "A narrow display must fit oversized aligned panels and icons")
                check(perched || !frame.intersects(icon), "A narrow display must reserve the separate icon's space")
            }
        }
        for display in screens + [small] {
            for size in [CGSize(width: 336, height: 504), CGSize(width: 520, height: 386),
                         CGSize(width: 460, height: 580), CGSize(width: 336, height: 1300)] {
                for x in [display.visibleFrame.minX + 8, display.visibleFrame.midX - size.width / 2,
                          display.visibleFrame.maxX - size.width - 8] {
                    for y in [display.visibleFrame.minY + 8, display.visibleFrame.midY - size.height / 2,
                              display.visibleFrame.maxY - size.height - 8] {
                        let frame = PanelGeometry.fitted(CGRect(origin: CGPoint(x: x, y: y), size: size), in: display.visibleFrame)
                        let pet = PanelGeometry.pet(size: CGSize(width: 56, height: 56), companion: frame,
                                                    perched: false, in: display.visibleFrame)
                        let anchor = try JSONDecoder().decode(CompanionAnchor.self,
                            from: JSONEncoder().encode(CompanionAnchor(companion: frame, pet: pet)))
                        let reopened = PanelGeometry.companion(size: size, pet: pet, perched: false,
                                                              anchor: anchor, in: display.visibleFrame)
                        check(reopened == frame, "Quick panel must retain both axes at every screen edge, including fitted/tall panels")
                    }
                }
            }
        }

        let pet = CGRect(x: 2830, y: 800, width: 56, height: 56)
        let saved = SavedPetPlacement(frame: pet, display: portrait)
        let restored = try JSONDecoder().decode(SavedPetPlacement.self, from: JSONEncoder().encode(saved))
        check(restored.restored(size: pet.size, displays: screens) == pet, "Relaunch must restore the saved position")
        let unplugged = restored.restored(size: pet.size, displays: [landscape])!
        check(landscape.visibleFrame.insetBy(dx: 8, dy: 8).contains(unplugged), "Unplugging must recover the pet onto a live display")
        check(restored.restored(size: pet.size, displays: screens) == pet, "Reconnect must retain the preferred display")
        let smaller = PanelDisplay(id: portrait.id, frame: CGRect(x: 1920, y: 0, width: 720, height: 1280),
                                   visibleFrame: CGRect(x: 1920, y: 70, width: 720, height: 1180))
        let resized = restored.restored(size: pet.size, displays: [landscape, smaller])!
        check(smaller.visibleFrame.insetBy(dx: 8, dy: 8).contains(resized), "Resolution/Dock changes must keep the pet reachable")
        let normalized = SavedPetPlacement(frame: resized, display: smaller)
        check(abs(normalized.x - saved.x) < 0.00001 && abs(normalized.y - saved.y) < 0.00001,
              "Display changes must preserve proportional position")
        check(restored.restored(size: pet.size, displays: []) == nil, "Restoration must tolerate no active displays")
        let quick = CGRect(x: 1576, y: 300, width: 336, height: 504)
        let quickPet = PanelGeometry.pet(size: pet.size, companion: quick, perched: false, in: landscape.visibleFrame)
        let anchor = CompanionAnchor(companion: quick, pet: quickPet)
        let quickSaved = SavedPetPlacement(frame: quickPet, display: landscape, companionAnchor: anchor)
        let quickRestored = try JSONDecoder().decode(SavedPetPlacement.self, from: JSONEncoder().encode(quickSaved))
        check(quickRestored.companionAnchor == anchor, "Relaunch must retain quick-panel side and gap")
        let restartedQuick = PanelGeometry.companion(size: quick.size,
            pet: quickRestored.restored(size: pet.size, displays: screens)!, perched: false,
            anchor: quickRestored.companionAnchor, in: landscape.visibleFrame)
        check(abs(restartedQuick.minX - quick.minX) < 0.00001 && abs(restartedQuick.minY - quick.minY) < 0.00001,
              "Relaunch and reopen must restore the same quick-panel position")
        let legacy = try JSONSerialization.jsonObject(with: JSONEncoder().encode(saved)) as! [String: Any]
        let legacyData = try JSONSerialization.data(withJSONObject: legacy.filter { $0.key != "companionAnchor" })
        let legacySaved = try JSONDecoder().decode(SavedPetPlacement.self, from: legacyData)
        check(legacySaved.companionAnchor == nil && legacySaved.restored(size: pet.size, displays: screens) == pet,
              "Existing saved placements without a companion anchor must still restore")
        print("PASS: \(checks) panel interaction checks (2D drag, portrait/negative/stacked displays, release, resize, restart, disconnect/reconnect)")
    }
}
