import SwiftUI

/// Credentials live only in this settings view and the in-flight sign-in request.
struct HubConnectionContent: View {
    @ObservedObject var model: AppModel
    let done: () -> Void
    @State private var address = ""
    @State private var username = ""
    @State private var password = ""
    private enum Field: Hashable { case address, username, password }
    @FocusState private var focusedField: Field?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Label(model.hub.connectionLabel, systemImage: model.hub.isEnabled ? "network" : "internaldrive")
                        .font(.system(size: 13, weight: .medium))
                    if let date = model.hub.lastSyncedAt, model.hub.isEnabled {
                        Text("마지막 확인 \(date.formatted(date: .omitted, time: .shortened))")
                            .font(.system(size: 11)).foregroundStyle(Palette.glassInkMuted)
                    }
                }
                .modifier(GlassReadability(radius: 10, inset: 8))

                VStack(alignment: .leading, spacing: 6) {
                    fieldLabel("Hub 주소")
                    TextField("https://…", text: $address)
                        .textFieldStyle(.plain)
                        .modifier(GlassGlyphShadow())
                        .font(.system(size: 13)).padding(12)
                        .focused($focusedField, equals: .address)
                        .modifier(GlassInputSurface(focused: focusedField == .address))
                        .onSubmit { focusedField = .username }
                        .disabled(model.hub.isConnecting)
                        .accessibilityLabel("Hub 주소")
                }
                VStack(alignment: .leading, spacing: 6) {
                    fieldLabel("운영자 아이디")
                    TextField("아이디", text: $username)
                        .textFieldStyle(.plain)
                        .modifier(GlassGlyphShadow())
                        .font(.system(size: 13)).padding(12)
                        .focused($focusedField, equals: .username)
                        .modifier(GlassInputSurface(focused: focusedField == .username))
                        .onSubmit { focusedField = .password }
                        .disabled(model.hub.isConnecting)
                        .accessibilityLabel("Hub 운영자 아이디")
                }
                VStack(alignment: .leading, spacing: 6) {
                    fieldLabel("비밀번호")
                    SecureField("비밀번호", text: $password)
                        .textFieldStyle(.plain)
                        .modifier(GlassGlyphShadow())
                        .font(.system(size: 13)).padding(12)
                        .focused($focusedField, equals: .password)
                        .modifier(GlassInputSurface(focused: focusedField == .password))
                        .onSubmit(connect)
                        .disabled(model.hub.isConnecting)
                        .accessibilityLabel("Hub 비밀번호")
                    Text("비밀번호는 이 Mac에 저장하지 않아요.")
                        .font(.system(size: 10.5)).foregroundStyle(Palette.glassInkFaint)
                        .modifier(GlassReadability(radius: 8, inset: 5))
                }

                if let message = model.hub.errorMessage {
                    HubReadNotice(message: message, symbol: "exclamationmark.circle")
                } else if model.hub.needsLogin {
                    HubReadNotice(message: "운영자 계정으로 로그인해 주세요.", symbol: "lock")
                }
                if let message = model.hub.taskMessage {
                    HubReadNotice(message: message, symbol: "checklist")
                }
                if let message = model.hub.calendarMessage {
                    HubReadNotice(message: message, symbol: "calendar")
                }

                HStack(spacing: 10) {
                    Button(action: connect) {
                        Label(model.hub.isConnecting ? "연결 중…" : model.hub.needsLogin ? "로그인·연결" : "연결 확인",
                              systemImage: "arrow.triangle.2.circlepath")
                    }
                    .buttonStyle(GlassActionStyle())
                    .disabled(model.hub.isConnecting || address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    Spacer(minLength: 0)
                    Button("완료", action: done).buttonStyle(GlassQuietStyle())
                }
                if model.hub.isEnabled {
                    Button {
                        password = ""
                        model.hub.useLocalStorage()
                    } label: {
                        Label("이 Mac에만 저장", systemImage: "internaldrive")
                    }
                    .buttonStyle(GlassQuietStyle())
                    .disabled(model.hub.isConnecting || model.hub.isSavingTask || model.hub.isSavingMemo)
                    .help("기존 Mac 할 일을 표시합니다. Hub 기록은 삭제하지 않습니다.")
                }
            }
            .padding(10)
        }
        .scrollIndicators(.hidden)
        .foregroundStyle(Palette.glassInk)
        .onAppear { address = model.hubBaseURL }
        .onDisappear { password = "" }
    }

    private func fieldLabel(_ text: String) -> some View {
        Text(text).font(.system(size: 11.5)).foregroundStyle(Palette.glassInkMuted)
            .modifier(GlassReadability(radius: 7, inset: 4))
    }

    private func connect() {
        guard !model.hub.isConnecting, !address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        let submittedAddress = address.trimmingCharacters(in: .whitespacesAndNewlines)
        let submittedUsername = username.trimmingCharacters(in: .whitespacesAndNewlines)
        let submittedPassword = password
        password = ""
        Task {
            await model.hub.connect(baseURL: submittedAddress,
                                    username: submittedUsername, password: submittedPassword)
            if model.hub.hasConnection {
                model.hubBaseURL = submittedAddress.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            }
        }
    }
}

/// A message occupies the existing content area; a failed read never becomes an empty list.
struct HubReadNotice: View {
    let message: String
    var symbol = "info.circle"
    var action: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label {
                Text(message).fixedSize(horizontal: false, vertical: true)
            } icon: {
                Image(systemName: symbol).accessibilityHidden(true)
            }
            .font(.system(size: 12))
            if let action {
                Button("Hub 연결 확인", action: action)
                    .buttonStyle(GlassQuietStyle())
                    .font(.system(size: 11.5, weight: .medium))
            }
        }
        .foregroundStyle(Palette.glassInkMuted)
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .modifier(GlassReadability(radius: 12))
    }
}

struct HubRefreshButton: View {
    @ObservedObject var model: AppModel

    var body: some View {
        Button { Task { await model.hub.refresh() } } label: {
            Image(systemName: "arrow.clockwise").modifier(GlassGlyphShadow()).frame(width: 28, height: 28)
        }
        .buttonStyle(GlassQuietStyle())
        .disabled(model.hub.isRefreshing || model.hub.isConnecting)
        .accessibilityLabel(model.hub.isRefreshing ? "Hub 새로고침 중" : "Hub 새로고침")
        .help(model.hub.isRefreshing ? "새로고침 중…" : "Hub에서 다시 불러오기")
    }
}
