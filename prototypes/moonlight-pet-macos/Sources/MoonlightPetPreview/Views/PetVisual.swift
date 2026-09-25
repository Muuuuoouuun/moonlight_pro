import SwiftUI

final class PetInteraction: ObservableObject {
    @Published var isHovered = false
    @Published var isPressed = false
    @Published var isDragging = false
}

enum PetPose { case portrait, perched }

struct PetPortrait: View {
    let character: PetCharacter
    let size: CGFloat
    var pose: PetPose = .perched

    var body: some View {
        Group {
            if let artwork = pose == .portrait ? character.portraitArtwork : character.artwork {
                Image(nsImage: artwork)
                    .resizable()
                    .interpolation(.high)
                    .scaledToFit()
            } else {
                Image(systemName: "pawprint.fill").foregroundStyle(Palette.moon300)
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: pose == .portrait ? 10 : 0))
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
            PetPortrait(character: model.selectedCharacter, size: 52, pose: .portrait)
                .id(model.selectedCharacter)
                .transition(.opacity.combined(with: .scale(scale: 0.94)))
        }
        .overlay(alignment: .topTrailing) {
            NotificationCountBadge(count: model.activity.unreadCount)
                .accessibilityHidden(true)
        }
        .scaleEffect(scale)
        .rotationEffect(.degrees(isLifted ? -1.2 : 0))
        .offset(x: isLifted ? -0.7 : 0, y: verticalOffset)
        .frame(width: 56, height: 56)
        .animation(interaction.isPressed ? PetMotion.petPress : PetMotion.petRelease, value: motionState)
        .animation(PetMotion.petCharacter, value: model.selectedCharacter)
        .accessibilityLabel("Moonlight \(model.selectedCharacter.title) 펫, 누르면 빠른 기능, 우클릭하면 캐릭터 선택")
        .accessibilityValue("알림 \(model.activity.unreadCount)개")
    }
}

/// The expanded panel uses the hands-on-edge pose; the idle desktop icon uses its original portrait.
struct PanelPetOrnament: View {
    @ObservedObject var model: AppModel
    let close: () -> Void

    var body: some View {
        Button(action: close) {
            PetPortrait(character: model.selectedCharacter, size: CompanionLayout.perchSize)
                .contentShape(Rectangle())
        }
        .buttonStyle(PetPressStyle())
        .accessibilityLabel("펫으로 접기")
        .help("펫으로 접기")
    }
}
