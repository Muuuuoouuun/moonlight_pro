import SwiftUI

struct TaskCaptureContent: View {
    @ObservedObject var model: AppModel
    let surface: CompanionSurface
    let openRevision: Int
    let openConnection: () -> Void
    @FocusState private var focused: Bool
    @State private var pendingDeletion: DeletionTarget?
    @State private var isEditing = false
    @State private var selectedIDs: Set<UUID> = []

    private struct DeletionTarget {
        let tasks: [LocalTask]
        let hubURL: String?
        let generation: Int
        var title: String { tasks.count == 1 ? "할 일을 삭제할까요?" : "선택한 \(tasks.count)개 할 일을 삭제할까요?" }
        var message: String {
            let names = tasks.prefix(3).map { "“\($0.title)”" }.joined(separator: "\n")
            let rest = tasks.count > 3 ? "\n외 \(tasks.count - 3)개" : ""
            return names + rest + "\n" + (hubURL != nil
                ? "Hub의 원본 할 일도 삭제되며 되돌릴 수 없어요."
                : "이 Mac에 저장한 할 일을 삭제하며 되돌릴 수 없어요.")
        }
    }

    private var canChangeTasks: Bool { model.hub.canWriteTasks }
    private var canAddTask: Bool { canChangeTasks && !model.hub.isCreatingTask }
    private var readMessage: String? {
        guard model.hub.isEnabled else { return nil }
        if let message = model.hub.errorMessage { return message }
        if model.hub.needsLogin { return "Hub 앱에서 로그인하면 자동으로 연결돼요. 입력한 할 일은 그대로 보관합니다." }
        return model.hub.taskMessage
    }
    private var isLoading: Bool { model.hub.isEnabled && !model.hub.taskReady && !model.hub.needsLogin && (model.hub.isConnecting || model.hub.isRefreshing) }

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
                    .disabled(isEditing)
                    .modifier(GlassGlyphShadow())
                Button(action: addTask) {
                    Image(systemName: "arrow.up").modifier(GlassGlyphShadow()).font(.system(size: 14, weight: .medium))
                        .frame(width: 32, height: 32)
                }
                .buttonStyle(GlassActionStyle(compact: true))
                .disabled(isEditing || !canAddTask || (!model.hub.hasPendingTask
                          && model.taskDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
                .accessibilityLabel(model.hub.isCreatingTask ? "할 일 저장 중"
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
                HubOpenButton(model: model, mode: .tasks)
            }
            .font(.system(size: 11.5, weight: .medium))
        }
        .animation(PetMotion.panel, value: model.displayedTasks.map(\.id))
        .onAppear { focusInput() }
        .onChange(of: openRevision) { _, _ in resetEditing(); focusInput() }
        .onChange(of: model.activeCompanion) { _, active in
            if active == surface { focusInput() } else { focused = false; resetEditing() }
        }
        .alert(pendingDeletion?.title ?? "할 일 삭제", isPresented: Binding(
            get: { pendingDeletion != nil },
            set: { if !$0 { pendingDeletion = nil } }
        ), presenting: pendingDeletion) { target in
            Button("취소", role: .cancel) {}
            Button("삭제", role: .destructive) { remove(target) }
        } message: { target in
            Text(target.message)
        }
        .onChange(of: model.hubBaseURL) { _, _ in resetEditing() }
        .onChange(of: model.hub.isEnabled) { _, _ in resetEditing() }
        .onChange(of: model.hub.connectionGeneration) { _, _ in resetEditing() }
        .onChange(of: model.displayedTasks.map(\.id)) { _, ids in
            selectedIDs.formIntersection(ids)
            if ids.isEmpty { isEditing = false }
        }
    }

    private var taskCount: some View {
        HStack(spacing: 6) {
            Text(isEditing ? "\(selectedIDs.count)개 선택" : model.displayedTasks.isEmpty && (readMessage != nil || isLoading)
                 ? (isLoading ? "불러오는 중…" : "할 일 확인 필요") : "남은 \(model.openTaskCount)개")
                .monospacedDigit()
            Spacer(minLength: 0)
            if isEditing {
                Button(selectedIDs.count == model.displayedTasks.count ? "선택 해제" : "전체 선택") {
                    selectedIDs = selectedIDs.count == model.displayedTasks.count ? [] : Set(model.displayedTasks.map(\.id))
                }
                .buttonStyle(GlassQuietStyle()).disabled(!canChangeTasks)
                Button(role: .destructive) { requestDeletion(model.displayedTasks.filter { selectedIDs.contains($0.id) }) } label: {
                    Label("삭제", systemImage: "trash").modifier(GlassGlyphShadow())
                }
                .buttonStyle(GlassQuietStyle()).disabled(selectedIDs.isEmpty || !canChangeTasks)
                .accessibilityLabel("선택한 할 일 삭제")
                Button("완료") { resetEditing(); focusInput() }
                    .buttonStyle(GlassQuietStyle()).disabled(model.hub.isSavingTask)
                    .accessibilityLabel("할 일 편집 완료")
            } else {
                Menu {
                    Toggle("완료한 할 일 포함", isOn: $model.showsCompletedTasks)
                } label: {
                    Text(model.showsCompletedTasks ? "완료 포함" : "목록 보기")
                }
                .menuStyle(.borderlessButton).fixedSize()
                .accessibilityLabel("할 일 목록 보기 설정")
                Button("편집") { focused = false; selectedIDs = []; isEditing = true }
                    .buttonStyle(GlassQuietStyle())
                    .disabled(model.displayedTasks.isEmpty || !canChangeTasks)
                    .accessibilityLabel("할 일 편집")
            }
        }
        .font(.system(size: 11.5, weight: .medium))
        .foregroundStyle(Palette.glassInkMuted)
        .frame(height: 28, alignment: .leading)
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
        let isSaving = model.hub.isEnabled && model.hub.savingTaskIDs.contains(task.id)
        let isDeleting = model.hub.isEnabled && model.hub.deletingTaskIDs.contains(task.id)
        let checked = isSaving ? !task.isDone : task.isDone
        return Button {
            guard canChangeTasks, !model.hub.isTaskBusy(task.id) else { return }
            if isEditing {
                if selectedIDs.contains(task.id) { selectedIDs.remove(task.id) }
                else { selectedIDs.insert(task.id) }
                return
            }
            withAnimation(PetMotion.hover) { model.toggleTask(task.id) }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: isEditing ? (selectedIDs.contains(task.id) ? "checkmark.square.fill" : "square")
                      : checked ? "checkmark.circle.fill" : "circle").modifier(GlassGlyphShadow())
                    .font(.system(size: 19, weight: .ultraLight))
                    .foregroundStyle(isEditing && selectedIDs.contains(task.id) ? Palette.danger : Palette.glassInkMuted)
                Text(task.title).font(.system(size: 13))
                    .strikethrough(task.isDone)
                    .foregroundStyle(task.isDone ? Palette.glassInkFaint : Palette.glassInk)
                    .lineLimit(2).multilineTextAlignment(.leading)
                Spacer(minLength: 0)
                if isSaving || isDeleting {
                    Text(isDeleting ? "삭제 중…" : "저장 중…").font(.system(size: 10.5))
                        .foregroundStyle(Palette.glassInkMuted)
                }
            }
            .padding(.horizontal, 4)
            .frame(maxWidth: .infinity, minHeight: 50, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(GlassQuietStyle())
        .disabled(!canChangeTasks || model.hub.isTaskBusy(task.id))
        .help(isEditing ? "삭제할 할 일 선택 · 완료 상태는 바뀌지 않아요." : task.isDone ? "완료했어요 · 다시 눌러 취소 · 우클릭하여 삭제 · 기본 목록에서 3초 뒤 숨김" : task.title + " · 우클릭하여 삭제")
        .accessibilityLabel("\(task.title) \(isDeleting ? "삭제 중" : isSaving ? "저장 중" : isEditing ? "선택" : task.isDone ? "완료 취소" : "완료")")
        .accessibilityValue(isEditing ? (selectedIDs.contains(task.id) ? "선택됨" : "선택 안 됨") : task.isDone ? "완료됨" : "미완료")
        .accessibilityAddTraits(isEditing && selectedIDs.contains(task.id) ? .isSelected : [])
        .accessibilityActions {
            if model.hub.isEnabled { Button("Hub에서 열기") { model.openHub(.tasks) } }
            Button("삭제…") { requestDeletion([task]) }
        }
        .contextMenu {
            Button("Office 회의 안건으로 준비") { model.prepareOfficeFromTask(task) }
            Button("이 할 일로 담당자에게 묻기") { model.prepareCouncilFromTask(task) }
            if model.hub.isEnabled {
                Button("Hub에서 열기") { model.openHub(.tasks) }
            }
            Divider()
            Button("삭제…", role: .destructive) { requestDeletion([task]) }
                .disabled(!canChangeTasks)
        }
        .overlay(alignment: .bottom) { Palette.glassInk.opacity(0.08).frame(height: 1) }
        .transition(.opacity.combined(with: .offset(y: 4)))
    }

    private func focusInput() {
        DispatchQueue.main.async {
            // Double-click hides the quick host while its first-click focus is queued.
            guard model.activeCompanion == surface, !isEditing else { return }
            focused = true
        }
    }
    private func addTask() {
        guard canAddTask, !isEditing else { return }
        withAnimation(PetMotion.panel) { model.addTask() }
    }
    private func resetEditing() {
        isEditing = false; selectedIDs = []; pendingDeletion = nil
    }
    private func requestDeletion(_ tasks: [LocalTask]) {
        guard canChangeTasks, !tasks.isEmpty, tasks.allSatisfy({ !model.hub.isTaskBusy($0.id) }) else { return }
        pendingDeletion = DeletionTarget(tasks: tasks, hubURL: model.hub.isEnabled ? model.hubBaseURL : nil, generation: model.hub.connectionGeneration)
    }
    private func remove(_ target: DeletionTarget) {
        guard canChangeTasks, target.generation == model.hub.connectionGeneration,
              target.hubURL == (model.hub.isEnabled ? model.hubBaseURL : nil) else { return }
        Task {
            guard canChangeTasks, target.generation == model.hub.connectionGeneration,
                  target.hubURL == (model.hub.isEnabled ? model.hubBaseURL : nil) else { return }
            let deleted = await model.removeTasks(target.tasks.map(\.id))
            guard target.generation == model.hub.connectionGeneration, target.hubURL == (model.hub.isEnabled ? model.hubBaseURL : nil) else { return }
            selectedIDs.subtract(deleted)
        }
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
                    // .hidden can reserve a legacy scroller gutter on macOS
                    // (e.g. with a mouse). Keep the memo's glass edge clear.
                    .scrollIndicators(.never)
                    .focused($focused)
                    .accessibilityLabel("메모 입력")
                    .modifier(GlassGlyphShadow())
            }
            .font(.system(size: 16, weight: .regular))
            .lineSpacing(6)
            .padding(14)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .modifier(GlassInputSurface(focused: focused))

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
                        .accessibilityLabel(model.hub.needsLogin ? "Hub 로그인 · " + message : "Hub 연결 확인 · " + message)
                    } else if model.memoDraft.isEmpty, let receipt = model.memoCaptureReceipt {
                        Text(receipt).font(.system(size: 11)).lineLimit(2)
                    } else if let receipt = model.hub.memoReceipt {
                        Text(receipt).font(.system(size: 11)).lineLimit(2)
                    }
                }
                .foregroundStyle(Palette.glassInkMuted)
                Spacer(minLength: 0)
                Button(action: model.saveMemoToHub) {
                    Label(model.hub.isSavingMemo ? "저장 중…" : model.hub.hasPendingMemo ? "저장 확인" : model.hub.isEnabled ? "Hub에 저장" : "Mac에 저장",
                          systemImage: "arrow.up.doc")
                }
                .buttonStyle(GlassActionStyle())
                .disabled((model.hub.isEnabled && !model.hub.canSaveMemo) || model.isCapturingMemo || model.hub.isSavingMemo
                          || (!model.hub.hasPendingMemo
                              && model.memoDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
                .help("저장 확인 후 새 메모로 시작합니다 · ⌃Enter / ⌘Enter. 저장 중 바꾼 내용은 유지됩니다.")
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
