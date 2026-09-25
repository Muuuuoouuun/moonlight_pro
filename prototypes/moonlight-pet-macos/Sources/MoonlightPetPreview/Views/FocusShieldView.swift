import SwiftUI

struct FocusShieldView: View {
    @ObservedObject var model: AppModel
    let showsControls: Bool

    var body: some View {
        ZStack {
            // The shield remains completely opaque, including underneath the timer glass.
            Palette.bg.ignoresSafeArea()
            RadialGradient(colors: [Palette.surface3, Palette.bg], center: .center,
                           startRadius: 20, endRadius: 600)
                .ignoresSafeArea()
            if showsControls {
                VStack(spacing: 0) {
                    PetPortrait(character: model.selectedCharacter, size: 80)
                        .padding(.bottom, -9)
                        .zIndex(1)
                        .accessibilityHidden(true)
                    timerCard
                    HStack(spacing: 10) {
                        Text("Esc")
                            .font(.system(size: 11, weight: .medium))
                            .padding(.horizontal, 11).padding(.vertical, 7)
                            .background(Palette.moon100.opacity(0.035), in: RoundedRectangle(cornerRadius: 8))
                            .overlay { GlassRim(radius: 8, strength: 0.35) }
                        Text("길게 눌러 중지 확인").font(.system(size: 11.5))
                    }
                    .foregroundStyle(Palette.moon300)
                    .padding(.top, 28)
                }
                .padding(24)
            } else {
                Text("Moonlight 집중 중")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Palette.moon400)
            }
        }
        .tint(Palette.moon300)
        .environment(\.colorScheme, .dark)
        // The opaque focus scene already protects its text; never sample other
        // windows through a button's behind-window reading material.
        .environment(\.glassReadingProtected, true)
    }

    private var timerCard: some View {
        VStack(spacing: 20) {
            Label("집중 중", systemImage: "lock.fill")
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(Palette.moon300)
            Text(model.timerLabel)
                .font(.system(size: 82, weight: .ultraLight))
                .monospacedDigit().tracking(-3)
                .foregroundStyle(Palette.moon100)
                .accessibilityLabel("남은 시간 \(model.timerLabel)")
            Text("지금은 한 가지에만 집중해요.")
                .font(.system(size: 13)).foregroundStyle(Palette.moon300)
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(Palette.moon100.opacity(0.12))
                    Capsule().fill(Palette.moon300.opacity(0.72))
                        .frame(width: geometry.size.width * model.focusProgress)
                }
            }
            .frame(height: 3)
            .padding(.horizontal, 26)
            .accessibilityLabel("집중 진행")
            .accessibilityValue("\(Int(model.focusProgress * 100))퍼센트")
            stopControls.frame(height: 66)
        }
        .padding(.horizontal, 32).padding(.top, 34).padding(.bottom, 20)
        .frame(width: 420)
        .modifier(GlassSurface(radius: 32))
    }

    private var stopControls: some View {
        Group {
            if model.showStopConfirmation {
                VStack(spacing: 9) {
                    Text("집중을 중지할까요?")
                        .font(.system(size: 12)).foregroundStyle(Palette.moon300)
                    HStack(spacing: 12) {
                        Button("계속 집중") { model.showStopConfirmation = false }
                        Button("중지") { model.stopFocus() }
                    }
                    .buttonStyle(GlassActionStyle())
                }
            } else {
                Button { model.showStopConfirmation = true } label: {
                    Label("중지", systemImage: "stop.fill")
                        .font(.system(size: 14)).frame(width: 160, height: 8)
                }
                .buttonStyle(GlassActionStyle())
            }
        }
        .animation(PetMotion.overlay, value: model.showStopConfirmation)
    }
}
