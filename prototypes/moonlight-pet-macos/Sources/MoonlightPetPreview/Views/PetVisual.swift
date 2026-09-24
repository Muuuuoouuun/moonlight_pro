import SwiftUI

struct PetVisual: View {
    var body: some View {
        ZStack {
            Circle()
                .fill(Palette.surface)
                .overlay(Circle().stroke(Palette.line.opacity(0.8), lineWidth: 1))

            Ellipse()
                .fill(Palette.moon300)
                .frame(width: 12, height: 18)
                .rotationEffect(.degrees(-24))
                .offset(x: -14, y: -17)
            Ellipse()
                .fill(Palette.moon300)
                .frame(width: 12, height: 18)
                .rotationEffect(.degrees(24))
                .offset(x: 14, y: -17)

            Ellipse()
                .fill(Palette.moon300)
                .frame(width: 39, height: 35)
                .offset(y: 5)

            HStack(spacing: 12) {
                Circle().fill(Palette.bg).frame(width: 3, height: 4)
                Circle().fill(Palette.bg).frame(width: 3, height: 4)
            }
            .offset(y: 3)
            Capsule()
                .fill(Palette.bg)
                .frame(width: 7, height: 2)
                .offset(y: 12)
        }
        .frame(width: 58, height: 58)
        .accessibilityLabel("Moonlight 펫, 한 번 누르면 미리보기, 두 번 누르면 빠른 기능")
    }
}
