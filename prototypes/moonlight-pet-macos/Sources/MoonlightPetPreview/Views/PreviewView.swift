import SwiftUI

struct PreviewView: View {
    @ObservedObject var model: AppModel
    let openBar: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "moon.stars")
                    .foregroundStyle(Palette.moon300)
                Text("Moonlight")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Palette.moon400)
                Spacer()
            }
            Text(model.previewText)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Palette.moon100)
                .lineLimit(2)
            Button("빠른 기능 열기", action: openBar)
                .buttonStyle(.plain)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Palette.moon300)
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Palette.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Palette.line.opacity(0.6), lineWidth: 1))
    }
}
