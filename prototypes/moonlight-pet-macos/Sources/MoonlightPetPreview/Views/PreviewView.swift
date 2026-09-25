import SwiftUI

struct PreviewView: View {
    @ObservedObject var model: AppModel
    let openBar: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            PetPortrait(character: model.selectedCharacter, size: 42, pose: .portrait)
            VStack(alignment: .leading, spacing: 9) {
                Text("Moonlight")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Palette.glassInkFaint)
                Text(model.previewText)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Palette.glassInk)
                    .lineLimit(2)
                Button("빠른 기능 열기", action: openBar)
                    .buttonStyle(.plain)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Palette.glassInkMuted)
            }
            .modifier(GlassReadability(radius: 12, inset: 6))
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
