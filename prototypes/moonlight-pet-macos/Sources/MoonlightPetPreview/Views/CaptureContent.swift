import SwiftUI

struct TaskCaptureContent: View {
    @ObservedObject var model: AppModel
    let surface: CompanionSurface
    let openRevision: Int
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 9) {
                Image(systemName: "plus")
                    .font(.system(size: 15, weight: .light))
                    .foregroundStyle(Palette.glassInkMuted)
                TextField("새 할 일", text: $model.taskDraft)
                    .textFieldStyle(.plain).font(.system(size: 13))
                    .focused($focused).onSubmit(addTask)
                    .accessibilityLabel("새 할 일")
                Button(action: addTask) {
                    Image(systemName: "arrow.up").font(.system(size: 14, weight: .medium))
                        .frame(width: 32, height: 32)
                }
                .buttonStyle(GlassActionStyle(compact: true))
                .disabled(model.taskDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("할 일 추가")
            }
            .padding(.leading, 13).padding(.trailing, 6).frame(height: 46)
            .modifier(GlassInputSurface(focused: focused))

            Text("남은 \(model.openTaskCount)개")
                .font(.system(size: 11.5)).monospacedDigit()
                .foregroundStyle(Palette.glassInkMuted)

            if model.tasks.isEmpty {
                VStack(spacing: 9) {
                    Image(systemName: "checklist").font(.system(size: 23, weight: .ultraLight))
                    Text("할 일 하나부터 적어볼까요?").font(.system(size: 12))
                }
                .foregroundStyle(Palette.glassInkMuted)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(model.tasks) { task in
                            Button {
                                withAnimation(PetMotion.hover) { model.toggleTask(task.id) }
                            } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: task.isDone ? "checkmark.circle.fill" : "circle")
                                        .font(.system(size: 19, weight: .ultraLight))
                                        .foregroundStyle(Palette.glassInkMuted)
                                    Text(task.title).font(.system(size: 13))
                                        .strikethrough(task.isDone)
                                        .foregroundStyle(task.isDone ? Palette.glassInkFaint : Palette.glassInk)
                                        .lineLimit(2).multilineTextAlignment(.leading)
                                    Spacer(minLength: 0)
                                }
                                .padding(.horizontal, 4)
                                .frame(maxWidth: .infinity, minHeight: 50, alignment: .leading)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(GlassQuietStyle())
                            .help(task.title + " · 우클릭하여 삭제")
                            .accessibilityLabel("\(task.title) \(task.isDone ? "완료 취소" : "완료")")
                            .accessibilityAction(named: Text("삭제")) { remove(task.id) }
                            .contextMenu { Button("삭제", role: .destructive) { remove(task.id) } }
                            .overlay(alignment: .bottom) { Palette.glassInk.opacity(0.08).frame(height: 1) }
                            .transition(.opacity.combined(with: .offset(y: 4)))
                        }
                    }
                }
                .scrollIndicators(.hidden)
                .frame(maxHeight: .infinity)
            }

            HStack {
                Text("이 Mac에 저장").foregroundStyle(Palette.glassInkFaint)
                Spacer()
                Button { model.openHub(.tasks) } label: { Label("Hub에서 열기", systemImage: "arrow.up.right") }
                    .buttonStyle(GlassQuietStyle())
            }
            .font(.system(size: 11))
        }
        .onAppear { focusInput() }
        .onChange(of: openRevision) { _, _ in focusInput() }
        .onChange(of: model.activeCompanion) { _, active in
            if active == surface { focusInput() } else { focused = false }
        }
    }

    private func focusInput() {
        DispatchQueue.main.async {
            // Double-click hides the quick host while its first-click focus is queued.
            guard model.activeCompanion == surface else { return }
            focused = true
        }
    }
    private func addTask() { withAnimation(PetMotion.panel) { model.addTask() } }
    private func remove(_ id: UUID) { withAnimation(PetMotion.panel) { model.removeTask(id) } }
}

struct MemoCaptureContent: View {
    @ObservedObject var model: AppModel
    let surface: CompanionSurface
    let openRevision: Int
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ZStack(alignment: .topLeading) {
                if model.memoDraft.isEmpty {
                    Text("떠오른 생각을 적어보세요.")
                        .foregroundStyle(Palette.glassInkFaint)
                        .padding(.leading, 5).padding(.top, 1)
                        .allowsHitTesting(false)
                }
                TextEditor(text: $model.memoDraft)
                    .scrollContentBackground(.hidden)
                    .scrollIndicators(.hidden)
                    .focused($focused)
                    .accessibilityLabel("메모 입력")
            }
            .font(.system(size: 16, weight: .regular))
            .lineSpacing(6)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

            HStack(alignment: .bottom, spacing: 12) {
                Text(model.memoDraft.isEmpty ? "이 Mac에 자동 저장" : "자동 저장됨 · 이 Mac")
                    .font(.system(size: 11)).foregroundStyle(Palette.glassInkMuted)
                Spacer(minLength: 0)
                VStack(alignment: .trailing, spacing: 5) {
                    Button(action: model.continueMemoInCouncil) {
                        HStack(spacing: 12) {
                            Label("Council에서 이어서", systemImage: "arrow.up.right")
                            Text("⌘↵").font(.system(size: 11)).foregroundStyle(Palette.glassInkMuted)
                        }
                    }
                    .buttonStyle(GlassActionStyle())
                    .help("메모를 복사하고 Council을 브라우저에서 엽니다")
                    Text("메모 복사 · 브라우저 열기")
                        .font(.system(size: 10.5)).foregroundStyle(Palette.glassInkFaint)
                }
            }
        }
        .onAppear { focusInput() }
        .onChange(of: openRevision) { _, _ in focusInput() }
        .onChange(of: model.activeCompanion) { _, active in
            if active == surface { focusInput() } else { focused = false }
        }
    }

    private func focusInput() {
        DispatchQueue.main.async {
            // Double-click hides the quick host while its first-click focus is queued.
            guard model.activeCompanion == surface else { return }
            focused = true
        }
    }
}
