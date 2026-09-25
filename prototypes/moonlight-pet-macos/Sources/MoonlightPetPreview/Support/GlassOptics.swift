import AppKit
import MetalKit
import OSLog
import SwiftUI

struct GlassUniforms {
    var viewport: SIMD4<Float> = .zero
    var rect: SIMD4<Float> = .zero
    var material = SIMD4<Float>(26, 10, 1, 0)
    var light: SIMD4<Float> = .zero
}

/// Shared device, queue and pipeline. Compilation happens once, never on pointer updates.
final class GlassOpticsRenderer {
    static let shared: GlassOpticsRenderer? = {
        do { return try GlassOpticsRenderer() }
        catch {
            Logger(subsystem: "app.moonlight.pet-preview", category: "glass")
                .error("Metal glass unavailable; using native rim: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }()
    let device: MTLDevice
    let queue: MTLCommandQueue
    let pipeline: MTLRenderPipelineState

    private init() throws {
        guard let device = MTLCreateSystemDefaultDevice(), let queue = device.makeCommandQueue(),
              let url = Bundle.module.url(forResource: "GlassOptics", withExtension: "metal", subdirectory: "Shaders") else {
            throw NSError(domain: "GlassOptics", code: 1, userInfo: [NSLocalizedDescriptionKey: "Metal device or shader resource missing"])
        }
        self.device = device
        self.queue = queue
        let library = try device.makeLibrary(source: String(contentsOf: url, encoding: .utf8), options: nil)
        let descriptor = MTLRenderPipelineDescriptor()
        descriptor.vertexFunction = library.makeFunction(name: "glassVertex")
        descriptor.fragmentFunction = library.makeFunction(name: "glassFragment")
        descriptor.colorAttachments[0].pixelFormat = .bgra8Unorm
        pipeline = try device.makeRenderPipelineState(descriptor: descriptor)
    }

    func encode(_ uniforms: GlassUniforms, pass: MTLRenderPassDescriptor, buffer: MTLCommandBuffer) -> Bool {
        guard let encoder = buffer.makeRenderCommandEncoder(descriptor: pass) else { return false }
        var uniforms = uniforms
        encoder.setRenderPipelineState(pipeline)
        encoder.setFragmentBytes(&uniforms, length: MemoryLayout<GlassUniforms>.stride, index: 0)
        encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
        encoder.endEncoding()
        return true
    }

    /// Offscreen bytes use the same production pipeline, allowing geometry/refraction checks.
    func pixels(_ uniforms: GlassUniforms, width: Int, height: Int) -> [UInt8]? {
        let descriptor = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .bgra8Unorm, width: width, height: height, mipmapped: false)
        descriptor.usage = [.renderTarget]
        descriptor.storageMode = .private
        // Shared buffers support CPU readback on Apple and discrete Intel/AMD GPUs;
        // shared textures do not. Use a padded blit instead of texture.getBytes.
        let rowBytes = (width * 4 + 255) & ~255
        guard let texture = device.makeTexture(descriptor: descriptor),
              let readback = device.makeBuffer(length: rowBytes * height, options: .storageModeShared),
              let buffer = queue.makeCommandBuffer() else { return nil }
        let pass = MTLRenderPassDescriptor()
        pass.colorAttachments[0].texture = texture
        pass.colorAttachments[0].loadAction = .clear
        pass.colorAttachments[0].storeAction = .store
        guard encode(uniforms, pass: pass, buffer: buffer), let blit = buffer.makeBlitCommandEncoder() else { return nil }
        blit.copy(from: texture, sourceSlice: 0, sourceLevel: 0, sourceOrigin: MTLOrigin(x: 0,y: 0,z: 0),
                  sourceSize: MTLSize(width: width,height: height,depth: 1), to: readback,
                  destinationOffset: 0, destinationBytesPerRow: rowBytes, destinationBytesPerImage: rowBytes * height)
        blit.endEncoding()
        buffer.commit()
        buffer.waitUntilCompleted()
        guard buffer.status == .completed else { return nil }
        var bytes = [UInt8]()
        bytes.reserveCapacity(width * height * 4)
        for row in 0..<height {
            bytes.append(contentsOf: UnsafeBufferPointer(start: readback.contents().advanced(by: row * rowBytes)
                .assumingMemoryBound(to: UInt8.self), count: width * 4))
        }
        return bytes
    }
}

/// Decoration only. MTKView is paused; resize/pointer/settings are the only redraw sources.
@MainActor
final class OpticalGlassView: MTKView, MTKViewDelegate {
    var radius: CGFloat = 26 { didSet { needsDisplay = true } }
    var bevel: Float = 10 { didSet { needsDisplay = true } }
    var refraction: Float = 1 { didSet { needsDisplay = true } }
    var grid = false { didSet { needsDisplay = true } }
    var laboratory = false
    var glassRect: CGRect? { didSet { needsDisplay = true } }
    private var pointer: SIMD2<Float> = .zero
    private var pointerArea: NSTrackingArea?
    private let renderer: GlassOpticsRenderer

    init(renderer: GlassOpticsRenderer) {
        self.renderer = renderer
        super.init(frame: .zero, device: renderer.device)
        colorPixelFormat = .bgra8Unorm
        clearColor = MTLClearColorMake(0,0,0,0)
        layer?.isOpaque = false
        isPaused = true
        enableSetNeedsDisplay = true
        autoResizeDrawable = true
        delegate = self
        setAccessibilityElement(false)
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(accessibilityChanged),
            name: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: nil)
    }
    required init(coder: NSCoder) { fatalError("init(coder:) is not supported") }
    deinit { NSWorkspace.shared.notificationCenter.removeObserver(self) }
    override var isOpaque: Bool { false }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let pointerArea { removeTrackingArea(pointerArea) }
        let area = NSTrackingArea(rect: .zero, options: [.mouseMoved,.mouseEnteredAndExited,.activeInActiveApp,.inVisibleRect], owner: self)
        addTrackingArea(area)
        pointerArea = area
    }
    override func mouseMoved(with event: NSEvent) {
        guard !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion else { return }
        let p = convert(event.locationInWindow, from: nil)
        pointer = SIMD2(Float(p.x / max(1, bounds.width) - 0.5), Float(0.5 - p.y / max(1, bounds.height)))
        needsDisplay = true
    }
    override func mouseExited(with event: NSEvent) { pointer = .zero; needsDisplay = true }
    @objc private func accessibilityChanged() { pointer = .zero; needsDisplay = true }
    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) { needsDisplay = true }
    func draw(in view: MTKView) {
        guard bounds.width > 0, bounds.height > 0, !isHidden,
              let drawable = currentDrawable, let pass = currentRenderPassDescriptor,
              let buffer = renderer.queue.makeCommandBuffer() else { return }
        let rect = glassRect ?? bounds
        let accessible = NSWorkspace.shared.accessibilityDisplayShouldReduceTransparency || NSWorkspace.shared.accessibilityDisplayShouldIncreaseContrast
        var u = GlassUniforms()
        u.viewport = SIMD4(Float(bounds.width),Float(bounds.height),Float(drawableSize.width/bounds.width),laboratory ? 1 : 0)
        u.rect = SIMD4(Float(rect.minX),Float(rect.minY),Float(rect.width),Float(rect.height))
        u.material = SIMD4(Float(radius),bevel,refraction,grid ? 1 : 0)
        u.light = SIMD4(pointer.x,pointer.y,accessible ? 1 : 0,0)
        guard renderer.encode(u, pass: pass, buffer: buffer) else { return }
        buffer.present(drawable)
        buffer.commit()
    }
}

struct OpticalGlassRim: NSViewRepresentable {
    let radius: CGFloat
    func makeNSView(context: Context) -> NSView { makeOpticalRim(radius: radius) }
    func updateNSView(_ view: NSView, context: Context) {
        (view as? OpticalGlassView)?.radius = radius
        (view as? GlassEdgeView)?.radius = radius
    }
}

@MainActor
func makeOpticalRim(radius: CGFloat) -> NSView {
    if let renderer = GlassOpticsRenderer.shared {
        let view = OpticalGlassView(renderer: renderer)
        view.radius = radius
        return view
    }
    let fallback = GlassEdgeView()
    fallback.radius = radius
    return fallback
}
