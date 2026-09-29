import SwiftUI

struct OfficeDiscussionContent: View {
    let discussion: OfficeDiscussion
    let isSending: Bool
    let continueWith: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Office 회의실 · 같은 모델의 역할별 관점, 독립 사실 검증 아님")
                .font(.system(size: 10.5)).foregroundStyle(Palette.glassInkMuted)
            ForEach(Array(discussion.turns.enumerated()), id: \.offset) { index, speech in
                VStack(alignment: .leading, spacing: 7) {
                    HStack {
                        Text("\(speech.ownerId.title) · \(speech.round == "position" ? "첫 의견" : "재검토")")
                            .font(.system(size: 11, weight: .semibold))
                        Spacer(minLength: 0)
                        Menu {
                            Button("이 담당자에게 이어서") { continueWith(index) }
                                .disabled(isSending)
                        } label: { Image(systemName: "ellipsis").frame(width: 24, height: 24) }
                        .menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize()
                        .accessibilityLabel("\(speech.ownerId.title) 발언 더보기")
                    }
                    Text(speech.position).font(.system(size: 12)).lineSpacing(3).textSelection(.enabled)
                    DisclosureGroup("근거 · 반론 · 바꿀 조건") {
                        VStack(alignment: .leading, spacing: 5) {
                            ForEach(Array(speech.evidence.enumerated()), id: \.offset) { _, text in Text("근거: " + text) }
                            if !speech.objection.isEmpty { Text("반론: " + speech.objection) }
                            Text("바꿀 조건: " + speech.revisionCondition)
                            if speech.round == "response" {
                                Text("응답 대상: " + speech.replyTo.map(\.title).joined(separator: ", "))
                                Text((speech.changed ? "입장 변경: " : "입장 유지: ") + speech.changeReason)
                            }
                        }.font(.system(size: 11.5)).textSelection(.enabled).padding(.top, 4)
                    }.font(.system(size: 11.5)).foregroundStyle(Palette.glassInkMuted)
                }
                .fixedSize(horizontal: false, vertical: true)
                .padding(10).modifier(GlassReadability(radius: 12))
            }
        }
    }
}
