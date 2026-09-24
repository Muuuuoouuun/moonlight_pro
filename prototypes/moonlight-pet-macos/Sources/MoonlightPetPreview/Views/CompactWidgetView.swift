import SwiftUI

struct CompactWidgetView: View {
    @ObservedObject var model: AppModel
    let collapse: () -> Void
    let modeChanged: () -> Void
    let moveVertically: (CGFloat) -> Void

    @FocusState private var focusedField: InputField?
    @Namespace private var selection
    @State private var hoveredMode: CompactMode?

    private enum InputField: Hashable { case task, memo }

    private var ink: Color { Palette.glassInk }
    private var inkMuted: Color { Palette.glassInkMuted }
    private var inkFaint: Color { Palette.glassInkFaint }

    var body: some View {
        VStack(spacing: 0) {
            header
            Rectangle().fill(ink.opacity(0.12)).frame(height: 1)
            modeSwitch
                .padding(.horizontal, 18)
                .padding(.top, 14)
            Group {
                if model.compactMode == .tasks { tasksContent }
                else { memoContent }
            }
            .id(model.compactMode)
            .transition(.opacity.combined(with: .offset(y: 4)))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .tint(Palette.glassInk)
        .onAppear { focusCurrentInput() }
        .onChange(of: model.compactMode) { _, _ in focusCurrentInput() }
        .onChange(of: model.compactOpenRevision) { _, _ in focusCurrentInput() }
    }

    private func focusCurrentInput() {
        focusedField = nil
        DispatchQueue.main.async {
            focusedField = model.compactMode == .tasks ? .task : .memo
        }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(model.compactMode.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(ink)
                Text(model.compactMode == .tasks ? "지금 할 일에 집중" : "떠오른 생각을 바로")
                    .font(.system(size: 10.5))
                    .foregroundStyle(inkMuted)
            }
            Spacer(minLength: 0)
            PanelDragHandle(move: moveVertically)
            Button(action: collapse) {
                PetPortrait(character: model.selectedCharacter, size: 42)
                    .frame(width: 48, height: 48)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PetPressStyle())
            .help("펫으로 접기")
            .accessibilityLabel("위젯 접기")
        }
        .padding(.leading, 18)
        .padding(.trailing, 10)
        .frame(height: 68)
    }

    private var modeSwitch: some View {
        HStack(spacing: 2) {
            ForEach(CompactMode.allCases) { mode in
                Button {
                    guard model.compactMode != mode else { return }
                    withAnimation(PetMotion.panel) { model.compactMode = mode }
                    modeChanged()
                } label: {
                    Text(mode.title)
                        .font(.system(size: 11, weight: model.compactMode == mode ? .semibold : .medium))
                        .foregroundStyle(model.compactMode == mode ? ink : inkMuted)
                        .frame(maxWidth: .infinity)
                        .frame(height: 30)
                        .background {
                            if model.compactMode == mode {
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .fill(ink.opacity(0.12))
                                    .matchedGeometryEffect(id: "selection", in: selection)
                            } else if hoveredMode == mode {
                                RoundedRectangle(cornerRadius: 8).fill(ink.opacity(0.04))
                            }
                        }
                        .contentShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(PetPressStyle())
                .onHover { hoveredMode = $0 ? mode : nil }
                .animation(PetMotion.hover, value: hoveredMode)
                .keyboardShortcut(mode == .tasks ? "1" : "2", modifiers: .command)
                .accessibilityAddTraits(model.compactMode == mode ? .isSelected : [])
            }
        }
        .padding(2)
        .background(ink.opacity(0.05), in: RoundedRectangle(cornerRadius: 10))
    }

    private var tasksContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 7) {
                Image(systemName: "plus")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(inkMuted)
                TextField("새 할 일", text: $model.taskDraft)
                    .focused($focusedField, equals: .task)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12.5))
                    .onSubmit { withAnimation(PetMotion.panel) { model.addTask() } }
                    .accessibilityLabel("새 할 일")
                Button {
                    withAnimation(PetMotion.panel) { model.addTask() }
                } label: {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 11, weight: .semibold))
                        .frame(width: 25, height: 25)
                }
                .buttonStyle(GlassActionStyle(compact: true))
                .disabled(model.taskDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("할 일 추가")
            }
            .padding(.leading, 12)
            .padding(.trailing, 5)
            .frame(height: 40)
            .modifier(GlassInputSurface(focused: focusedField == .task))

            HStack {
                Text("목록")
                    .foregroundStyle(inkMuted)
                Spacer()
                Text("남은 \(model.openTaskCount)개")
                    .foregroundStyle(inkFaint)
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
                    .foregroundStyle(inkMuted)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(model.tasks) { task in taskRow(task) }
                        }
                    }
                    .scrollIndicators(.hidden)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

            footer("이 Mac에 저장")
        }
        .padding(.horizontal, 18)
        .padding(.top, 12)
        .padding(.bottom, 15)
    }

    private func taskRow(_ task: LocalTask) -> some View {
        HStack(spacing: 8) {
            Button { withAnimation(PetMotion.hover) { model.toggleTask(task.id) } } label: {
                Image(systemName: task.isDone ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 16, weight: .light))
                    .foregroundStyle(task.isDone ? inkFaint : inkMuted)
                    .frame(width: 32, height: 36)
            }
            .buttonStyle(PetPressStyle())
            .accessibilityLabel("\(task.title) \(task.isDone ? "완료 취소" : "완료")")
            Text(task.title)
                .font(.system(size: 12))
                .foregroundStyle(task.isDone ? inkFaint : ink)
                .strikethrough(task.isDone)
                .lineLimit(1)
                .help(task.title)
            Spacer(minLength: 0)
            Button { withAnimation(PetMotion.panel) { model.removeTask(task.id) } } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(inkMuted)
                    .frame(width: 32, height: 36)
            }
            .buttonStyle(PetPressStyle())
            .accessibilityLabel("\(task.title) 삭제")
        }
        .frame(height: 42)
        .modifier(GlassRowSurface())
        .overlay(alignment: .bottom) { ink.opacity(0.09).frame(height: 1) }
        .transition(.opacity.combined(with: .offset(y: 4)))
    }

    private var memoContent: some View {
        VStack(alignment: .leading, spacing: 13) {
            TextField("메모를 입력하세요", text: $model.memoDraft, axis: .vertical)
                .focused($focusedField, equals: .memo)
                .textFieldStyle(.plain)
                .font(.system(size: 12.5))
                .foregroundStyle(ink)
                .lineLimit(3...7)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(8)
                .modifier(GlassInputSurface(focused: focusedField == .memo))
                .accessibilityLabel("메모 입력")
            HStack {
                footer(model.savedMemo == model.memoDraft ? "저장됨 · 이 Mac" : "수정됨 · 아직 저장 전")
                Spacer()
                Button("저장") { model.saveMemo() }
                    .buttonStyle(GlassActionStyle())
                    .keyboardShortcut("s", modifiers: .command)
                    .disabled(model.savedMemo == model.memoDraft)
                    .accessibilityLabel("메모 저장")
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 12)
        .padding(.bottom, 16)
    }

    private func footer(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 10.5))
            .foregroundStyle(inkFaint)
    }
}
