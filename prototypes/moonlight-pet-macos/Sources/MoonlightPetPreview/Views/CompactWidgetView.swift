import SwiftUI

struct CompactWidgetView: View {
    @ObservedObject var model: AppModel
    let collapse: () -> Void
    let modeChanged: () -> Void
    let moveVertically: (CGFloat) -> Void

    @FocusState private var focusedField: InputField?
    @State private var lastDragTranslation: CGFloat = 0

    private enum InputField: Hashable { case task, memo }

    private var panelHeight: CGFloat { model.compactMode == .tasks ? 420 : 304 }

    var body: some View {
        VStack(spacing: 0) {
            header
            Rectangle().fill(Palette.moon100.opacity(0.12)).frame(height: 1)
            Group {
                if model.compactMode == .tasks { tasksContent }
                else { memoContent }
            }
            .id(model.compactMode)
            .transition(.opacity.combined(with: .offset(y: 4)))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .frame(width: 288, height: panelHeight)
        .moonlightGlassPanel(cornerRadius: 18)
        .tint(Palette.moon300)
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
                    .foregroundStyle(Palette.moon100)
                Text(model.compactMode == .tasks ? "지금 할 일에 집중" : "떠오른 생각을 바로")
                    .font(.system(size: 10.5))
                    .foregroundStyle(Palette.moon400)
            }
            Spacer(minLength: 0)
            Image(systemName: "line.3.horizontal")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Palette.moon500)
                .frame(width: 28, height: 32)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 3)
                        .onChanged { value in
                            let delta = value.translation.height - lastDragTranslation
                            lastDragTranslation = value.translation.height
                            moveVertically(-delta)
                        }
                        .onEnded { _ in lastDragTranslation = 0 }
                )
                .accessibilityLabel("위젯 위치 이동")
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
                        .foregroundStyle(model.compactMode == mode ? Palette.moon100 : Palette.moon400)
                        .frame(maxWidth: .infinity)
                        .frame(height: 27)
                        .background(model.compactMode == mode ? Palette.moon100.opacity(0.12) : .clear,
                                    in: RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(PetPressStyle())
                .accessibilityAddTraits(model.compactMode == mode ? .isSelected : [])
            }
        }
        .padding(2)
        .background(Palette.moon100.opacity(0.05), in: RoundedRectangle(cornerRadius: 10))
    }

    private var tasksContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            modeSwitch

            HStack(spacing: 7) {
                Image(systemName: "plus")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Palette.moon400)
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
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .disabled(model.taskDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("할 일 추가")
            }
            .padding(.leading, 12)
            .padding(.trailing, 5)
            .frame(height: 40)
            .background(Palette.moon100.opacity(0.07), in: RoundedRectangle(cornerRadius: 11))
            .overlay(RoundedRectangle(cornerRadius: 11)
                .strokeBorder(Palette.moon100.opacity(0.12), lineWidth: 1))

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
        .padding(.top, 16)
        .padding(.bottom, 15)
    }

    private func taskRow(_ task: LocalTask) -> some View {
        HStack(spacing: 8) {
            Button { withAnimation(PetMotion.hover) { model.toggleTask(task.id) } } label: {
                Image(systemName: task.isDone ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 16, weight: .light))
                    .foregroundStyle(task.isDone ? Palette.moon400 : Palette.moon300)
                    .frame(width: 27, height: 34)
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
                    .frame(width: 25, height: 30)
            }
            .buttonStyle(PetPressStyle())
            .accessibilityLabel("\(task.title) 삭제")
        }
        .frame(height: 39)
        .overlay(alignment: .bottom) { Palette.moon100.opacity(0.09).frame(height: 1) }
        .transition(.opacity.combined(with: .offset(y: 4)))
    }

    private var memoContent: some View {
        VStack(alignment: .leading, spacing: 13) {
            modeSwitch
            TextField("메모를 입력하세요", text: $model.memoDraft, axis: .vertical)
                .focused($focusedField, equals: .memo)
                .textFieldStyle(.plain)
                .font(.system(size: 12.5))
                .foregroundStyle(Palette.moon100)
                .lineLimit(7...7)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(8)
                .background(Palette.moon100.opacity(0.06), in: RoundedRectangle(cornerRadius: 11))
                .overlay(RoundedRectangle(cornerRadius: 11)
                    .strokeBorder(Palette.moon100.opacity(0.12), lineWidth: 1))
                .accessibilityLabel("메모 입력")
            HStack {
                footer(model.savedMemo == model.memoDraft ? "저장됨 · 이 Mac" : "수정됨 · 아직 저장 전")
                Spacer()
                Button("저장") { model.saveMemo() }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .disabled(model.savedMemo == model.memoDraft)
                    .accessibilityLabel("메모 저장")
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 16)
        .padding(.bottom, 16)
    }

    private func footer(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 10.5))
            .foregroundStyle(Palette.moon500)
    }
}
