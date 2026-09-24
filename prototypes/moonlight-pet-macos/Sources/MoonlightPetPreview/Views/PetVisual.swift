import SwiftUI

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
        .clipShape(Circle())
        .overlay(Circle().stroke(Palette.line, lineWidth: 1))
        .accessibilityLabel("\(character.title) 펫")
    }
}

struct PetVisual: View {
    @ObservedObject var model: AppModel

    var body: some View {
        PetPortrait(character: model.selectedCharacter, size: 72)
            .frame(width: 72, height: 72)
            .accessibilityLabel("Moonlight \(model.selectedCharacter.title) 펫, 한 번 누르면 메시지, 두 번 누르면 빠른 기능, 우클릭하면 캐릭터 선택")
    }
}
