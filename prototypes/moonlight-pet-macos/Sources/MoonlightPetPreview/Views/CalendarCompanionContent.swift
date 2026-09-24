import SwiftUI

struct CalendarCompanionContent: View {
    @ObservedObject var model: AppModel

    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            VStack(alignment: .leading, spacing: 24) {
                HStack(spacing: 3) {
                    ForEach(CompanionDate.week(containing: context.date), id: \.self) { date in
                        let isToday = Calendar.current.isDate(date, inSameDayAs: context.date)
                        VStack(spacing: 12) {
                            Text(CompanionDate.weekday(date)).font(.system(size: 10.5))
                            Text("\(Calendar.current.component(.day, from: date))")
                                .font(.system(size: 14, weight: isToday ? .semibold : .regular))
                                .monospacedDigit()
                        }
                        .foregroundStyle(isToday ? Palette.glassInk : Palette.glassInkMuted)
                        .frame(maxWidth: .infinity).frame(height: 62)
                        .background {
                            if isToday {
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(Palette.glassInk.opacity(0.09))
                                    .overlay { GlassRim(radius: 12, strength: 0.4) }
                            }
                        }
                        .accessibilityLabel(CompanionDate.label(date) + (isToday ? " 오늘" : ""))
                    }
                }
                Spacer(minLength: 0)
                VStack(alignment: .leading, spacing: 10) {
                    Text("일정은 Hub에서 이어서")
                        .font(.system(size: 16, weight: .medium))
                    Text("위젯에는 아직 일정을 연결하지 않았어요.")
                        .font(.system(size: 12)).foregroundStyle(Palette.glassInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Button { model.openHub(.calendar) } label: {
                    Label("Hub 일정 열기", systemImage: "arrow.up.right")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(GlassActionStyle())
                Spacer(minLength: 0)
                Text("브라우저에서 열기")
                    .font(.system(size: 11)).foregroundStyle(Palette.glassInkFaint)
            }
        }
    }
}
