import AppKit
import SwiftUI

/// Raster checks for the new renderer: white glyph interiors must survive,
/// shadows must be local, and turning them off must match ordinary text.
enum GlassTextCheck {
    @MainActor static func run() -> Bool {
        guard #available(macOS 15.0, *) else { return true }
        for scale in [1.0, 2.0] {
            let text = Text("27 · Hub에서 열기")
                .font(.system(size: 11.5, weight: .medium)).foregroundStyle(.white)
            func render<V: View>(_ view: V) -> NSBitmapImageRep? {
                let renderer = ImageRenderer(content: view.padding(12)
                    .frame(width: 160, height: 48, alignment: .leading))
                renderer.scale = scale
                return renderer.cgImage.map(NSBitmapImageRep.init(cgImage:))
            }
            guard let ordinary = render(text),
                  let plain = render(text.textRenderer(GlassTextRenderer(shadows: false))),
                  let protected = render(text.textRenderer(GlassTextRenderer())) else {
                fputs("Glass text rasterization unavailable\n", stderr); return false
            }
            var whiteInteriors = 0, localShadow = 0, plainDifference = 0
            for y in 0..<plain.pixelsHigh {
                for x in 0..<plain.pixelsWide {
                    guard let p = plain.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB),
                          let s = protected.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB),
                          let o = ordinary.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else { return false }
                    if abs(p.alphaComponent - o.alphaComponent) > 0.02 { plainDifference += 1 }
                    if p.alphaComponent > 0.98 {
                        guard s.redComponent > 0.95, s.greenComponent > 0.95, s.blueComponent > 0.95 else {
                            fputs("Glass shadow darkened foreground glyphs\n", stderr); return false
                        }
                        whiteInteriors += 1
                    }
                    if p.alphaComponent == 0 && s.alphaComponent > 0.04 { localShadow += 1 }
                    if x < Int(6 * scale) || x > Int(145 * scale) || y < Int(5 * scale) || y > Int(43 * scale) {
                        guard s.alphaComponent == 0 else {
                            fputs("Glass text shadow escaped its glyph neighborhood\n", stderr); return false
                        }
                    }
                }
            }
            guard whiteInteriors > 5, localShadow > 20, plainDifference < 8 else {
                fputs("Glass text check failed: white=\(whiteInteriors), shadow=\(localShadow), plain drift=\(plainDifference)\n", stderr)
                return false
            }
        }
        print("PASS: glass text 1x/2x, crisp white glyphs, local shadow, unmodified accessibility text")
        return true
    }
}
