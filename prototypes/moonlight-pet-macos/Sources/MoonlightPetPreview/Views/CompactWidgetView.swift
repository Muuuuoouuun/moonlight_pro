import SwiftUI

struct CompactWidgetView: View {
    @ObservedObject var model: AppModel
    let collapse: () -> Void
    let modeChanged: () -> Void
    let moveVertically: (CGFloat) -> Void
    let startFocus: () -> Void

    var body: some View {
        CompanionPanelView(model: model, mode: $model.compactMode, persistent: true,
                           openRevision: model.compactOpenRevision, close: collapse,
                           modeChanged: modeChanged, startFocus: startFocus,
                           pin: nil, moveVertically: moveVertically)
    }
}
