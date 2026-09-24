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
            header.padding(.bottom, isToday ? 18 : 12)
            if showsAddress {
                connectionSettings
            } else {
                if isToday { todayTabs.padding(.bottom, 18) }
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
                    .font(.system(size: isToday ? 25 : 20, weight: .medium))
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
            modeMenu
            if let pin {
                Button(action: pin) { Image(systemName: "pin").frame(width: 28, height: 32) }
                    .buttonStyle(GlassQuietStyle())
                    .help("위젯으로 고정")
                    .accessibilityLabel("위젯으로 고정")
            }
            Button(action: close) { Image(systemName: "xmark").frame(width: 28, height: 32) }
                .buttonStyle(GlassQuietStyle())
                .accessibilityLabel(persistent ? "위젯 접기" : "빠른 기능 닫기")
        }
        .frame(height: 52)
    }

    private var modeMenu: some View {
        Menu {
            ForEach(QuickMode.allCases) { destination in
                Button { select(destination) } label: {
                    Label(destination.title, systemImage: destination.symbol)
                }
                .keyboardShortcut(KeyEquivalent(destination.shortcut), modifiers: .command)
            }
            Divider()
            Button("Hub 주소 설정") { withAnimation(PetMotion.panel) { showsAddress.toggle() } }
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
        HStack(spacing: 2) {
            ForEach([QuickMode.tasks, .calendar]) { destination in
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
        .overlay { GlassRim(radius: 13, strength: 0.35) }
    }

    @ViewBuilder private var modeContent: some View {
        switch mode {
        case .tasks: TaskCaptureContent(model: model, surface: persistent ? .widget : .quick, openRevision: openRevision)
        case .memo: MemoCaptureContent(model: model, surface: persistent ? .widget : .quick, openRevision: openRevision)
        case .calendar: CalendarCompanionContent(model: model)
        case .office, .council: browserContent
        case .focus: focusSetup
        }
    }

    private var browserContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(mode == .office ? "함께 진행할 작업을 열어요." : "다른 관점이 필요할 때, Council을 불러요.")
                .font(.system(size: 15))
                .fixedSize(horizontal: false, vertical: true)
            Text("브라우저의 기존 Hub에서 이어집니다.")
                .font(.system(size: 12))
                .foregroundStyle(Palette.glassInkMuted)
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
        }
    }

    private var connectionSettings: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("브라우저에서 열 Hub 주소")
                .font(.system(size: 12)).foregroundStyle(Palette.glassInkMuted)
            TextField("http://127.0.0.1:3000", text: $model.hubBaseURL)
                .textFieldStyle(.plain).font(.system(size: 13)).padding(12)
                .modifier(GlassInputSurface(focused: false))
                .onSubmit(saveAddress).accessibilityLabel("Hub 주소")
            Button("저장", action: saveAddress).buttonStyle(GlassActionStyle())
            Spacer(minLength: 0)
        }
    }

    private func select(_ destination: QuickMode) {
        showsAddress = false
        guard mode != destination else { return }
        withAnimation(PetMotion.panel) { mode = destination }
        modeChanged()
    }

    private func saveAddress() {
        model.saveHubURL()
        withAnimation(PetMotion.panel) { showsAddress = false }
    }
}
