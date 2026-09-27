import AppKit
import SwiftUI
import MetalKit
import MetalPerformanceShaders

/// Developer-only optical specimens. No Hub calls, invented tasks or saved input.
struct GlassQualityAuditView: View {
    @State private var character: PetCharacter = .silver
    @State private var interaction = false
    @State private var optical = true
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("유리 품질 · 세 배경 비교").font(.system(size: 21, weight: .semibold))
                    Text("실제 위젯 재질 · 흰 글자 · 원본 캐릭터 · 입력은 저장되지 않음")
                        .font(.system(size: 12)).foregroundStyle(.secondary)
                }
                Spacer()
                Picker("테마", selection: $character) {
                    ForEach(PetCharacter.allCases) { Text($0.title).tag($0) }
                }.frame(width: 190)
                Toggle("누름·드래그 색상", isOn: $interaction).toggleStyle(.switch)
            }
            Toggle("실제 배경 굴절 셰이더 · 앱 내부 배경", isOn: $optical).toggleStyle(.switch).font(.system(size: 12))
            HStack(spacing: 12) {
                ForEach(AuditBackdrop.allCases) { backdrop in
                    VStack(spacing: 8) {
                        Text(backdrop.title).font(.system(size: 12, weight: .medium))
                        GlassAuditSpecimen(character: character, interaction: interaction, backdrop: backdrop, optical: optical)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                }
            }
            Text("같은 유리와 같은 글자를 비교합니다. 화면 기록을 사용하지 않는 배경 평가이며, 실제 데스크톱 굴절 검증은 별도입니다.")
                .font(.system(size: 11)).foregroundStyle(.secondary)
        }.padding(18).foregroundStyle(Color.black).background(Color.white)
            .environment(\.colorScheme, .light)
    }
}

private enum AuditBackdrop: String, CaseIterable, Identifiable {
    case white, mixed, black
    var id: Self { self }
    var title: String {
        switch self { case .white: "흰색 배경"; case .mixed: "밝기·색 혼합 배경"; case .black: "검은 배경" }
    }
}

private struct GlassAuditSpecimen: NSViewRepresentable {
    let character: PetCharacter
    let interaction: Bool
    let backdrop: AuditBackdrop
    let optical: Bool
    func makeNSView(context: Context) -> Specimen { Specimen(backdrop: backdrop, character: character) }
    func updateNSView(_ view: Specimen, context: Context) {
        view.setOptical(optical)
        view.panel.setCharacter(character)
        view.panel.previewCharacterTint(interaction)
        view.ornament.rootView = AuditOrnament(character: character)
    }
    final class Specimen: NSView {
        let scene: AuditScene
        let panel: GlassPanel
        let lens = GlassOpticsRenderer.shared.map { AuditLens(renderer: $0) }
        private var optical = false
        let ornament: NSHostingView<AuditOrnament>
        init(backdrop: AuditBackdrop, character: PetCharacter) {
            scene = AuditScene(backdrop: backdrop)
            panel = GlassPanel.host(AuditContent(), cornerRadius: CompanionLayout.glassRadius,
                                    protectsText: true, withinWindow: true)
            ornament = NSHostingView(rootView: AuditOrnament(character: character))
            ornament.sizingOptions = []
            super.init(frame: .zero)
            wantsLayer = true
            layer?.cornerRadius = 16
            layer?.masksToBounds = true
            addSubview(scene)
            addSubview(panel)
            addSubview(ornament)
        }
        required init?(coder: NSCoder) { nil }
        func setOptical(_ value: Bool) {
            guard optical != value else { return }
            optical = value
            panel.setReferenceRefraction(value ? lens : nil)
            needsLayout = true
        }
        override func layout() {
            super.layout()
            scene.frame = bounds
            panel.frame = NSRect(x: 10, y: 14, width: bounds.width-20, height: bounds.height-80)
            if optical {
                let region = panel.frame.insetBy(dx: CompanionLayout.gutter, dy: CompanionLayout.gutter)
                lens?.setScene(scene.image(region: region))
            }
            ornament.frame = NSRect(x: bounds.width-102, y: bounds.height-88, width: 78, height: 78)
        }
    }
}

private struct AuditOrnament: View {
    let character: PetCharacter
    var body: some View {
        if let image = character.artwork {
            Image(nsImage: image).resizable().scaledToFit().accessibilityLabel(character.title)
        }
    }
}

/// Geometric optical test chart (not application/business records).
private final class AuditScene: NSView {
    let backdrop: AuditBackdrop
    init(backdrop: AuditBackdrop) { self.backdrop = backdrop; super.init(frame: .zero) }
    required init?(coder: NSCoder) { nil }
    override var isOpaque: Bool { true }
    override func draw(_ dirtyRect: NSRect) { paint() }
    func image(region: NSRect) -> CGImage? {
        let image = NSImage(size: region.size, flipped: false) { _ in
            NSGraphicsContext.current?.cgContext.translateBy(x: -region.minX, y: -region.minY)
            self.paint()
            return true
        }
        return image.cgImage(forProposedRect: nil, context: nil, hints: nil)
    }
    private func paint() {
        switch backdrop {
        case .white: NSColor.white.setFill(); bounds.fill()
        case .black: NSColor(srgbRed: 0.025, green: 0.03, blue: 0.045, alpha: 1).setFill(); bounds.fill()
        case .mixed:
            NSGradient(colors: [NSColor(srgbRed: 0.12, green: 0.22, blue: 0.39, alpha: 1),
                                NSColor(srgbRed: 0.55, green: 0.67, blue: 0.81, alpha: 1)])?.draw(in: bounds, angle: 60)
            NSColor(white: 0.93, alpha: 1).setFill()
            NSBezierPath(roundedRect: NSRect(x: bounds.width*0.48, y: -30, width: bounds.width, height: bounds.height*0.67),
                         xRadius: 22, yRadius: 22).fill()
            NSColor(white: 0.055, alpha: 1).setFill()
            NSBezierPath(roundedRect: NSRect(x: -28, y: bounds.height*0.18, width: bounds.width*0.54, height: bounds.height*0.47),
                         xRadius: 18, yRadius: 18).fill()
        }
        // A neutral spatial-frequency chart makes transmitted detail/blur observable.
        let ink: NSColor = backdrop == .black ? .white : .black
        ink.withAlphaComponent(backdrop == .mixed ? 0.23 : 0.07).setFill()
        for row in 0..<14 {
            let y = 42 + CGFloat(row)*27
            let width = bounds.width*(row.isMultiple(of: 3) ? 0.62 : 0.79)
            NSBezierPath(roundedRect: NSRect(x: 24, y: y, width: width, height: 3), xRadius: 1.5, yRadius: 1.5).fill()
        }
    }
}

private struct AuditContent: View {
    @State private var text = ""
    @State private var selection = QuickMode.tasks
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack {
                VStack(alignment: .leading, spacing: 5) {
                    Text("오늘").font(.system(size: 24, weight: .semibold))
                    Text(Date.now.formatted(.dateTime.month().day().weekday()))
                        .font(.system(size: 12, weight: .medium))
                }
                Spacer()
                Image(systemName: "ellipsis")
                Image(systemName: "pin").padding(.leading, 8)
            }
            GlassModeTabs(destinations: [.tasks,.calendar], mode: selection) { selection = $0 }
            TextField("선명도 확인용 입력", text: $text,
                      prompt: Text("선명도 확인용 입력").foregroundStyle(Palette.glassInkFaint))
                .textFieldStyle(.plain).font(.system(size: 15))
                .modifier(GlassGlyphShadow())
                .padding(13).modifier(GlassInputSurface(focused: false))
            VStack(alignment: .leading, spacing: 9) {
                Text("유리 너머의 빛, 선명한 글자")
                    .font(.system(size: 16, weight: .semibold))
                Text("밝은 면과 어두운 면이 함께 있어도 작은 글자는 또렷하게 읽혀야 합니다.")
                    .font(.system(size: 13, weight: .medium)).lineSpacing(4)
            }
            Spacer()
            Text("Aa 0123456789 · 가나다라").font(.system(size: 12, weight: .medium))
            HStack {
                Text("이 Mac에서 재질 비교")
                Spacer()
                Image(systemName: "arrow.up.right")
                Text("12 pt")
            }.font(.system(size: 12, weight: .medium))
        }.padding(22).foregroundStyle(Palette.glassInk)
    }
}

/// App-owned optical test texture rendered by the production desktop pipeline.
/// The fixture geometry is drawn into a bitmap, never read from any window.
@MainActor private final class AuditLens: MTKView, MTKViewDelegate {
    private let renderer: GlassOpticsRenderer
    private var texture: MTLTexture?
    private var polishedTexture: MTLTexture?
    private let blur: MPSImageGaussianBlur
    private var sceneSize = CGSize.zero
    init(renderer: GlassOpticsRenderer) {
        self.renderer = renderer
        blur = MPSImageGaussianBlur(device: renderer.device, sigma: 5)
        blur.edgeMode = .clamp
        super.init(frame: .zero, device: renderer.device)
        colorPixelFormat = .bgra8Unorm
        layer?.isOpaque = false
        clearColor = MTLClearColorMake(0,0,0,0)
        isPaused = true
        enableSetNeedsDisplay = true
        delegate = self
    }
    required init(coder: NSCoder) { fatalError("init(coder:) unavailable") }
    override var isOpaque: Bool { false }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
    func setScene(_ image: CGImage?) {
        guard let image, sceneSize != CGSize(width: image.width,height: image.height) else { return }
        sceneSize = CGSize(width: image.width,height: image.height)
        guard let source = try? MTKTextureLoader(device: renderer.device).newTexture(cgImage: image,
            options: [.SRGB: false, .origin: MTKTextureLoader.Origin.topLeft]),
              let buffer = renderer.queue.makeCommandBuffer() else { return }
        let descriptor = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: source.pixelFormat,
            width: source.width,height: source.height,mipmapped: false)
        descriptor.usage = [.shaderRead,.shaderWrite]
        descriptor.storageMode = .private
        guard let result = renderer.device.makeTexture(descriptor: descriptor) else { return }
        blur.encode(commandBuffer: buffer, sourceTexture: source, destinationTexture: result)
        buffer.commit()
        polishedTexture = source
        texture = result
        needsDisplay = true
    }
    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) { needsDisplay = true }
    func draw(in view: MTKView) {
        guard bounds.width > 0, bounds.height > 0, let texture,
              let drawable = currentDrawable, let pass = currentRenderPassDescriptor,
              let buffer = renderer.queue.makeCommandBuffer() else { return }
        var u = GlassUniforms()
        u.viewport = SIMD4(Float(bounds.width),Float(bounds.height),Float(drawableSize.width/bounds.width),0)
        u.material = SIMD4(Float(CompanionLayout.glassRadius),9,8,0)
        u.backdrop = SIMD4(0,0,1,1)
        guard renderer.encode(u,pass: pass,buffer: buffer,backdrop: texture,polishedBackdrop: polishedTexture) else { return }
        buffer.present(drawable)
        buffer.commit()
    }
}
