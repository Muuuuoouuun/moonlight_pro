import SwiftUI

struct QuickBarView: View {
    @ObservedObject var model: AppModel
    let close: () -> Void
    let modeChanged: () -> Void
    let startFocus: () -> Void

    private var motion: Animation? {
        NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
            ? nil
            : .timingCurve(0.2, 0.7, 0.3, 1, duration: 0.18)
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                ForEach(QuickMode.allCases) { mode in
                    Button {
                        withAnimation(motion) { model.mode = mode }
                        modeChanged()
                    } label: {
                        VStack(spacing: 5) {
                            Image(systemName: mode.symbol).font(.system(size: 16, weight: .medium))
                            Text(mode.title).font(.system(size: 10.5, weight: .medium))
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .foregroundStyle(model.mode == mode ? Palette.moon100 : Palette.moon500)
                        .background(model.mode == mode ? Palette.surface3 : .clear)
                    }
                    .buttonStyle(.plain)
                    .keyboardShortcut(KeyEquivalent(mode.shortcut), modifiers: .command)
                    .accessibilityLabel(mode.title)
                }
                Button(action: close) {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .semibold))
                        .frame(width: 28, height: 56)
                        .foregroundStyle(Palette.moon400)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("빠른 기능 닫기")
            }
            .background(Palette.surface2)

            Rectangle().fill(Palette.line.opacity(0.6)).frame(height: 1)

            Group {
                switch model.mode {
                case .tasks: tasksContent
                case .memo: memoContent
                case .calendar, .office, .council: browserContent
                case .focus: focusContent
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(18)
            .id(model.mode)
            .transition(.opacity)
        }
        .frame(width: 440)
        .background(Palette.surface)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Palette.line.opacity(0.65), lineWidth: 1))
        .tint(Palette.moon300)
        .animation(motion, value: model.mode)
    }

    private var tasksContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            heading("할 일", caption: "생각난 일을 바로 적으세요")
            HStack(spacing: 8) {
                TextField("할 일 입력", text: $model.taskDraft)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit(model.addTask)
                Button("추가", action: model.addTask)
                    .buttonStyle(.borderedProminent)
                    .disabled(model.taskDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            if model.tasks.isEmpty {
                Text("아직 적은 할 일이 없습니다.")
                    .foregroundStyle(Palette.moon500)
                    .font(.system(size: 12))
                    .padding(.vertical, 8)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 9) {
                        ForEach(model.tasks) { task in
                            HStack(spacing: 9) {
                                Button { model.toggleTask(task.id) } label: {
                                    Image(systemName: task.isDone ? "checkmark.circle.fill" : "circle")
                                    Text(task.title)
                                        .strikethrough(task.isDone)
                                        .lineLimit(1)
                                }
                                .buttonStyle(.plain)
                                .font(.system(size: 12))
                                .foregroundStyle(task.isDone ? Palette.moon500 : Palette.moon100)
                                Spacer()
                                Button { model.removeTask(task.id) } label: {
                                    Image(systemName: "xmark")
                                        .font(.system(size: 10, weight: .medium))
                                        .foregroundStyle(Palette.moon500)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("\(task.title) 삭제")
                            }
                        }
                    }
                }
                .frame(maxHeight: 84)
            }
            footer("이 Mac에 저장", mode: .tasks)
        }
    }

    private var memoContent: some View {
        VStack(alignment: .leading, spacing: 11) {
            heading("빠른 메모", caption: "쓰다가 다른 기능으로 가도 초안은 유지됩니다")
            TextEditor(text: $model.memoDraft)
                .font(.system(size: 13))
                .scrollContentBackground(.hidden)
                .padding(7)
                .frame(height: 100)
                .background(Palette.surface2)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Palette.line.opacity(0.6), lineWidth: 1))
            HStack {
                Text("이 Mac에 저장")
                    .font(.system(size: 10.5))
                    .foregroundStyle(Palette.moon500)
                Spacer()
                Button("저장", action: model.saveMemo).buttonStyle(.borderedProminent)
            }
        }
    }

    private var browserContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            heading(model.mode.title, caption: "자세한 작업은 브라우저 Hub에서 계속합니다")
            Button { model.openHub(model.mode) } label: {
                Label("브라우저에서 열기", systemImage: "arrow.up.right.square")
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
                .foregroundStyle(Palette.moon500)
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
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            Text("중지 버튼 또는 Esc 길게 누르기로 종료할 수 있습니다.")
                .font(.system(size: 10.5))
                .foregroundStyle(Palette.moon500)
        }
    }

    private func heading(_ title: String, caption: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.system(size: 16, weight: .semibold)).foregroundStyle(Palette.moon100)
            Text(caption).font(.system(size: 11)).foregroundStyle(Palette.moon500)
        }
    }

    private func footer(_ label: String, mode: QuickMode) -> some View {
        HStack {
            Text(label).font(.system(size: 10.5)).foregroundStyle(Palette.moon500)
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
