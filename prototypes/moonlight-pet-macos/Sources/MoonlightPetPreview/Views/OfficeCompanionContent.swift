import AppKit
import SwiftUI

/// One companion window: request metadata first, bodies only on explicit read.
struct OfficeCompanionContent: View {
    @ObservedObject var model: AppModel
    @ObservedObject var requests: OfficeRequestStore
    let openRevision: Int
    let openConnection: () -> Void
    @State private var copied = false
    private var loadKey: String {
        "\(model.officeTab.rawValue):\(requests.scope.rawValue):\(requests.hasConnection):\(openRevision)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            tabs
            if model.officeTab == .meeting {
                CouncilCompanionContent(model: model, openConnection: openConnection, durableMeetings: true)
            } else if model.officeTab == .conversation {
                CouncilCompanionContent(model: model, openConnection: openConnection)
            } else if let detail = requests.detail {
                result(detail)
            } else {
                work
            }
        }
        .task(id: loadKey) {
            guard model.officeTab == .work, requests.hasConnection else { return }
            await requests.refresh()
        }
        .onChange(of: requests.detail) { _, _ in copied = false }
    }

    private var tabs: some View {
        HStack(spacing: 2) {
            ForEach(OfficeCompanionTab.allCases) { tab in
                Button { model.officeTab = tab } label: {
                    Text(tab.title)
                        .font(.system(size: 12, weight: model.officeTab == tab ? .semibold : .medium))
                        .foregroundStyle(model.officeTab == tab ? Palette.glassInk : Palette.glassInkMuted)
                        .frame(maxWidth: .infinity).frame(height: 34)
                        .background {
                            if model.officeTab == tab {
                                RoundedRectangle(cornerRadius: 10).fill(Palette.glassInk.opacity(0.10))
                                    .overlay { GlassRim(radius: 10, strength: 0.5) }
                            }
                        }
                        .contentShape(Rectangle())
                }
                .buttonStyle(PetPressStyle())
                .accessibilityAddTraits(model.officeTab == tab ? .isSelected : [])
                .accessibilityLabel("Office " + tab.title)
            }
        }
        .padding(3)
        .background(Palette.glassInk.opacity(0.035), in: RoundedRectangle(cornerRadius: 13))
        .overlay { GlassRim(radius: 13, strength: 0.20) }
    }

    private var work: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !requests.hasConnection || requests.needsLogin {
                HubReadNotice(message: "Office 요청을 보려면 운영 Hub에 로그인해 주세요.", symbol: "lock", action: openConnection)
            } else if requests.isPreview {
                HubReadNotice(message: "Office 요청 저장소 연결이 필요해요. 배포된 Hub 연결을 확인해 주세요.", action: openConnection)
            } else if let message = requests.errorMessage {
                HubReadNotice(message: message, symbol: "exclamationmark.circle")
                Button("다시 불러오기") { Task { await requests.refresh() } }
                    .buttonStyle(GlassQuietStyle()).disabled(requests.isLoading)
            }
            if requests.isLoading && requests.items.isEmpty {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text("최근 요청 불러오는 중…").font(.system(size: 12))
                }.padding(10).modifier(GlassReadability(radius: 12))
            } else if requests.items.isEmpty && requests.lastLoadedAt != nil && requests.errorMessage == nil {
                HubReadNotice(message: "아직 Office 요청이 없어요. 대화 탭에서 담당자에게 물어보세요.", symbol: "tray")
            }
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(requests.items) { item in
                        requestRow(item)
                        Divider().overlay(Palette.glassInk.opacity(0.12))
                    }
                    if requests.hasMore {
                        Button("이전 요청 더 불러오기") { Task { await requests.loadMore() } }
                            .buttonStyle(GlassQuietStyle()).padding(.top, 10)
                            .disabled(requests.isLoading || requests.needsLogin || requests.errorMessage != nil)
                    }
                }.padding(2)
            }
            .scrollIndicators(.hidden)
            .frame(maxWidth: .infinity, maxHeight: 252)
            if let selected = requests.selected {
                VStack(alignment: .leading, spacing: 5) {
                    Text(selected.owner.title + " · " + selected.originLabel)
                        .font(.system(size: 11.5, weight: .medium)).lineLimit(2)
                    Text(stateExplanation(selected.state))
                        .font(.system(size: 11.5)).foregroundStyle(Palette.glassInkMuted).lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading).padding(10)
                .modifier(GlassReadability(radius: 12))
            }
            if let message = requests.detailErrorMessage {
                HubReadNotice(message: message, symbol: "exclamationmark.circle", action: requests.needsLogin ? openConnection : nil)
            }
            Spacer(minLength: 0)
            HStack(spacing: 8) {
                if let selected = requests.selected {
                    Button("Hub에서 이어서") { model.openOfficeRequest(selected) }
                        .buttonStyle(GlassQuietStyle()).font(.system(size: 11.5))
                }
                Spacer(minLength: 0)
                Button {
                    Task { await requests.readSelected() }
                } label: {
                    Label(requests.isReading ? "결과 확인 중…" : "결과 읽기", systemImage: "doc.text")
                }
                .buttonStyle(GlassActionStyle())
                .disabled(!model.canReadOfficeResult)
            }
            checkedAt
        }
    }

    private func requestRow(_ item: OfficeRequestSummary) -> some View {
        Button { requests.select(item) } label: {
            VStack(alignment: .leading, spacing: 7) {
                HStack(alignment: .firstTextBaseline) {
                    Text(item.title).font(.system(size: 13, weight: .medium))
                    Spacer(minLength: 8)
                    Text(item.statusLabel).font(.system(size: 11.5))
                }
                Text(item.owner.title + " · " + item.originLabel)
                    .font(.system(size: 11.5)).foregroundStyle(Palette.glassInkMuted).lineLimit(1)
                Text(item.createdAt.formatted(date: .abbreviated, time: .shortened))
                    .font(.system(size: 10.5)).foregroundStyle(Palette.glassInkFaint)
            }
            .frame(maxWidth: .infinity, alignment: .leading).frame(minHeight: 64)
            .padding(.horizontal, 10).padding(.vertical, 9)
            .background {
                if requests.selected?.id == item.id {
                    RoundedRectangle(cornerRadius: 10).fill(Palette.glassInk.opacity(0.07))
                        .overlay { GlassRim(radius: 10, strength: 0.35) }
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PetPressStyle())
        .modifier(GlassGlyphShadow())
        .accessibilityAddTraits(requests.selected?.id == item.id ? .isSelected : [])
        .disabled(requests.needsLogin || requests.isStale)
    }

    private func result(_ detail: OfficeRequestDetail) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { requests.closeDetail() } label: { Label("요청 목록", systemImage: "chevron.left") }
                .buttonStyle(GlassQuietStyle()).font(.system(size: 12))
            VStack(alignment: .leading, spacing: 5) {
                Text(detail.request.title + " · " + detail.request.statusLabel).font(.system(size: 14, weight: .medium))
                Text(detail.request.owner.title + " · " + detail.request.originLabel)
                    .font(.system(size: 11.5)).foregroundStyle(Palette.glassInkMuted)
            }.padding(8).modifier(GlassReadability(radius: 10))
            if let message = requests.errorMessage {
                HubReadNotice(message: message, symbol: "exclamationmark.circle", action: requests.needsLogin ? openConnection : nil)
                Button("다시 불러오기") { Task { await requests.refresh() } }
                    .buttonStyle(GlassQuietStyle()).disabled(requests.isLoading)
            } else if requests.isLoading {
                Label("상태 다시 확인 중…", systemImage: "arrow.clockwise")
                    .font(.system(size: 11.5)).foregroundStyle(Palette.glassInkMuted)
                    .modifier(GlassReadability(radius: 8, inset: 4))
            }
            checkedAt
            ScrollView {
                Text(detail.body ?? stateExplanation(detail.request.state))
                    .font(.system(size: 13)).lineSpacing(5).textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(12)
                    .modifier(GlassReadability(radius: 12))
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
            HStack {
                Button("Hub에서 이어서") { model.openOfficeRequest(detail.request) }
                    .buttonStyle(GlassQuietStyle()).font(.system(size: 11.5))
                Spacer(minLength: 0)
                Button {
                    copied = model.copyOfficeResult()
                } label: { Label(copied ? "복사됨" : "복사", systemImage: copied ? "checkmark" : "doc.on.doc") }
                    .buttonStyle(GlassActionStyle())
                    .disabled(detail.body == nil || requests.needsLogin || requests.isStale)
            }
            Text("읽기·복사만 제공 · 업무 반영은 Hub에서 검토 후 진행")
                .font(.system(size: 10.5)).foregroundStyle(Palette.glassInkMuted)
                .modifier(GlassReadability(radius: 8, inset: 4))
        }
    }

    @ViewBuilder private var checkedAt: some View {
        if let date = requests.lastLoadedAt {
            Text((requests.isStale ? "이전 조회 · " : "마지막 확인 · ") + date.formatted(date: .omitted, time: .shortened))
                .font(.system(size: 10.5)).foregroundStyle(Palette.glassInkMuted)
                .modifier(GlassReadability(radius: 8, inset: 4))
        }
    }
    private func stateExplanation(_ state: OfficeRequestState) -> String {
        switch state {
        case .running: return "결과를 생성하고 있어요. 더보기에서 상태를 다시 확인해 주세요."
        case .generated: return "결과 읽기를 누르면 이 요청의 본문을 확인해요."
        case .unknown, .error: return "생성 상태를 확인해야 해요. Hub에서 원본 요청을 확인해 주세요."
        case .expired: return "본문 보관 기간이 끝났어요. 요청의 담당자와 출처만 남아 있어요."
        }
    }
}

struct OfficeRequestScopeMenu: View {
    @ObservedObject var requests: OfficeRequestStore
    var body: some View {
        Menu {
            Picker("Office 요청 범위", selection: $requests.scope) {
                ForEach(OfficeRequestScope.allCases) { scope in Text(scope.title).tag(scope) }
            }
        } label: {
            Label(requests.scope.title, systemImage: "line.3.horizontal.decrease")
                .font(.system(size: 11.5))
        }
        .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize()
        .accessibilityLabel("Office 요청 범위: " + requests.scope.title)
    }
}
