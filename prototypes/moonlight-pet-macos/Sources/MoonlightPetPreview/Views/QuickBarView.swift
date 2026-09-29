import SwiftUI

struct QuickBarView: View {
    @ObservedObject var model: AppModel
    let close: () -> Void
    let modeChanged: () -> Void
    let startFocus: () -> Void
    let pin: () -> Void
    let moveVertically: (CGFloat) -> Void

    var body: some View {
        CompanionPanelView(model: model, mode: $model.mode, persistent: false,
                           openRevision: model.quickOpenRevision, close: close,
                           modeChanged: modeChanged, startFocus: startFocus,
                           pin: pin, moveVertically: moveVertically)
    }
}
