import AppKit
import SwiftUI

struct CouncilCompanionContent: View {
    @ObservedObject var model: AppModel
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Text("검토할 안건")
                    .font(.system(size: 13, weight: .medium))
                Spacer(minLength: 0)
                sourceMenu
            }
            .modifier(GlassReadability(radius: 10, inset: 8))

            ZStack(alignment: .topLeading) {
                if model.council.draft.isEmpty {
                    Text("함께 검토할 내용이나 질문을 적어보세요.")
                        .foregroundStyle(Palette.glassInkFaint)
                        .padding(.leading, 5).padding(.top, 1)
                        .allowsHitTesting(false)
                }
                TextEditor(text: Binding(get: { model.council.draft },
                                         set: { model.council.draft = $0 }))
                    .scrollContentBackground(.hidden)
                    .scrollIndicators(.hidden)
                    .focused($focused)
                    .accessibilityLabel("Council 안건")
            }
            .font(.system(size: 15))
            .lineSpacing(6)
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: 112, maxHeight: .infinity, alignment: .topLeading)
            .background {
                GeometryReader { geometry in
                    Color.clear
                        .frame(height: readingHeight(in: geometry.size))
                        .modifier(GlassReadability(radius: 16))
                }
                .allowsHitTesting(false)
            }
            .overlay { GlassRim(radius: 16, strength: focused ? 0.5 : 0.25) }

            if let message = model.council.validationMessage {
                feedback(message, symbol: "info.circle")
            } else if let message = model.council.handoffMessage {
                feedback(message, symbol: "arrow.up.right")
            }

            HStack(alignment: .center, spacing: 14) {
                Text("안건을 브라우저로 넘겨요.\n검토 후 실행할 수 있어요.")
                    .font(.system(size: 11)).foregroundStyle(Palette.glassInkMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .modifier(GlassReadability(radius: 9, inset: 7))
                Spacer(minLength: 0)
                Button(action: model.openCouncilDraft) {
                    Label("Council에서 검토", systemImage: "arrow.up.right")
                }
                .buttonStyle(GlassActionStyle())
                .disabled(!model.council.canOpen)
            }
        }
        .foregroundStyle(Palette.glassInk)
    }

    private var sourceMenu: some View {
        Menu {
            Button {
                model.council.source = .text
                focused = true
            } label: {
                Label("직접 입력", systemImage: "text.cursor")
            }
            Button {
                model.prepareCouncilFromMemo()
                focused = true
            } label: {
                Label("현재 메모 불러오기", systemImage: "square.and.pencil")
            }
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
            } label: {
                Label("할 일 불러오기", systemImage: "checklist")
            }
            .disabled(model.displayedTasks.isEmpty)
        } label: {
            Label(sourceLabel, systemImage: "chevron.down")
                .font(.system(size: 11.5))
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .foregroundStyle(Palette.glassInkMuted)
        .accessibilityLabel("안건 출처: \(sourceLabel)")
        .help("불러온 내용을 자유롭게 수정할 수 있어요. 메모와 할 일 원본은 유지됩니다.")
    }

    private var sourceLabel: String {
        switch model.council.source {
        case .text: return "직접 입력"
        case .memo: return "현재 메모"
        case .task: return "할 일"
        }
    }

    private func feedback(_ message: String, symbol: String) -> some View {
        Label(message, systemImage: symbol)
            .font(.system(size: 11.5)).foregroundStyle(Palette.glassInkMuted)
            .fixedSize(horizontal: false, vertical: true)
            .modifier(GlassReadability(radius: 9, inset: 6))
    }

    private func readingHeight(in size: CGSize) -> CGFloat {
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = 6
        let text = model.council.draft.isEmpty ? " " : model.council.draft + " "
        let bounds = (text as NSString).boundingRect(
            with: CGSize(width: max(1, size.width - 38), height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: [.font: NSFont.systemFont(ofSize: 15), .paragraphStyle: paragraph])
        return min(size.height, max(54, ceil(bounds.height) + 34))
    }
}
