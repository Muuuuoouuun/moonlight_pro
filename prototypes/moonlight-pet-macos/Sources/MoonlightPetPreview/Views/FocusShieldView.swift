import SwiftUI

struct FocusShieldView: View {
    @ObservedObject var model: AppModel
    let showsControls: Bool

    var body: some View {
        ZStack {
            Palette.bg.opacity(0.97).ignoresSafeArea()
            if showsControls {
                VStack(spacing: 22) {
                    Image(systemName: "moon.stars")
                        .font(.system(size: 24, weight: .light))
                        .foregroundStyle(Palette.moon300)
                    Text("집중 중")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Palette.moon400)
                    Text(model.timerLabel)
                        .font(.system(size: 88, weight: .light, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Palette.moon100)
                    if model.showStopConfirmation {
                        VStack(spacing: 12) {
                            Text("집중을 중지할까요?")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(Palette.moon100)
                            HStack(spacing: 12) {
                                Button("계속 집중") { model.showStopConfirmation = false }
                                Button("중지") { model.stopFocus() }
                            }
                            .buttonStyle(.bordered)
                        }
                        .transition(.opacity.combined(with: .offset(y: 4)))
                    } else {
                        VStack(spacing: 12) {
                            Button("중지") { model.showStopConfirmation = true }
                                .buttonStyle(.bordered)
                            Text("Esc를 길게 눌러도 중지 확인이 열립니다")
                                .font(.system(size: 11))
                                .foregroundStyle(Palette.moon500)
                        }
                        .transition(.opacity)
                    }
                }
                .padding(40)
                .frame(minWidth: 360)
                .background(Palette.surface)
                .clipShape(RoundedRectangle(cornerRadius: 20))
                .overlay(RoundedRectangle(cornerRadius: 20).stroke(Palette.line.opacity(0.7), lineWidth: 1))
                .animation(PetMotion.overlay, value: model.showStopConfirmation)
            } else {
                Text("Moonlight 집중 중")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Palette.moon500)
            }
        }
        .tint(Palette.moon300)
        .environment(\.colorScheme, .dark)
    }
}
