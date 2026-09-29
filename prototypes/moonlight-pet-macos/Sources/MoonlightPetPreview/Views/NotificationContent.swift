import SwiftUI

struct NotificationContent: View {
    @ObservedObject var model: AppModel
    let openConnection: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Text(model.activity.isRefreshing ? "알림 확인 중…"
                     : model.activity.notices.isEmpty && model.activity.message != nil
                       ? "알림 확인 필요" : "새 알림 \(model.activity.unreadCount)개 · 전체 \(model.activity.notices.count)개")
                    .font(.system(size: 11.5)).monospacedDigit()
                    .foregroundStyle(Palette.glassInkMuted)
                Spacer(minLength: 0)
                Button { refresh() } label: {
                    Image(systemName: "arrow.clockwise").frame(width: 28, height: 28)
                }
                .buttonStyle(GlassQuietStyle())
                .disabled(model.activity.isRefreshing)
                .accessibilityLabel("알림 새로고침")
                .help("Hub에서 다시 확인")
            }
            .modifier(GlassReadability(radius: 10, inset: 7))

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10) {
                    if let message = model.activity.message {
                        HubReadNotice(message: message, symbol: "info.circle", action: openConnection)
                    }
                    ForEach(model.activity.notices) { notice in noticeRow(notice) }
                    if model.activity.notices.isEmpty {
                        if model.activity.isRefreshing {
                            HubReadNotice(message: "문의와 일정을 확인하고 있어요.", symbol: "arrow.triangle.2.circlepath")
                        } else if model.activity.message == nil {
                            HubReadNotice(message: "이 Mac에 표시할 알림이 없어요.", symbol: "bell")
                        }
                    }
                }
            }
            .scrollIndicators(.hidden)
            .frame(maxHeight: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            HStack(spacing: 8) {
                Text(model.activity.totalInquiryCount > 0
                     ? "Hub 미확인 문의 \(model.activity.totalInquiryCount)개" : "문의 · 다가오는 일정")
                    .font(.system(size: 11)).foregroundStyle(Palette.glassInkFaint)
                Spacer(minLength: 0)
                Menu {
                    Button("이 Mac의 알림 모두 확인") { model.activity.acknowledgeAll() }
                        .disabled(model.activity.unreadCount == 0)
                    Divider()
                    Toggle("펫 말풍선 알림", isOn: Binding(
                        get: { model.activity.bannersEnabled },
                        set: { model.activity.bannersEnabled = $0 }))
                    Divider()
                    Button("Hub 연결 확인", action: openConnection)
                } label: {
                    Image(systemName: "ellipsis").frame(width: 28, height: 28)
                }
                .menuStyle(.borderlessButton)
                .menuIndicator(.hidden)
                .fixedSize()
                .accessibilityLabel("알림 표시 설정")
            }
            .modifier(GlassReadability(radius: 9, inset: 7))
        }
        .foregroundStyle(Palette.glassInk)
        .task { await model.activity.refresh() }
    }

    private func noticeRow(_ notice: PetNotice) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Button { model.openNotification(notice) } label: {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: notice.kind == .calendar ? "calendar" : notice.kind == .agent ? "bubble.left.and.bubble.right" : "tray")
                        .font(.system(size: 15)).frame(width: 18)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(notice.title)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Palette.glassInk)
                            .lineLimit(2).multilineTextAlignment(.leading)
                        if !notice.detail.isEmpty {
                            Text(notice.detail)
                                .font(.system(size: 12)).foregroundStyle(Palette.glassInkMuted)
                                .lineLimit(3).multilineTextAlignment(.leading)
                        }
                        HStack(spacing: 6) {
                            if model.activity.isUnread(notice.id) {
                                Text("새 알림").fontWeight(.semibold)
                            }
                            Text(notice.createdAt, style: .relative)
                        }
                        .font(.system(size: 10.5)).foregroundStyle(Palette.glassInkFaint)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .topLeading)
                .contentShape(Rectangle())
            }
            .buttonStyle(GlassQuietStyle())
            .accessibilityLabel("\(notice.title), \(notice.detail), 내용 보기")
            Menu {
                Button("내용 보기") { model.openNotification(notice) }
                if model.activity.isUnread(notice.id) {
                    Button("이 Mac에서 확인함") { model.activity.acknowledge(id: notice.id) }
                }
                Button("이 Mac에서 숨기기") { model.activity.dismiss(id: notice.id) }
            } label: {
                Image(systemName: "ellipsis").frame(width: 24, height: 24)
            }
            .menuStyle(.borderlessButton)
            .menuIndicator(.hidden)
            .fixedSize()
            .accessibilityLabel("\(notice.title) 알림 메뉴")
            .help("숨기기는 이 Mac의 목록에만 적용됩니다.")
        }
        .padding(12)
        .modifier(GlassReadability(radius: 13))
    }

    private func refresh() { Task { await model.activity.refresh() } }
}
