import SwiftUI

final class PetInteraction: ObservableObject {
    @Published var isHovered = false
    @Published var isPressed = false
    @Published var isDragging = false
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
        if interaction.isDragging { return 3 }
        if interaction.isPressed { return 2 }
        return interaction.isHovered ? 1 : 0
    }

    private var scale: CGFloat {
        guard !PetMotion.reduceMotion else { return 1 }
        if interaction.isPressed { return 0.93 }
        if interaction.isDragging { return 0.97 }
        return interaction.isHovered ? 1.04 : 1
    }

    private var isLifted: Bool {
        !PetMotion.reduceMotion && interaction.isHovered && !interaction.isPressed && !interaction.isDragging
    }

    private var verticalOffset: CGFloat {
        guard !PetMotion.reduceMotion else { return 0 }
        if interaction.isPressed { return 1 }
        return isLifted ? -0.7 : 0
    }

    var body: some View {
        ZStack {
            PetPortrait(character: model.selectedCharacter, size: 52)
                .id(model.selectedCharacter)
                .transition(.opacity.combined(with: .scale(scale: 0.94)))
        }
        .scaleEffect(scale)
        .rotationEffect(.degrees(isLifted ? -1.2 : 0))
        .offset(x: isLifted ? -0.7 : 0, y: verticalOffset)
        .frame(width: 56, height: 56)
        .animation(interaction.isPressed ? PetMotion.petPress : PetMotion.petRelease, value: motionState)
        .animation(PetMotion.petCharacter, value: model.selectedCharacter)
        .accessibilityLabel("Moonlight \(model.selectedCharacter.title) 펫, 누르면 빠른 기능, 우클릭하면 캐릭터 선택")
    }
}
