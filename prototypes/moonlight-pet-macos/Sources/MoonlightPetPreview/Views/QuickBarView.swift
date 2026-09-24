import SwiftUI

struct QuickBarView: View {
    @ObservedObject var model: AppModel
    @State private var hoveredMode: QuickMode?
    @State private var showsHubAddress = false
    let close: () -> Void
    let modeChanged: () -> Void
    let startFocus: () -> Void

    private var usesVerticalLayout: Bool {
        model.mode == .tasks || model.mode == .calendar
    }

    var body: some View {
        Group {
            if usesVerticalLayout {
                HStack(spacing: 0) {
                    verticalNavigation
                    Rectangle().fill(Palette.moon100.opacity(0.13)).frame(width: 1)
                    modeContent
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                        .padding(18)
                }
                .frame(width: 368)
                .transition(.opacity.combined(with: .offset(x: 4)))
            } else {
                VStack(spacing: 0) {
                    horizontalNavigation
                    Rectangle().fill(Palette.moon100.opacity(0.13)).frame(height: 1)
                    modeContent
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                        .padding(18)
                }
                .frame(width: 440)
                .transition(.opacity.combined(with: .offset(x: -4)))
            }
        }
        .moonlightGlassPanel(cornerRadius: 16)
        .tint(Palette.moon300)
    }

    private var modeContent: some View {
        Group {
            switch model.mode {
            case .tasks: tasksContent
            case .memo: memoContent
            case .calendar: calendarContent
            case .office, .council: browserContent
            case .focus: focusContent
            }
        }
        .id(model.mode)
        .transition(.asymmetric(
            insertion: .opacity.combined(with: .offset(y: 4)),
            removal: .opacity
        ))
    }

    private var horizontalNavigation: some View {
        HStack(spacing: 0) {
            ForEach(QuickMode.allCases) { mode in
                navigationButton(mode, vertical: false)
            }
            closeButton(vertical: false)
        }
        .padding(.horizontal, 6)
    }

    private var verticalNavigation: some View {
        VStack(spacing: 0) {
            ForEach(QuickMode.allCases) { mode in
                navigationButton(mode, vertical: true)
            }
            Spacer(minLength: 0)
            closeButton(vertical: true)
        }
        .frame(width: 62)
        .frame(maxHeight: .infinity)
    }

    private func navigationButton(_ mode: QuickMode, vertical: Bool) -> some View {
        Button {
            guard model.mode != mode else { return }
            withAnimation(PetMotion.panel) { model.mode = mode }
            modeChanged()
        } label: {
            VStack(spacing: 5) {
                Image(systemName: mode.symbol).font(.system(size: 15, weight: .medium))
                Text(mode.title).font(.system(size: 10.5, weight: .medium))
            }
            .frame(width: vertical ? 52 : nil)
            .frame(maxWidth: vertical ? nil : .infinity)
            .frame(height: vertical ? 50 : 52)
            .foregroundStyle(model.mode == mode ? Palette.moon100 : Palette.moon400)
            .background {
                RoundedRectangle(cornerRadius: 11)
                    .fill(model.mode == mode ? Palette.moon100.opacity(0.15)
                        : hoveredMode == mode ? Palette.moon100.opacity(0.06) : .clear)
            }
            .contentShape(RoundedRectangle(cornerRadius: 11))
        }
        .buttonStyle(PetPressStyle())
        .frame(width: vertical ? 62 : nil, height: vertical ? 58 : 52)
        .onHover { hoveredMode = $0 ? mode : nil }
        .animation(PetMotion.hover, value: hoveredMode == mode)
        .keyboardShortcut(KeyEquivalent(mode.shortcut), modifiers: .command)
        .accessibilityLabel(mode.title)
        .accessibilityAddTraits(model.mode == mode ? .isSelected : [])
    }

    private func closeButton(vertical: Bool) -> some View {
        Button(action: close) {
            Image(systemName: "xmark")
                .font(.system(size: 12, weight: .semibold))
                .frame(width: vertical ? 62 : 32, height: vertical ? 44 : 52)
                .foregroundStyle(Palette.moon400)
        }
        .buttonStyle(PetPressStyle())
        .accessibilityLabel("빠른 기능 닫기")
    }

    private var tasksContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            heading("할 일", caption: "생각난 일을 바로 적으세요")

            HStack(spacing: 8) {
                Image(systemName: "plus")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Palette.moon400)
                TextField("새 할 일", text: $model.taskDraft)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12.5))
                    .onSubmit { withAnimation(PetMotion.panel) { model.addTask() } }
                    .accessibilityLabel("새 할 일")
                Button {
                    withAnimation(PetMotion.panel) { model.addTask() }
                } label: {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Palette.bg)
                        .frame(width: 27, height: 27)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .disabled(model.taskDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("할 일 추가")
            }
            .padding(.leading, 11)
            .padding(.trailing, 5)
            .frame(height: 40)
            .background(Palette.moon100.opacity(0.07), in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Palette.moon100.opacity(0.12), lineWidth: 1))

            HStack {
                Text("목록")
                    .foregroundStyle(Palette.moon300)
                Spacer()
                Text("남은 \(model.openTaskCount)개")
                    .foregroundStyle(Palette.moon400)
                    .monospacedDigit()
            }
            .font(.system(size: 10.5, weight: .medium))

            Group {
                if model.tasks.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "checklist")
                            .font(.system(size: 20, weight: .ultraLight))
                        Text("아직 적은 할 일이 없습니다")
                            .font(.system(size: 11.5))
                    }
                    .foregroundStyle(Palette.moon400)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(model.tasks) { task in
                                taskRow(task)
                            }
                        }
                    }
                    .scrollIndicators(.hidden)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            footer("이 Mac에 저장", mode: .tasks)
        }
    }

    private func taskRow(_ task: LocalTask) -> some View {
        HStack(spacing: 8) {
            Button { withAnimation(PetMotion.hover) { model.toggleTask(task.id) } } label: {
                Image(systemName: task.isDone ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 16, weight: .light))
                    .foregroundStyle(task.isDone ? Palette.moon400 : Palette.moon300)
                    .frame(width: 28, height: 34)
            }
            .buttonStyle(PetPressStyle())
            .accessibilityLabel("\(task.title) \(task.isDone ? "완료 취소" : "완료")")
            Text(task.title)
                .font(.system(size: 12))
                .foregroundStyle(task.isDone ? Palette.moon400 : Palette.moon100)
                .strikethrough(task.isDone)
                .lineLimit(1)
            Spacer(minLength: 0)
            Button { withAnimation(PetMotion.panel) { model.removeTask(task.id) } } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(Palette.moon400)
                    .frame(width: 26, height: 30)
            }
            .buttonStyle(PetPressStyle())
            .accessibilityLabel("\(task.title) 삭제")
        }
        .frame(height: 40)
        .overlay(alignment: .bottom) { Palette.moon100.opacity(0.09).frame(height: 1) }
        .transition(.opacity.combined(with: .offset(y: 4)))
    }

    private var calendarContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            heading("일정", caption: Self.dateLabel(Date()))

            Text("이번 주")
                .font(.system(size: 10.5, weight: .medium))
                .foregroundStyle(Palette.moon300)
            HStack(spacing: 3) {
                ForEach(Self.weekDates(containing: Date()), id: \.self) { date in
                    let isToday = Calendar.current.isDateInToday(date)
                    VStack(spacing: 8) {
                        Text(Self.weekdayLabel(date))
                            .font(.system(size: 10.5, weight: .medium))
                        Text("\(Calendar.current.component(.day, from: date))")
                            .font(.system(size: 13, weight: isToday ? .semibold : .regular))
                            .monospacedDigit()
                    }
                    .foregroundStyle(isToday ? Palette.moon100 : Palette.moon400)
                    .frame(maxWidth: .infinity)
                    .frame(height: 56)
                    .background(isToday ? Palette.moon100.opacity(0.14) : .clear,
                                in: RoundedRectangle(cornerRadius: 10))
                    .accessibilityLabel(Self.dateLabel(date) + (isToday ? " 오늘" : ""))
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: "calendar.badge.clock")
                    .font(.system(size: 22, weight: .light))
                    .foregroundStyle(Palette.moon300)
                Text("일정은 Hub에서 확인")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Palette.moon100)
                Text("브라우저에서 열리고 기존 로그인 상태를 사용합니다.")
                    .font(.system(size: 11))
                    .foregroundStyle(Palette.moon400)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Palette.moon100.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Palette.moon100.opacity(0.1), lineWidth: 1))

            Button { model.openHub(.calendar) } label: {
                Label("Hub 일정 열기", systemImage: "arrow.up.right")
                    .foregroundStyle(Palette.bg)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)

            Spacer(minLength: 0)

            Button {
                withAnimation(PetMotion.panel) { showsHubAddress.toggle() }
            } label: {
                HStack {
                    Text("Hub 주소 설정")
                    Spacer()
                    Image(systemName: showsHubAddress ? "chevron.up" : "chevron.down")
                }
                .font(.system(size: 10.5, weight: .medium))
                .foregroundStyle(Palette.moon400)
            }
            .buttonStyle(.plain)
            .accessibilityValue(showsHubAddress ? "펼침" : "접힘")

            if showsHubAddress {
                HStack(spacing: 6) {
                    TextField("Hub 주소", text: $model.hubBaseURL)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit(model.saveHubURL)
                    Button("저장", action: model.saveHubURL)
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                }
                .transition(.opacity)
            }
        }
    }

    private static func weekDates(containing date: Date) -> [Date] {
        let calendar = Calendar.current
        let start = calendar.startOfDay(for: date)
        let offset = (calendar.component(.weekday, from: start) + 5) % 7
        guard let monday = calendar.date(byAdding: .day, value: -offset, to: start) else { return [] }
        return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: monday) }
    }

    private static func dateLabel(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.dateFormat = "M월 d일 EEEE"
        return formatter.string(from: date)
    }

    private static func weekdayLabel(_ date: Date) -> String {
        let names = ["일", "월", "화", "수", "목", "금", "토"]
        return names[Calendar.current.component(.weekday, from: date) - 1]
    }

    private var memoContent: some View {
        VStack(alignment: .leading, spacing: 11) {
            heading("빠른 메모", caption: "쓰다가 다른 기능으로 가도 초안은 유지됩니다")
            TextField("메모를 입력하세요", text: $model.memoDraft, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(5...5)
                .font(.system(size: 13))
                .foregroundStyle(Palette.moon100)
                .padding(11)
                .frame(height: 100)
                .background(Palette.moon100.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Palette.moon100.opacity(0.11), lineWidth: 1))
            HStack {
                Text("이 Mac에 저장")
                    .font(.system(size: 10.5))
                    .foregroundStyle(Palette.moon400)
                Spacer()
                Button(action: model.saveMemo) {
                    Text("저장").foregroundStyle(Palette.bg)
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }

    private var browserContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            heading(model.mode.title, caption: model.mode == .calendar
                ? "일정은 브라우저 Hub에서 확인합니다"
                : "자세한 작업은 브라우저 Hub에서 계속합니다")
            Button { model.openHub(model.mode) } label: {
                Label("브라우저에서 열기", systemImage: "arrow.up.right.square")
                    .foregroundStyle(Palette.bg)
            }
            .buttonStyle(.borderedProminent)
            HStack(spacing: 8) {
                TextField("Hub 주소", text: $model.hubBaseURL)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit(model.saveHubURL)
                Button("저장", action: model.saveHubURL).buttonStyle(.bordered)
            }
            Text("로그인은 열린 브라우저의 기존 Hub에서 진행합니다.")
                .font(.system(size: 10.5))
                .foregroundStyle(Palette.moon400)
        }
    }

    private var focusContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            heading("집중 모드", caption: "시작하면 다른 화면 클릭을 가립니다")
            HStack {
                Text("집중 시간")
                    .font(.system(size: 12))
                    .foregroundStyle(Palette.moon100)
                Spacer()
                Stepper("\(model.focusMinutes)분", value: $model.focusMinutes, in: 1...120, step: 5)
                    .labelsHidden()
                Text("\(model.focusMinutes)분")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Palette.moon100)
                    .frame(width: 48, alignment: .trailing)
            }
            Button(action: startFocus) {
                Label("집중 시작", systemImage: "timer")
                    .foregroundStyle(Palette.bg)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            Text("중지 버튼 또는 Esc 길게 누르기로 종료할 수 있습니다.")
                .font(.system(size: 10.5))
                .foregroundStyle(Palette.moon400)
        }
    }

    private func heading(_ title: String, caption: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.moon100)
            Text(caption).font(.system(size: 11)).foregroundStyle(Palette.moon300)
        }
    }

    private func footer(_ label: String, mode: QuickMode) -> some View {
        HStack {
            Text(label).font(.system(size: 10.5)).foregroundStyle(Palette.moon400)
            Spacer()
            Button { model.openHub(mode) } label: {
                Label("Hub에서 열기", systemImage: "arrow.up.right")
            }
            .buttonStyle(.plain)
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(Palette.moon300)
        }
    }
}
