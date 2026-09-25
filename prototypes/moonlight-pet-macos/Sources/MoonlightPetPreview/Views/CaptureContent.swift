import AppKit
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
                TextField("새 할 일", text: $model.taskDraft,
                          prompt: Text("새 할 일").foregroundStyle(Palette.glassInkFaint))
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
                .modifier(GlassReadability(radius: 8, inset: 8))

            if model.tasks.isEmpty {
                VStack(spacing: 9) {
                    Image(systemName: "checklist").font(.system(size: 23, weight: .ultraLight))
                    Text("할 일 하나부터 적어볼까요?").font(.system(size: 12))
                }
                .foregroundStyle(Palette.glassInkMuted)
                .padding(12)
                .modifier(GlassReadability(radius: 14, inset: 3))
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
                    .modifier(GlassReadability(radius: 12))
                }
                .scrollIndicators(.hidden)
                .frame(maxHeight: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }

            HStack {
                Text("이 Mac에 저장").foregroundStyle(Palette.glassInkFaint)
                Spacer()
                Button { model.openHub(.tasks) } label: { Label("Hub에서 열기", systemImage: "arrow.up.right") }
                    .buttonStyle(GlassQuietStyle())
            }
            .font(.system(size: 11))
            .modifier(GlassReadability(radius: 10, inset: 8))
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
    let close: () -> Void
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
            .padding(14)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background {
                GeometryReader { geometry in
                    Color.clear
                        .frame(height: readingHeight(in: geometry.size))
                        .modifier(GlassReadability(radius: 16))
                }
                .allowsHitTesting(false)
            }
            .overlay { GlassRim(radius: 16, strength: 0.25) }

            HStack(alignment: .center, spacing: 12) {
                Text(model.memoDraft.isEmpty ? "이 Mac에 자동 저장" : "자동 저장됨 · 이 Mac")
                    .font(.system(size: 11)).foregroundStyle(Palette.glassInkMuted)
                    .modifier(GlassReadability(radius: 8, inset: 8))
                Spacer(minLength: 0)
                Button(action: close) {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 15, weight: .medium))
                        .frame(width: 36, height: 36)
                }
                .buttonStyle(GlassActionStyle(compact: true))
                .accessibilityLabel("메모 접기")
                .help("펫으로 접기 · Esc")
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

    private func readingHeight(in size: CGSize) -> CGFloat {
        // Protect written lines and the insertion line, not the whole empty
        // notebook. Once text fills the viewport, its full scroll area is covered.
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = 6
        let text = model.memoDraft.isEmpty ? " " : model.memoDraft + " "
        let bounds = (text as NSString).boundingRect(
            with: CGSize(width: max(1, size.width - 38), height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: [.font: NSFont.systemFont(ofSize: 16), .paragraphStyle: paragraph])
        return min(size.height, max(54, ceil(bounds.height) + 34))
    }
}
