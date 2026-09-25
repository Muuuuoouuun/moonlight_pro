import SwiftUI

/// Quick and persistent panels share one hierarchy and change shape by intent.
struct CompanionPanelView: View {
    @ObservedObject var model: AppModel
    @Binding var mode: QuickMode
    let persistent: Bool
    let openRevision: Int
    let close: () -> Void
    let modeChanged: () -> Void
    let startFocus: () -> Void
    let pin: (() -> Void)?
    let moveVertically: (CGFloat) -> Void

    @Namespace private var selection
    @State private var showsAddress = false
    private var isToday: Bool { mode == .tasks || mode == .calendar }
    private var title: String { isToday ? "오늘" : mode == .memo ? "빠른 메모" : mode.title }

    var body: some View {
        VStack(spacing: 0) {
            PanelDragHandle(move: moveVertically).frame(height: 20)
            VStack(spacing: 18) {
                header
                if isToday && !showsAddress { todayTabs }
            }
            .padding(.bottom, isToday ? 18 : 12)
            if showsAddress {
                HubConnectionContent(model: model) {
                    withAnimation(PetMotion.panel) { showsAddress = false }
                }
            } else {
                modeContent
                    .id(mode)
                    .transition(.asymmetric(insertion: .opacity.combined(with: .offset(y: 4)),
                                            removal: .opacity))
            }
        }
        .padding(.horizontal, 22)
        .padding(.top, 4)
        .padding(.bottom, 20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .foregroundStyle(Palette.glassInk)
        .tint(Palette.glassInk)
        .onChange(of: mode) { _, _ in showsAddress = false }
        .onChange(of: openRevision) { _, _ in showsAddress = false }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 8) {
            VStack(alignment: .leading, spacing: 5) {
                Text(showsAddress ? "Hub 연결" : title)
                    .font(.system(size: isToday || mode == .memo ? 25 : 20, weight: .medium))
                    .tracking(-0.6)
                if isToday && !showsAddress {
                    TimelineView(.periodic(from: .now, by: 60)) { context in
                        Text(CompanionDate.label(context.date))
                            .font(.system(size: 11.5))
                            .foregroundStyle(Palette.glassInkMuted)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if mode == .memo && !showsAddress {
                captureTabs.frame(width: 166)
            }
            modeMenu
            if let pin, mode != .memo {
                Button(action: pin) { Image(systemName: "pin").frame(width: 28, height: 32) }
                    .buttonStyle(GlassQuietStyle())
                    .help("위젯으로 고정")
                    .accessibilityLabel("위젯으로 고정")
            }
            if mode != .memo || showsAddress {
                Button(action: close) { Image(systemName: "xmark").frame(width: 28, height: 32) }
                    .buttonStyle(GlassQuietStyle())
                    .accessibilityLabel(persistent ? "위젯 접기" : "빠른 기능 닫기")
            }
        }
        .frame(height: 52)
    }

    private var modeMenu: some View {
        Menu {
            if mode == .memo {
                Button("Council에서 이어서", action: model.continueMemoInCouncil)
                Button("새 항목으로 Hub에 저장", action: model.saveMemoAsNewToHub)
                    .disabled(!model.hub.canSaveMemoAsNew
                              || model.memoDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                if let pin { Button("위젯으로 고정", action: pin) }
                Divider()
            }
            ForEach(QuickMode.allCases) { destination in
                Button { select(destination) } label: {
                    Label(destination.title, systemImage: destination.symbol)
                }
                .keyboardShortcut(KeyEquivalent(destination.shortcut), modifiers: .command)
            }
            Divider()
            Button(showsAddress ? "빠른 기능으로 돌아가기" : "Hub 연결·저장 위치") {
                withAnimation(PetMotion.panel) { showsAddress.toggle() }
            }
            Button("펫으로 접기", action: close)
        } label: {
            Image(systemName: "ellipsis").frame(width: 28, height: 32)
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .foregroundStyle(Palette.glassInkMuted)
        .help("메모 · Office · Council · 집중")
        .accessibilityLabel("빠른 기능 더보기")
    }

    private var todayTabs: some View {
        modeTabs([.tasks, .calendar])
    }

    private var captureTabs: some View {
        modeTabs([.tasks, .memo])
    }

    private func modeTabs(_ destinations: [QuickMode]) -> some View {
        HStack(spacing: 2) {
            ForEach(destinations) { destination in
                Button { select(destination) } label: {
                    Text(destination.title)
                        .font(.system(size: 12, weight: mode == destination ? .semibold : .regular))
                        .foregroundStyle(mode == destination ? Palette.glassInk : Palette.glassInkMuted)
                        .frame(maxWidth: .infinity)
                        .frame(height: 34)
                        .background {
                            if mode == destination {
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .fill(Palette.glassInk.opacity(0.10))
                                    .overlay { GlassRim(radius: 10, strength: 0.5) }
                                    .matchedGeometryEffect(id: "today-selection", in: selection)
                            }
                        }
                        .contentShape(RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(PetPressStyle())
                .accessibilityAddTraits(mode == destination ? .isSelected : [])
            }
        }
        .padding(3)
        .background(Palette.glassInk.opacity(0.035), in: RoundedRectangle(cornerRadius: 13))
        .overlay { GlassRim(radius: 13, strength: 0.20) }
    }

    @ViewBuilder private var modeContent: some View {
        switch mode {
        case .tasks: TaskCaptureContent(model: model, surface: persistent ? .widget : .quick,
                                       openRevision: openRevision, openConnection: showConnection)
        case .memo: MemoCaptureContent(model: model, surface: persistent ? .widget : .quick,
                                      openRevision: openRevision, close: close, openConnection: showConnection)
        case .calendar: CalendarCompanionContent(model: model, openConnection: showConnection)
        case .office: browserContent
        case .council: CouncilCompanionContent(model: model, openConnection: showConnection)
        case .notifications: NotificationContent(model: model, openConnection: showConnection)
        case .focus: focusSetup
        }
    }

    private var browserContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(mode == .office ? "함께 진행할 작업을 열어요." : "다른 관점이 필요할 때, Council을 불러요.")
                .font(.system(size: 15))
                .fixedSize(horizontal: false, vertical: true)
                .modifier(GlassReadability(inset: 9))
            Text("브라우저의 기존 Hub에서 이어집니다.")
                .font(.system(size: 12))
                .foregroundStyle(Palette.glassInkMuted)
                .modifier(GlassReadability(inset: 8))
            Spacer(minLength: 4)
            HStack {
                Spacer()
                Button { model.openHub(mode) } label: {
                    Label("\(mode.title) 열기", systemImage: "arrow.up.right")
                }
                .buttonStyle(GlassActionStyle())
            }
        }
    }

    private var focusSetup: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("잠깐, 한 가지에만 집중해요.").font(.system(size: 14))
                .modifier(GlassReadability(inset: 8))
            HStack(spacing: 8) {
                ForEach([15, 25, 50], id: \.self) { minutes in
                    Button("\(minutes)분") { model.focusMinutes = minutes }
                        .buttonStyle(GlassActionStyle())
                        .opacity(model.focusMinutes == minutes ? 1 : 0.6)
                        .accessibilityAddTraits(model.focusMinutes == minutes ? .isSelected : [])
                }
                Spacer(minLength: 0)
                Stepper(value: $model.focusMinutes, in: 1...120) { Text("\(model.focusMinutes)분") }
                    .labelsHidden()
                    .accessibilityLabel("집중 시간 \(model.focusMinutes)분")
            }
            Spacer(minLength: 0)
            Button(action: startFocus) {
                Label("\(model.focusMinutes)분 집중 시작", systemImage: "timer")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(GlassActionStyle())
            Text("중지 버튼 · Esc 길게 눌러 해제")
                .font(.system(size: 11)).foregroundStyle(Palette.glassInkMuted)
                .modifier(GlassReadability(radius: 8, inset: 6))
        }
    }

    private func select(_ destination: QuickMode) {
        showsAddress = false
        guard mode != destination else { return }
        withAnimation(PetMotion.panel) { mode = destination }
        modeChanged()
    }

    private func showConnection() {
        withAnimation(PetMotion.panel) { showsAddress = true }
    }
}
