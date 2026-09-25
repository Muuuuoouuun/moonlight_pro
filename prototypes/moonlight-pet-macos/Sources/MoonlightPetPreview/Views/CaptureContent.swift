import SwiftUI

struct TaskCaptureContent: View {
    @ObservedObject var model: AppModel
    let surface: CompanionSurface
    let openRevision: Int
    let openConnection: () -> Void
    @FocusState private var focused: Bool

    private var canChangeTasks: Bool { model.hub.canWriteTasks && !model.hub.isSavingTask }
    private var readMessage: String? {
        guard model.hub.isEnabled else { return nil }
        if let message = model.hub.errorMessage { return message }
        if model.hub.needsLogin { return "Hub 로그인이 필요해요. 입력한 할 일은 그대로 보관합니다." }
        return model.hub.taskMessage
    }
    private var isLoading: Bool { model.hub.isEnabled && (model.hub.isConnecting || model.hub.isRefreshing) }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 9) {
                Image(systemName: "plus").modifier(GlassGlyphShadow())
                    .font(.system(size: 15, weight: .light))
                    .foregroundStyle(Palette.glassInkMuted)
                TextField("새 할 일", text: $model.taskDraft,
                          prompt: Text("새 할 일").foregroundStyle(Palette.glassInkFaint))
                    .textFieldStyle(.plain).font(.system(size: 13))
                    .focused($focused).onSubmit(addTask)
                    .accessibilityLabel("새 할 일")
                    .modifier(GlassGlyphShadow())
                Button(action: addTask) {
                    Image(systemName: "arrow.up").modifier(GlassGlyphShadow()).font(.system(size: 14, weight: .medium))
                        .frame(width: 32, height: 32)
                }
                .buttonStyle(GlassActionStyle(compact: true))
                .disabled(!canChangeTasks || (!model.hub.hasPendingTask
                          && model.taskDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
                .accessibilityLabel(model.hub.isSavingTask ? "할 일 저장 중"
                                    : model.hub.hasPendingTask ? "이전 할 일 저장 확인" : "할 일 추가")
            }
            .padding(.leading, 13).padding(.trailing, 6).frame(height: 46)
            .modifier(GlassInputSurface(focused: focused))

            if model.displayedTasks.isEmpty {
                taskCount
                emptyContent.frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                taskList
            }

            HStack(spacing: 6) {
                Text(model.taskStatusLabel).foregroundStyle(Palette.glassInkFaint)
                    .lineLimit(1).help(model.taskStatusLabel)
                Spacer(minLength: 0)
                if model.hub.isEnabled { HubRefreshButton(model: model) }
                Button { model.openHub(.tasks) } label: { Label("Hub에서 열기", systemImage: "arrow.up.right") }
                    .buttonStyle(GlassQuietStyle())
            }
            .font(.system(size: 11.5, weight: .medium))
        }
        .animation(PetMotion.panel, value: model.displayedTasks.map(\.id))
        .onAppear { focusInput() }
        .onChange(of: openRevision) { _, _ in focusInput() }
        .onChange(of: model.activeCompanion) { _, active in
            if active == surface { focusInput() } else { focused = false }
        }
    }

    private var taskCount: some View {
        HStack(spacing: 6) {
            Text(model.displayedTasks.isEmpty && (readMessage != nil || isLoading)
                 ? (isLoading ? "불러오는 중…" : "할 일 확인 필요") : "남은 \(model.openTaskCount)개")
                .monospacedDigit()
            Spacer(minLength: 0)
            Menu {
                Toggle("완료한 할 일 포함", isOn: $model.showsCompletedTasks)
            } label: {
                Text(model.showsCompletedTasks ? "완료 포함" : "목록 보기")
            }
            .menuStyle(.borderlessButton).fixedSize()
            .accessibilityLabel("할 일 목록 보기 설정")
        }
        .font(.system(size: 11.5, weight: .medium))
        .foregroundStyle(Palette.glassInkMuted)
        .frame(height: 18, alignment: .leading)
    }

    private var taskList: some View {
        VStack(alignment: .leading, spacing: 10) {
            taskCount.padding(.horizontal, 4)
            ScrollView {
                VStack(spacing: 10) {
                    if let message = readMessage {
                        HubReadNotice(message: message, action: openConnection)
                    }
                    LazyVStack(spacing: 0) {
                        ForEach(model.displayedTasks) { task in taskRow(task) }
                    }
                }
            }
            .scrollIndicators(.hidden)
            .frame(maxHeight: .infinity)
        }
    }

    @ViewBuilder private var emptyContent: some View {
        if isLoading {
            HubReadNotice(message: "Hub에서 할 일을 불러오고 있어요.", symbol: "arrow.triangle.2.circlepath")
        } else if let message = readMessage {
            HubReadNotice(message: message, symbol: "exclamationmark.circle", action: openConnection)
        } else {
            VStack(spacing: 9) {
                Image(systemName: "checklist").modifier(GlassGlyphShadow()).font(.system(size: 23, weight: .ultraLight))
                Text(model.completedTaskCount > 0 ? "남은 할 일을 모두 마쳤어요." : "할 일 하나부터 적어볼까요?").font(.system(size: 12))
            }
            .foregroundStyle(Palette.glassInkMuted)
            .padding(12)
        }
    }

    private func taskRow(_ task: LocalTask) -> some View {
        Button {
            guard canChangeTasks else { return }
            withAnimation(PetMotion.hover) { model.toggleTask(task.id) }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: task.isDone ? "checkmark.circle.fill" : "circle").modifier(GlassGlyphShadow())
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
        .disabled(!canChangeTasks)
        .help(task.isDone ? "완료했어요 · 다시 눌러 취소 · 기본 목록에서 3초 뒤 숨김" : task.title + (model.hub.isEnabled ? " · 우클릭하여 Hub에서 열기" : " · 우클릭하여 삭제"))
        .accessibilityLabel("\(task.title) \(task.isDone ? "완료 취소" : "완료")")
        .accessibilityAction(named: Text(model.hub.isEnabled ? "Hub에서 열기" : "삭제")) {
            if model.hub.isEnabled { model.openHub(.tasks) } else { remove(task.id) }
        }
        .contextMenu {
            Button("Council 안건으로 준비") { model.prepareCouncilFromTask(task) }
            if model.hub.isEnabled {
                Button("Hub에서 열기") { model.openHub(.tasks) }
            } else {
                Button("삭제", role: .destructive) { remove(task.id) }
            }
        }
        .overlay(alignment: .bottom) { Palette.glassInk.opacity(0.08).frame(height: 1) }
        .transition(.opacity.combined(with: .offset(y: 4)))
    }

    private func focusInput() {
        DispatchQueue.main.async {
            // Double-click hides the quick host while its first-click focus is queued.
            guard model.activeCompanion == surface else { return }
            focused = true
        }
    }
    private func addTask() {
        guard canChangeTasks else { return }
        withAnimation(PetMotion.panel) { model.addTask() }
    }
    private func remove(_ id: UUID) {
        guard !model.hub.isEnabled else { return }
        withAnimation(PetMotion.panel) { model.removeTask(id) }
    }
}

struct MemoCaptureContent: View {
    @ObservedObject var model: AppModel
    let surface: CompanionSurface
    let openRevision: Int
    let close: () -> Void
    let openConnection: () -> Void
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
                    .modifier(GlassGlyphShadow())
            }
            .font(.system(size: 16, weight: .regular))
            .lineSpacing(6)
            .padding(14)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(Palette.glassControlFill.opacity(focused ? 0.075 : 0.045),
                        in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay { GlassRim(radius: 16, strength: focused ? 0.5 : 0.25) }
            .animation(PetMotion.hover, value: focused)

            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(model.memoStatusLabel).font(.system(size: 11.5, weight: .medium))
                    if let message = model.hub.errorMessage, model.hub.isEnabled {
                        Button(action: openConnection) {
                            Label(message, systemImage: "exclamationmark.circle")
                                .lineLimit(2).multilineTextAlignment(.leading)
                        }
                        .buttonStyle(GlassQuietStyle()).font(.system(size: 11))
                        .help(message + " · Hub 연결 확인")
                    } else if let receipt = model.hub.memoReceipt {
                        Text(receipt).font(.system(size: 11)).lineLimit(2)
                    }
                }
                .foregroundStyle(Palette.glassInkMuted)
                Spacer(minLength: 0)
                Button(action: model.saveMemoToHub) {
                    Label(model.hub.isSavingMemo ? "저장 중…" : model.hub.hasPendingMemo ? "저장 확인" : "Hub에 저장",
                          systemImage: "arrow.up.doc")
                }
                .buttonStyle(GlassActionStyle())
                .disabled(!model.hub.canSaveMemo || model.hub.isSavingMemo
                          || (!model.hub.hasPendingMemo
                              && model.memoDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
                .help("현재 메모를 Hub에 저장합니다. 이 Mac의 초안은 그대로 유지됩니다.")
                Button(action: close) {
                    Image(systemName: "chevron.down").modifier(GlassGlyphShadow())
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
}
