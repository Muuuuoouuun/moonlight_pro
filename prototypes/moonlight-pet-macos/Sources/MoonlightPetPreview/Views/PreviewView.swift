import SwiftUI

struct PreviewView: View {
    @ObservedObject var model: AppModel
    let openBar: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            PetPortrait(character: model.selectedCharacter, size: 42, pose: .portrait)
                .overlay(alignment: .topTrailing) {
                    NotificationCountBadge(count: model.activity.unreadCount)
                        .offset(x: 4, y: -4)
                }
            Group {
                if let notice = model.activity.banner {
                    bannerContent(notice)
                } else {
                    summaryContent
                }
            }
            .modifier(GlassReadability(radius: 12, inset: 6))
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func bannerContent(_ notice: PetNotice) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 4) {
                Text(notice.title)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Palette.glassInk)
                    .lineLimit(1)
                Spacer(minLength: 0)
                Button(action: model.activity.dismissBanner) {
                    Image(systemName: "xmark").frame(width: 20, height: 20)
                }
                .buttonStyle(GlassQuietStyle())
                .accessibilityLabel("말풍선 닫기")
                .help("알림은 목록에 남아 있어요.")
            }
            Text(notice.detail)
                .font(.system(size: 12)).foregroundStyle(Palette.glassInkMuted)
                .lineLimit(2)
            Button { model.openNotification(notice) } label: {
                Label("내용 보기", systemImage: "arrow.up.right")
            }
            .buttonStyle(.plain)
            .font(.system(size: 11.5, weight: .medium))
            .foregroundStyle(Palette.glassInk)
        }
    }

    private var summaryContent: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text("Moonlight")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Palette.glassInkFaint)
            Text(model.previewText)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Palette.glassInk)
                .lineLimit(2)
            HStack(spacing: 12) {
                Button("빠른 기능 열기", action: openBar)
                if model.activity.unreadCount > 0 {
                    Button("알림 \(model.activity.unreadCount)", action: model.showNotifications)
                }
            }
            .buttonStyle(.plain)
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(Palette.glassInkMuted)
        }
    }
}
