import AppKit
import SwiftUI

/// Developer-only comparison; never inserted into the pet's normal quick-action flow.
@MainActor
final class GlassLabWindowController: NSWindowController {
    init() {
        let window = NSWindow(contentRect: NSRect(x: 0,y: 0,width: 1040,height: 660),
                              styleMask: [.titled,.closable,.resizable,.miniaturizable], backing: .buffered, defer: false)
        window.title = "Moonlight · Glass Lab"
        window.minSize = NSSize(width: 860,height: 600)
        window.contentView = NSHostingView(rootView: GlassLabView())
        window.isReleasedWhenClosed = false
        super.init(window: window)
        window.center()
    }
    required init?(coder: NSCoder) { nil }
    func present() {
        showWindow(nil)
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}

private struct GlassLabView: View {
    @State private var strength = 1.0
    @State private var bevel = 9.0
    @State private var grid = false
    @State private var character: PetCharacter = .silver
    @State private var previewsTint = false
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .firstTextBaseline) {
                Text("빛을 담는 작은 표면").font(.system(size: 25,weight: .medium))
                Spacer()
                Text("GLASS MATERIAL STUDY").font(.system(size: 11,weight: .medium,design: .monospaced)).foregroundStyle(.secondary)
            }
            Text("왼쪽은 실제 위젯 재질, 오른쪽은 같은 배경을 굴절시키는 Metal 표면입니다.")
                .font(.system(size: 13)).foregroundStyle(.secondary)
            HStack(spacing: 28) {
                VStack(alignment: .leading) {
                    Text("굴절 강도 · \(strength, specifier: "%.2f")").font(.system(size: 12))
                    Slider(value: $strength,in: 0...2).accessibilityLabel("굴절 강도")
                }
                VStack(alignment: .leading) {
                    Text("곡면 깊이 · \(Int(bevel)) pt").font(.system(size: 12))
                    Slider(value: $bevel,in: 4...24).accessibilityLabel("곡면 깊이")
                }
                Toggle("격자 배경",isOn: $grid).toggleStyle(.switch).font(.system(size: 12))
                Picker("캐릭터", selection: $character) {
                    ForEach(PetCharacter.allCases) { pet in Text(pet.title).tag(pet) }
                }.frame(width: 170)
            }
            if GlassOpticsRenderer.shared != nil {
                Toggle("반투명 색상 미리보기", isOn: $previewsTint)
                    .toggleStyle(.switch).font(.system(size: 12))
                GlassLabStage(strength: Float(strength),bevel: Float(bevel),grid: grid, character: character,
                              previewsTint: previewsTint)
                    .clipShape(RoundedRectangle(cornerRadius: 22))
            } else {
                ContentUnavailableView("Metal을 사용할 수 없습니다",systemImage: "display.trianglebadge.exclamationmark",
                                       description: Text("실제 위젯은 네이티브 유리와 기본 테두리로 계속 동작합니다."))
            }
            HStack {
                Text("NATIVE + OPTICAL EDGE").frame(maxWidth: .infinity)
                Text("METAL · REFRACTION").frame(maxWidth: .infinity)
            }.font(.system(size: 11,weight: .medium,design: .monospaced)).foregroundStyle(.secondary)
            Text("앱 안의 배경을 사용한 재질 비교입니다. 다른 앱의 화면을 캡처하지 않습니다.")
                .font(.system(size: 11)).foregroundStyle(.secondary)
        }
        .padding(24)
        .background(Color(nsColor: .windowBackgroundColor))
        .environment(\.colorScheme,.light)
    }
}

private struct GlassLabStage: NSViewRepresentable {
    let strength: Float
    let bevel: Float
    let grid: Bool
    let character: PetCharacter
    let previewsTint: Bool
    func makeNSView(context: Context) -> StageView { StageView() }
    func updateNSView(_ view: StageView, context: Context) {
        view.background?.refraction = strength
        view.background?.bevel = bevel
        view.background?.grid = grid
        view.setCharacter(character)
        view.previewTint(previewsTint)
    }

    final class StageView: NSView {
        let background: OpticalGlassView?
        private let native: GlassPanel
        private let wash = PetGlassWash(radius: 30)
        private let readingTone: GlassReadingTone
        private let foreground: NSView
        override var isFlipped: Bool { true }
        override init(frame: NSRect) {
            let readingTone = GlassReadingTone()
            self.readingTone = readingTone
            background = GlassOpticsRenderer.shared.map { OpticalGlassView(renderer: $0) }
            native = GlassPanel.host(LabContent().environment(\.glassReadsWithinWindow, true),
                                     cornerRadius: 30, protectsText: true)
            let content = NSHostingView(rootView: LabContent().environment(\.colorScheme,.dark)
                .environment(\.glassReadsWithinWindow, true)
                .environment(\.glassReadingTone, readingTone)
                .environment(\.glassReadingProtected, true)
                .modifier(GlassTextProtection()))
            content.sizingOptions = []
            foreground = content
            super.init(frame: frame)
            wash.onPresentationChange = { [weak readingTone] character, opacity, solid in
                readingTone?.update(character: character, opacity: opacity, solidForAccessibility: solid)
            }
            if let background {
                background.laboratory = true
                background.radius = 30
                addSubview(background)
            }
            addSubview(native)
            addSubview(wash)
            addSubview(foreground)
        }
        required init?(coder: NSCoder) { nil }
        func setCharacter(_ character: PetCharacter) {
            native.setCharacter(character)
            wash.character = character
            wash.solidForAccessibility = NSWorkspace.shared.accessibilityDisplayShouldReduceTransparency
                || NSWorkspace.shared.accessibilityDisplayShouldIncreaseContrast
        }
        func previewTint(_ preview: Bool) {
            native.previewCharacterTint(preview)
            wash.previewsTint = preview
        }
        override func layout() {
            super.layout()
            background?.frame = bounds
            let half = bounds.width * 0.5
            let card = CGRect(x: 32,y: 34,width: half-64,height: bounds.height-68)
            // GlassPanel's 8-point shadow gutter is outside its material.
            native.frame = card.insetBy(dx: -CompanionLayout.gutter,dy: -CompanionLayout.gutter)
            let right = card.offsetBy(dx: half,dy: 0)
            foreground.frame = right
            wash.frame = right
            background?.glassRect = right
        }
    }
}

/// No invented task rows: a labelled material specimen with a real editable field.
private struct LabContent: View {
    @State private var text = ""
    var body: some View {
        VStack(alignment: .leading,spacing: 20) {
            HStack {
                Text("할 일").font(.system(size: 24,weight: .semibold))
                Spacer()
                Image(systemName: "ellipsis").accessibilityHidden(true)
            }
            .modifier(GlassReadability(radius: 14, inset: 10))
            TextField("입력 질감 확인",text: $text,
                      prompt: Text("입력 질감 확인").foregroundStyle(Palette.glassInkFaint))
                .textFieldStyle(.plain).font(.system(size: 15))
                .modifier(GlassGlyphShadow())
                .padding(14).modifier(GlassInputSurface(focused: false))
                .accessibilityLabel("재질 비교용 입력")
            Spacer()
            VStack(spacing: 10) {
                Image(systemName: "checklist").font(.system(size: 26,weight: .light))
                Text("빛, 곡면, 그리고 여백").font(.system(size: 15,weight: .medium))
                Text("내용은 선명하게, 가장자리는 부드럽게.").font(.system(size: 12))
            }.foregroundStyle(Palette.glassInkMuted)
                .padding(12).modifier(GlassReadability(radius: 14, inset: 3)).frame(maxWidth: .infinity)
            Spacer()
            Text("재질 비교 · 입력은 저장되지 않음").font(.system(size: 10.5)).foregroundStyle(Palette.glassInkMuted)
                .modifier(GlassReadability(radius: 8, inset: 8))
        }.padding(24).foregroundStyle(Palette.glassInk)
    }
}
