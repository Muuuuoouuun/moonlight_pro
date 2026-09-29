import AppKit
import MetalKit
import MetalPerformanceShaders
import ScreenCaptureKit
import CoreMedia
import CoreVideo

/// Opt-in, memory-only desktop texture. A hidden/disabled panel stops capture.
/// ScreenCaptureKit excludes this entire process, including the pet and its panels.
@MainActor
final class DesktopRefractionView: MTKView, MTKViewDelegate, SCStreamOutput, SCStreamDelegate {
    // Shared across quick/pinned windows. A denied build must not prompt again
    // on window movement, display changes, or panel transitions in this process.
    private static var permissionDenied = false
    private let renderer: GlassOpticsRenderer
    private let blur: MPSImageGaussianBlur
    private var cache: CVMetalTextureCache?
    private var stream: SCStream?
    private var frameTexture: CVMetalTexture?
    private var framePixel: CVPixelBuffer?
    private var blurred: MTLTexture?
    private var needsBlur = false
    private var generation = 0
    private var wanted = false
    private var suspended = false
    private var displayID: CGDirectDisplayID?
    private var screenFrame: CGRect = .zero
    private var observers: [NSObjectProtocol] = []
    var onStatus: ((String) -> Void)?
    var radius: CGFloat = CompanionLayout.glassRadius

    init(renderer: GlassOpticsRenderer) {
        self.renderer = renderer
        blur = MPSImageGaussianBlur(device: renderer.device, sigma: 5)
        blur.edgeMode = .clamp
        super.init(frame: .zero, device: renderer.device)
        CVMetalTextureCacheCreate(nil, nil, renderer.device, nil, &cache)
        colorPixelFormat = .bgra8Unorm
        clearColor = MTLClearColorMake(0, 0, 0, 0)
        layer?.isOpaque = false
        isPaused = true
        enableSetNeedsDisplay = true
        delegate = self
        isHidden = true
        setAccessibilityElement(false)
        for name in [NSWindow.didMoveNotification, NSWindow.didResizeNotification, NSWindow.didChangeScreenNotification] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
                MainActor.assumeIsolated {
                    guard let self, let changed = note.object as? NSWindow, changed === self.window else { return }
                    self.updateScreen()
                    self.needsDisplay = true
                }
            })
        }
        observers.append(NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification,
            object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.updateScreen() }
            })
        for (name, suspended) in [(NSWorkspace.willSleepNotification, true),
                                   (NSWorkspace.didWakeNotification, false),
                                   (NSWorkspace.sessionDidResignActiveNotification, true),
                                   (NSWorkspace.sessionDidBecomeActiveNotification, false)] {
            observers.append(NSWorkspace.shared.notificationCenter.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated {
                    self?.suspended = suspended
                    self?.restart()
                }
            })
        }
        observers.append(NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.restart() }
            })
    }
    required init(coder: NSCoder) { fatalError("init(coder:) unavailable") }
    deinit {
        for observer in observers {
            NotificationCenter.default.removeObserver(observer)
            NSWorkspace.shared.notificationCenter.removeObserver(observer)
        }
        if let stream { Task { try? await stream.stopCapture() } }
    }
    override var isOpaque: Bool { false }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
    override func viewDidMoveToWindow() { super.viewDidMoveToWindow(); restart() }

    func setWanted(_ value: Bool) {
        guard wanted != value else { return }
        wanted = value
        restart()
    }
    private func updateScreen() {
        let current = (window?.screen?.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value
        if wanted && (current != displayID || window?.screen?.frame != screenFrame) { restart() }
    }
    private func stop() {
        generation += 1
        if let old = stream { Task { try? await old.stopCapture() } }
        stream = nil
        frameTexture = nil
        framePixel = nil
        blurred = nil
        displayID = nil
        isHidden = true
        if let cache { CVMetalTextureCacheFlush(cache, 0) }
    }
    private func restart() {
        stop()
        guard wanted, !suspended, let screen = window?.screen else { return }
        guard let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else { return }
        let id = number.uint32Value
        displayID = id
        screenFrame = screen.frame
        guard !NSWorkspace.shared.accessibilityDisplayShouldReduceTransparency,
              !NSWorkspace.shared.accessibilityDisplayShouldIncreaseContrast else {
            onStatus?("대비 설정에 따라 기본 유리 사용 중")
            return
        }
        // ScreenCaptureKit performs authorization itself. Legacy CoreGraphics
        // preflight can disagree with the permission granted to this app build.
        guard !Self.permissionDenied else {
            onStatus?("화면 접근이 거부됐어요 · 권한 변경 후 앱을 다시 실행하세요")
            return
        }
        let ticket = generation
        onStatus?("배경 굴절 연결 중…")
        Task { [weak self] in
            guard let self else { return }
            do {
                let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
                guard ticket == self.generation, self.wanted else { return }
                guard let display = content.displays.first(where: { $0.displayID == id }),
                      let ownApp = content.applications.first(where: { $0.processID == ProcessInfo.processInfo.processIdentifier }) else {
                    self.onStatus?("자체 창 제외 확인 실패 · 기본 유리 사용 중")
                    return
                }
                let filter = SCContentFilter(display: display, excludingApplications: [ownApp], exceptingWindows: [])
                let config = SCStreamConfiguration()
                // Background-only nominal resolution limits memory/bandwidth. Text is native Retina.
                config.width = max(1, Int(self.screenFrame.width))
                config.height = max(1, Int(self.screenFrame.height))
                config.pixelFormat = kCVPixelFormatType_32BGRA
                config.colorSpaceName = CGColorSpace.sRGB
                config.minimumFrameInterval = CMTime(value: 1, timescale: 30)
                config.queueDepth = 3
                config.showsCursor = false
                config.capturesAudio = false
                let candidate = SCStream(filter: filter, configuration: config, delegate: self)
                try candidate.addStreamOutput(self, type: .screen, sampleHandlerQueue: .main)
                self.stream = candidate
                try await candidate.startCapture()
                guard ticket == self.generation else { try? await candidate.stopCapture(); return }
                self.onStatus?("배경 굴절 실험 중 · 영상 저장 안 함")
            } catch {
                guard ticket == self.generation else { return }
                self.stop()
                let failure = error as NSError
                if failure.domain == SCStreamErrorDomain && failure.code == SCStreamError.Code.userDeclined.rawValue {
                    Self.permissionDenied = true
                    self.onStatus?("화면 접근이 거부됐어요 · 권한 변경 후 앱을 다시 실행하세요")
                } else {
                    self.onStatus?("배경 연결 실패 (\(failure.code)) · 기본 유리 사용 중")
                }
            }
        }
    }

    nonisolated func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        // addStreamOutput explicitly delivers this callback on the main queue.
        MainActor.assumeIsolated {
            guard stream === self.stream, wanted, type == .screen, sampleBuffer.isValid,
                  let info = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
                  let status = info.first?[.status] as? Int else { return }
            guard status == SCFrameStatus.complete.rawValue else {
                if status != SCFrameStatus.idle.rawValue {
                    frameTexture = nil; framePixel = nil; blurred = nil; isHidden = true
                }
                return
            }
            guard let pixel = sampleBuffer.imageBuffer, let cache else { return }
            var cv: CVMetalTexture?
            guard CVMetalTextureCacheCreateTextureFromImage(nil, cache, pixel, nil, .bgra8Unorm,
                    CVPixelBufferGetWidth(pixel), CVPixelBufferGetHeight(pixel), 0, &cv) == kCVReturnSuccess,
                  let cv else { return }
            frameTexture = cv
            framePixel = pixel
            needsBlur = true
            isHidden = false
            needsDisplay = true
        }
    }
    nonisolated func stream(_ stream: SCStream, didStopWithError error: Error) {
        Task { @MainActor [weak self] in
            guard let self, stream === self.stream else { return }
            self.stop()
            self.onStatus?("화면 기록이 중단됐어요 · 기본 유리 사용 중")
        }
    }
    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) { needsDisplay = true }
    func draw(in view: MTKView) {
        guard wanted, !isHidden, bounds.width > 0, bounds.height > 0,
              let window, let cv = frameTexture, let pixel = framePixel, let source = CVMetalTextureGetTexture(cv),
              let buffer = renderer.queue.makeCommandBuffer(), let pass = currentRenderPassDescriptor,
              let drawable = currentDrawable else { return }
        if blurred?.width != source.width || blurred?.height != source.height {
            let descriptor = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .bgra8Unorm,
                width: source.width, height: source.height, mipmapped: false)
            descriptor.storageMode = .private
            descriptor.usage = [.shaderRead, .shaderWrite]
            blurred = renderer.device.makeTexture(descriptor: descriptor)
            needsBlur = true
        }
        guard let blurred else { return }
        if needsBlur { blur.encode(commandBuffer: buffer, sourceTexture: source, destinationTexture: blurred); needsBlur = false }
        let global = window.convertToScreen(convert(bounds, to: nil))
        var u = GlassUniforms()
        u.viewport = SIMD4(Float(bounds.width), Float(bounds.height), Float(drawableSize.width / bounds.width), 0)
        u.material = SIMD4(Float(radius), 9, 8, GlassStudy.highlightRecovery)
        u.backdrop = Self.textureRegion(panel: global, screen: screenFrame)
        guard renderer.encode(u, pass: pass, buffer: buffer, backdrop: blurred, polishedBackdrop: source) else { return }
        // Retain the IOSurface-backed frame through GPU completion, without copies or disk output.
        let lease = CaptureFrameLease(texture: cv, pixel: pixel)
        buffer.addCompletedHandler { _ in withExtendedLifetime(lease) {} }
        buffer.present(drawable)
        buffer.commit()
    }
    static func textureRegion(panel: CGRect, screen: CGRect) -> SIMD4<Float> {
        SIMD4(Float((panel.minX-screen.minX)/screen.width), Float((screen.maxY-panel.maxY)/screen.height),
              Float(panel.width/screen.width), Float(panel.height/screen.height))
    }
}

/// Immutable retention only: completion releases these buffers; it never reads or mutates them.
private struct CaptureFrameLease: @unchecked Sendable {
    let texture: CVMetalTexture
    let pixel: CVPixelBuffer
}
