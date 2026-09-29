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
        .onChange(of: model.chat.conversationKey) { _, _ in model.markCouncilRepliesRead() }
        .onChange(of: model.chat.scope) { _, _ in model.markCouncilRepliesRead() }
    }

    private var conversationControls: some View {
        HStack(spacing: 10) {
            Menu {
                Picker("담당 Office", selection: Binding(get: { model.chat.agent },
                                                        set: { _ = model.chat.selectAgent($0) })) {
                    ForEach(OfficeAgent.allCases) { agent in
                        Text("\(agent.title) · \(agent.role)").tag(agent)
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(model.chat.agent.title).font(.system(size: 13, weight: .semibold))
                        Text(model.chat.reviewers.isEmpty ? model.chat.agent.role : "회의실 · " + ([model.chat.agent] + model.chat.reviewers).map(\.title).joined(separator: "·")).font(.system(size: 10.5))
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
                    if let source = model.chat.topicSource { topicSource(source) }
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
            Text(model.chat.agent.responsibility)
                .font(.system(size: 12)).foregroundStyle(Palette.glassInkMuted)
            if model.chat.draft.isEmpty {
                ForEach(model.chat.agent.starters, id: \.self) { starter in
                    Button(starter) { model.chat.draft = starter; focused = true }
                        .buttonStyle(.plain).font(.system(size: 11.5))
                        .multilineTextAlignment(.leading).foregroundStyle(Palette.glassInkMuted)
                        .help("질문으로 가져오기 · 보내기를 눌러야 실행해요")
                }
            }
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
            if let council = turn.reply.council {
                OfficeDiscussionContent(discussion: council.discussion, isSending: model.chat.isSending) { agent in
                    _ = model.chat.continueWithAgent(agent); focused = true
                }
            }
            VStack(alignment: .leading, spacing: 8) {
                Text("\(turn.agent.title) · \(turn.reply.council == nil ? "답변" : "종합") · \(turn.scope.title)")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Palette.glassInkMuted)
                Text(turn.reply.answer)
                    .font(.system(size: 13)).lineSpacing(4)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                if let council = turn.reply.council {
                    DisclosureGroup("주관 추천 · 근거 · 남은 이견") {
                        VStack(alignment: .leading, spacing: 7) {
                            Text("주관 추천: " + council.recommendation)
                            ForEach(Array(council.evidence.enumerated()), id: \.offset) { _, text in Text("근거: " + text) }
                            ForEach(Array(council.dissent.enumerated()), id: \.offset) { _, text in Text("남은 이견: " + text) }
                            if council.dissent.isEmpty { Text("응답에 남은 이견 없음 · 사실 검증을 뜻하지 않아요.") }
                        }.font(.system(size: 11.5)).textSelection(.enabled).padding(.top, 5)
                    }.font(.system(size: 11.5)).foregroundStyle(Palette.glassInkMuted)
                }
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
                    .modifier(GlassGlyphShadow())
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
                 : "앱 실행 중 보관 · 최근 대화 일부 전달")
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
            Menu("함께 볼 관점 · 주관 포함 2~3명") {
                Text("주관 · " + model.chat.agent.title)
                ForEach(OfficeAgent.allCases.filter { $0 != model.chat.agent }) { agent in
                    Toggle("\(agent.title) · \(agent.role)", isOn: Binding(
                        get: { model.chat.reviewers.contains(agent) },
                        set: { _ in _ = model.chat.toggleReviewer(agent) }))
                        .disabled(!model.chat.reviewers.contains(agent) && model.chat.reviewers.count >= 2)
                }
                if !model.chat.reviewers.isEmpty {
                    Button("주관에게만 묻기") { _ = model.chat.continueWithAgent(model.chat.agent) }
                }
            }.disabled(model.chat.isSending)
            Button("일반 대화로 돌아가기") {
                _ = model.chat.selectTopic("general", scope: model.chat.scope, owner: model.selectedCharacter.officeAgent)
            }.disabled(model.chat.isSending)
            Divider()
            Button {
                model.chat.source = .text
                focused = true
            } label: { Label("직접 입력", systemImage: "text.cursor") }
            Button {
                model.prepareCouncilFromMemo()
                focused = true
            } label: { Label("현재 메모 불러오기", systemImage: "square.and.pencil") }
            .disabled(model.chat.isSending || model.memoDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
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
            .disabled(model.chat.isSending || model.displayedTasks.isEmpty)
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
        if model.chat.topicSource?.isNoticeSummary == true { return "알림 요약" }
        switch model.chat.source {
        case .text: return "직접 입력"
        case .memo: return "현재 메모"
        case .task: return "할 일"
        }
    }

    private func topicSource(_ source: OfficeTopicSource) -> some View {
        DisclosureGroup {
            VStack(alignment: .leading, spacing: 6) {
                Text(source.isNoticeSummary ? "알림 요약 · 상세 원문 미조회" : "운영자가 가져온 원문 복사본")
                Text("제목: " + source.title)
                Text("내용: " + source.detail)
                if let date = source.date { Text("관련 시각: " + date.formatted(date: .abbreviated, time: .shortened)) }
                if let path = source.path {
                    Text("Hub 원문: " + model.chat.conversationKey.origin + path)
                    Button("Hub 원문 열기", action: model.openTopicOriginal).buttonStyle(.plain)
                }
                Text("참고 자료는 길이에 따라 일부만 전달해요. 전체 복사본은 앱 실행 중 이 대화에 남아요.")
            }.font(.system(size: 11.5)).textSelection(.enabled).padding(.top, 5)
        } label: {
            Text((source.isNoticeSummary ? "알림 요약 · " : "가져온 자료 · ") + source.title)
                .font(.system(size: 11.5, weight: .medium)).lineLimit(2)
        }
        .padding(10).modifier(GlassReadability(radius: 12))
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
