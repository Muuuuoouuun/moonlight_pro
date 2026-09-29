import SwiftUI

struct CalendarCompanionContent: View {
    @ObservedObject var model: AppModel
    let openConnection: () -> Void

    private var events: [HubCalendarEvent] {
        model.hub.events.filter { $0.occurs(on: model.hub.selectedDate) }.sorted {
            if $0.allDay != $1.allDay { return $0.allDay }
            return $0.start < $1.start
        }
    }
    private var readMessage: String? {
        if !model.hub.isEnabled { return "Hub 연결이 꺼져 있어요. 연결하면 일정을 함께 볼 수 있어요." }
        if let message = model.hub.errorMessage { return message }
        if model.hub.needsLogin { return "Hub에 로그인하면 일정을 불러올 수 있어요." }
        return model.hub.calendarMessage
    }
    private var isLoading: Bool { model.hub.isEnabled && (model.hub.isConnecting || model.hub.isRefreshing) }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            weekStrip
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if let message = readMessage {
                        HubReadNotice(message: message, symbol: model.hub.needsLogin ? "lock" : "info.circle",
                                      action: openConnection)
                    }
                    if !events.isEmpty {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            ForEach(events) { event in eventRow(event) }
                        }
                    } else if isLoading {
                        HubReadNotice(message: "Hub에서 일정을 불러오고 있어요.", symbol: "arrow.triangle.2.circlepath")
                    } else if readMessage == nil {
                        VStack(alignment: .leading, spacing: 9) {
                            Text("이날 예정된 일정이 없어요.")
                                .font(.system(size: 15, weight: .medium))
                            Text(CompanionDate.label(model.hub.selectedDate))
                                .font(.system(size: 12, weight: .medium)).foregroundStyle(Palette.glassInkMuted)
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            .scrollIndicators(.hidden)
            .frame(maxHeight: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            HStack(spacing: 6) {
                Text(model.hub.connectionLabel).foregroundStyle(Palette.glassInkFaint)
                    .lineLimit(1).help(model.hub.connectionLabel)
                Spacer(minLength: 0)
                if model.hub.isEnabled { HubRefreshButton(model: model) }
                Button { model.openHub(.calendar) } label: {
                    Label("Hub에서 열기", systemImage: "arrow.up.right")
                }
                .buttonStyle(GlassQuietStyle())
            }
            .font(.system(size: 11.5, weight: .medium))
        }
        .onAppear {
            // A reminder can choose another week before this view is mounted.
            if model.hub.loadedCalendarWeek != CompanionDate.week(containing: model.hub.selectedDate).first {
                Task { await model.hub.refresh() }
            }
        }
        .onChange(of: model.hub.selectedDate) { previous, selected in
            if CompanionDate.week(containing: previous).first != CompanionDate.week(containing: selected).first {
                Task { await model.hub.refresh() }
            }
        }
    }

    private var weekStrip: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            HStack(spacing: 3) {
                ForEach(CompanionDate.week(containing: model.hub.selectedDate), id: \.self) { date in
                    let isToday = Calendar.current.isDate(date, inSameDayAs: context.date)
                    let selected = Calendar.current.isDate(date, inSameDayAs: model.hub.selectedDate)
                    Button {
                        withAnimation(PetMotion.hover) { model.hub.selectedDate = date }
                    } label: {
                        VStack(spacing: 12) {
                            Text(CompanionDate.weekday(date)).font(.system(size: 11, weight: .medium))
                            Text("\(Calendar.current.component(.day, from: date))")
                                .font(.system(size: 14, weight: selected || isToday ? .semibold : .medium))
                                .monospacedDigit()
                        }
                        .foregroundStyle(selected ? Palette.glassInk : Palette.glassInkMuted)
                        .frame(maxWidth: .infinity).frame(height: 62)
                        .background {
                            if selected {
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(Palette.glassInk.opacity(0.09))
                                    .overlay { GlassRim(radius: 12, strength: 0.4) }
                            }
                        }
                        .contentShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(PetPressStyle())
                    .accessibilityLabel(CompanionDate.label(date) + (isToday ? " 오늘" : ""))
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
        }
    }

    private func eventRow(_ event: HubCalendarEvent) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(event.timeLabel)
                .font(.system(size: 12)).monospacedDigit()
                .foregroundStyle(Palette.glassInkMuted)
                .frame(width: 60, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: 5) {
                Text(event.title).font(.system(size: 13, weight: .medium))
                    .fixedSize(horizontal: false, vertical: true)
                if let location = event.location, !location.isEmpty {
                    Label(location, systemImage: "mappin")
                        .font(.system(size: 11)).foregroundStyle(Palette.glassInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 10).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) { Palette.glassInk.opacity(0.08).frame(height: 1) }
        .accessibilityElement(children: .combine)
    }
}
