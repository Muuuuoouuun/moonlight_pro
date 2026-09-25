import SwiftUI

struct CouncilCompanionContent: View {
    @ObservedObject var model: AppModel
    let openConnection: () -> Void
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            conversationControls
            conversation
            composer
            footer
        }
        .foregroundStyle(Palette.glassInk)
        .onAppear { model.markCouncilRepliesRead() }
        .onChange(of: model.chat.agent) { _, _ in model.markCouncilRepliesRead() }
        .onChange(of: model.chat.scope) { _, _ in model.markCouncilRepliesRead() }
    }

    private var conversationControls: some View {
        HStack(spacing: 10) {
            Menu {
                Picker("담당 Office", selection: Binding(get: { model.chat.agent },
                                                        set: { model.chat.agent = $0 })) {
                    ForEach(OfficeAgent.allCases) { agent in
                        Text("\(agent.title) · \(agent.role)").tag(agent)
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(model.chat.agent.title).font(.system(size: 13, weight: .semibold))
                        Text(model.chat.agent.role).font(.system(size: 10.5))
                            .foregroundStyle(Palette.glassInkMuted)
                    }
                    Image(systemName: "chevron.down").font(.system(size: 10.5))
                }
            }
            .disabled(model.chat.isSending)
            .help(model.chat.isSending ? "담당자를 바꾸려면 먼저 기다림을 중단해 주세요." : "질문을 받을 담당 Office를 선택해요.")
            .accessibilityLabel("담당 Office: \(model.chat.agent.title), \(model.chat.agent.role)")
            Spacer(minLength: 0)
            Menu {
                Picker("업무 범위", selection: Binding(get: { model.chat.scope },
                                                      set: { model.chat.scope = $0 })) {
                    ForEach(OfficeChatScope.allCases) { scope in
                        Text(scope.title).tag(scope)
                    }
                }
            } label: {
                Label(model.chat.scope.title, systemImage: "line.3.horizontal.decrease")
                    .font(.system(size: 11.5))
            }
            .disabled(model.chat.isSending)
            .help(model.chat.isSending ? "업무 범위를 바꾸려면 먼저 기다림을 중단해 주세요." : "대화할 업무 범위를 선택해요.")
            .accessibilityLabel("업무 범위: \(model.chat.scope.title)")
            moreMenu
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .padding(.horizontal, 10).padding(.vertical, 7)
        .modifier(GlassReadability(radius: 12))
    }

    private var conversation: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    if model.chat.turns.isEmpty && !model.chat.isSending {
                        emptyConversation
                    }
                    ForEach(model.chat.turns) { turn in
                        turnContent(turn)
                    }
                    if let message = model.chat.pendingMessage {
                        VStack(alignment: .leading, spacing: 9) {
                            question(message)
                            HStack(spacing: 8) {
                                ProgressView().controlSize(.small)
                                Text("답변 기다리는 중").font(.system(size: 12))
                            }
                            .padding(10)
                            .modifier(GlassReadability(radius: 12))
                            .accessibilityElement(children: .combine)
                        }
                    }
                    if let message = model.chat.errorMessage {
                        feedback(message, symbol: "exclamationmark.bubble")
                    }
                    if let message = model.council.handoffMessage {
                        feedback(message, symbol: "arrow.up.right")
                    }
                    Color.clear.frame(height: 1).id("conversation-end")
                }
                .padding(2)
            }
            .frame(maxWidth: .infinity, minHeight: 100, maxHeight: .infinity)
            .onChange(of: model.chat.turns.last?.id) { _, _ in
                proxy.scrollTo("conversation-end", anchor: .bottom)
            }
            .onChange(of: model.chat.isSending) { _, _ in
                proxy.scrollTo("conversation-end", anchor: .bottom)
            }
            .onChange(of: model.chat.errorMessage) { _, _ in
                proxy.scrollTo("conversation-end", anchor: .bottom)
            }
        }
    }

    private var emptyConversation: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("담당 Office에 바로 물어보세요")
                .font(.system(size: 14, weight: .medium))
            Text("답변을 여기서 읽고, 이어서 질문할 수 있어요.")
                .font(.system(size: 12)).foregroundStyle(Palette.glassInkMuted)
            if !model.chat.hasConnection {
                Text("질문을 보내려면 Hub 연결이 필요해요. 초안은 앱 실행 중에만 유지돼요.")
                    .font(.system(size: 11.5)).foregroundStyle(Palette.glassInkMuted)
                Button("Hub 연결", action: openConnection)
                    .buttonStyle(GlassActionStyle())
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .modifier(GlassReadability(radius: 14))
    }

    private func turnContent(_ turn: OfficeChatTurn) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            question(turn.message)
            VStack(alignment: .leading, spacing: 8) {
                Text("\(turn.agent.title) · \(turn.scope.title)")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Palette.glassInkMuted)
                Text(turn.reply.answer)
                    .font(.system(size: 13)).lineSpacing(4)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                if !turn.reply.nextAction.isEmpty || !turn.reply.contextNote.isEmpty
                    || !turn.reply.contextSource.isEmpty || !turn.reply.logPersisted {
                    DisclosureGroup("다음 행동 · 답변 근거") {
                        VStack(alignment: .leading, spacing: 8) {
                            if !turn.reply.nextAction.isEmpty {
                                Text(turn.reply.nextAction)
                            }
                            if !turn.reply.contextNote.isEmpty {
                                Text(turn.reply.contextNote)
                            }
                            if !turn.reply.contextSource.isEmpty {
                                Text(turn.reply.contextSource == "provided"
                                     ? "참고한 문맥: 입력한 내용과 최근 대화"
                                     : "참고한 문맥을 확인하지 못했어요.")
                            }
                            if !turn.reply.logPersisted {
                                Text("이 답변의 Hub 기록 저장은 확인되지 않았어요.")
                            }
                        }
                        .font(.system(size: 11.5)).lineSpacing(3)
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 5)
                    }
                    .font(.system(size: 11.5))
                    .foregroundStyle(Palette.glassInkMuted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .modifier(GlassReadability(radius: 14))
        }
    }

    private func question(_ message: String) -> some View {
        HStack {
            Spacer(minLength: 22)
            VStack(alignment: .leading, spacing: 4) {
                Text("나").font(.system(size: 10.5, weight: .medium))
                    .foregroundStyle(Palette.glassInkMuted)
                Text(message).font(.system(size: 12)).lineSpacing(3)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(10)
            .modifier(GlassReadability(radius: 12))
        }
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("질문 · \(sourceLabel)")
                Spacer(minLength: 0)
                Text("\(model.chat.draft.utf16.count.formatted()) / 6,000")
                    .monospacedDigit()
            }
            .font(.system(size: 10.5)).foregroundStyle(Palette.glassInkMuted)
            .modifier(GlassReadability(radius: 8, inset: 3))
            ZStack(alignment: .topLeading) {
                if model.chat.draft.isEmpty {
                    Text("담당자에게 물어볼 내용을 적어보세요.")
                        .foregroundStyle(Palette.glassInkFaint)
                        .padding(.leading, 5).padding(.top, 1)
                        .allowsHitTesting(false)
                }
                TextEditor(text: Binding(get: { model.chat.draft },
                                         set: { model.chat.draft = $0 }))
                    .scrollContentBackground(.hidden)
                    .focused($focused)
                    .accessibilityLabel("담당 Office에게 질문")
            }
            .font(.system(size: 13)).lineSpacing(4)
            .padding(10).frame(height: 82)
            .modifier(GlassInputSurface(focused: focused))
        }
    }

    private var footer: some View {
        HStack(spacing: 8) {
            Text(model.chat.draft.utf16.count > 6000
                 ? "질문은 6,000자 이내로 적어 주세요."
                 : "대화·초안은 앱 실행 중 유지")
                .font(.system(size: 10.5)).foregroundStyle(Palette.glassInkMuted)
                .fixedSize(horizontal: false, vertical: true)
                .modifier(GlassReadability(radius: 8, inset: 4))
            Spacer(minLength: 0)
            if model.chat.isSending {
                Button("기다림 중단", action: model.chat.cancelWaiting)
                    .buttonStyle(GlassActionStyle())
                    .help("기다림을 중단하고 입력을 보관해요. 다시 보내면 새 요청이에요.")
            } else {
                Button(action: model.sendCouncilMessage) {
                    Label("질문 보내기", systemImage: "arrow.up")
                }
                .buttonStyle(GlassActionStyle())
                .keyboardShortcut(.return, modifiers: .command)
                .disabled(!model.canSendCouncil)
            }
        }
    }

    private var moreMenu: some View {
        Menu {
            Button {
                model.chat.source = .text
                focused = true
            } label: { Label("직접 입력", systemImage: "text.cursor") }
            Button {
                model.prepareCouncilFromMemo()
                focused = true
            } label: { Label("현재 메모 불러오기", systemImage: "square.and.pencil") }
            .disabled(model.memoDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            Menu {
                ForEach(model.displayedTasks) { task in
                    Button {
                        model.prepareCouncilFromTask(task)
                        focused = true
                    } label: {
                        Text(task.title.count > 30 ? String(task.title.prefix(30)) + "…" : task.title)
                    }
                    .help(task.title)
                }
            } label: { Label("할 일 불러오기", systemImage: "checklist") }
            .disabled(model.displayedTasks.isEmpty)
            Divider()
            Button("브랜드 Council에서 검토", action: model.openChatInCouncil)
                .disabled(!model.canOpenChatInCouncil)
            Button("현재 대화 비우기", action: model.chat.clearConversation)
                .disabled(model.chat.isSending || model.chat.turns.isEmpty)
            Button("Hub 연결 설정", action: openConnection)
        } label: {
            Image(systemName: "ellipsis").frame(width: 24, height: 28)
        }
        .fixedSize()
        .accessibilityLabel("질문 불러오기와 대화 더보기")
        .help("메모와 할 일 원본을 유지하며 질문으로 불러올 수 있어요.")
    }

    private var sourceLabel: String {
        switch model.chat.source {
        case .text: return "직접 입력"
        case .memo: return "현재 메모"
        case .task: return "할 일"
        }
    }

    private func feedback(_ message: String, symbol: String) -> some View {
        Label(message, systemImage: symbol)
            .font(.system(size: 11.5)).foregroundStyle(Palette.glassInkMuted)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .modifier(GlassReadability(radius: 12))
    }
}
