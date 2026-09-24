import SwiftUI

final class PetInteraction: ObservableObject {
    @Published var isHovered = false
    @Published var isPressed = false
}

struct PetPortrait: View {
    let character: PetCharacter
    let size: CGFloat

    var body: some View {
        Group {
            if let artwork = character.artwork {
                Image(nsImage: artwork)
                    .resizable()
                    .scaledToFill()
            } else {
                Circle().fill(Palette.surface)
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.18))
        .accessibilityLabel("\(character.title) 펫")
    }
}

struct PetVisual: View {
    @ObservedObject var model: AppModel
    @ObservedObject var interaction: PetInteraction

    private var motionState: Int {
        interaction.isPressed ? 2 : interaction.isHovered ? 1 : 0
    }

    private var scale: CGFloat {
        guard !PetMotion.reduceMotion else { return 1 }
        if interaction.isPressed { return 0.96 }
        return interaction.isHovered ? 1.035 : 1
    }

    var body: some View {
        PetPortrait(character: model.selectedCharacter, size: 54)
            .scaleEffect(scale)
            .offset(y: !PetMotion.reduceMotion && interaction.isHovered && !interaction.isPressed ? -1 : 0)
            .frame(width: 56, height: 56)
            .animation(PetMotion.hover, value: motionState)
            .accessibilityLabel("Moonlight \(model.selectedCharacter.title) 펫, 누르면 빠른 기능, 우클릭하면 캐릭터 선택")
    }
}
