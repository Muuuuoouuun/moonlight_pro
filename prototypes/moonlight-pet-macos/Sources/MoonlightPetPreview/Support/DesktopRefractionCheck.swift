import AppKit
import Metal

/// Pure geometry and offscreen GPU checks; never requests screen access.
enum DesktopRefractionCheck {
    @MainActor static func run() -> Bool {
        let screen = CGRect(x: -1200, y: -200, width: 1200, height: 800)
        let panel = CGRect(x: -1100, y: 200, width: 300, height: 200)
        let region = DesktopRefractionView.textureRegion(panel: panel, screen: screen)
        guard abs(region.x - 1.0/12.0) < 0.0001, region.y == 0.25,
              region.z == 0.25, region.w == 0.25,
              let renderer = GlassOpticsRenderer.shared else { return false }
        let size = 160
        let descriptor = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .bgra8Unorm,
            width: size, height: size, mipmapped: false)
        descriptor.usage = .shaderRead
        descriptor.storageMode = renderer.device.hasUnifiedMemory ? .shared : .managed
        guard let texture = renderer.device.makeTexture(descriptor: descriptor) else { return false }
        var pattern = [UInt8](repeating: 255, count: size*size*4)
        for y in 0..<size {
            for x in 0..<size {
                let value: UInt8 = ((x/8+y/8) % 2 == 0) ? 60 : 190
                for c in 0..<3 { pattern[(y*size+x)*4+c] = value }
            }
        }
        pattern.withUnsafeBytes { bytes in
            texture.replace(region: MTLRegionMake2D(0,0,size,size), mipmapLevel: 0,
                withBytes: bytes.baseAddress!, bytesPerRow: size*4)
        }
        var u = GlassUniforms()
        u.viewport = SIMD4(Float(size), Float(size), 1, 0)
        u.material = SIMD4(26, 9, 0, 0)
        guard let straight = renderer.pixels(u, width: size, height: size, backdrop: texture) else { return false }
        u.material.z = 8
        guard let bent = renderer.pixels(u, width: size, height: size, backdrop: texture) else { return false }
        var displaced = 0
        for y in 32..<128 {
            for x in 32..<128 {
                let i = (y*size+x)*4
                if abs(Int(straight[i])-Int(bent[i])) > 8 { displaced += 1 }
                guard bent[i+3] == 255, bent[i] >= 59, bent[i] <= 191 else { return false }
            }
        }
        guard displaced > 500, bent[3] == 0 else {
            fputs("Desktop lens must displace the interior without a new luminance floor\n",stderr)
            return false
        }
        // A plain backdrop must remain plain: reflections must not invent
        // a central rectangle, bright veil or colored patches.
        let uniform = [UInt8](repeating: 128, count: size*size*4)
        uniform.withUnsafeBytes { bytes in
            texture.replace(region: MTLRegionMake2D(0,0,size,size), mipmapLevel: 0,
                withBytes: bytes.baseAddress!, bytesPerRow: size*4)
        }
        guard let flat = renderer.pixels(u, width: size, height: size, backdrop: texture) else { return false }
        for y in 20..<140 {
            for x in 20..<140 {
                let i = (y*size+x)*4
                guard (0..<3).allSatisfy({ abs(Int(flat[i+$0])-128) <= 1 }) else {
                    fputs("Desktop lens added a fill to a uniform backdrop\n", stderr)
                    return false
                }
            }
        }
        // Highlight compression must protect fixed white glyphs without lifting
        // blacks or adding a spatial rectangle to the captured backdrop.
        for (input, range) in [(UInt8(255), 158...176), (UInt8(5), 4...6)] {
            var field = [UInt8](repeating: input, count: size*size*4)
            for i in stride(from: 3,to: field.count,by: 4) { field[i] = 255 }
            field.withUnsafeBytes { bytes in
                texture.replace(region: MTLRegionMake2D(0,0,size,size), mipmapLevel: 0,
                    withBytes: bytes.baseAddress!,bytesPerRow: size*4)
            }
            guard let rendered = renderer.pixels(u,width: size,height: size,backdrop: texture),
                  range.contains(Int(rendered[(80*size+80)*4])) else {
                fputs("Desktop glass highlight/black transmission failed for \(input)\n",stderr)
                return false
            }
        }
        u.light.z = 1
        guard let accessible = renderer.pixels(u, width: size, height: size, backdrop: texture),
              accessible.allSatisfy({ $0 == 0 }) else { return false }
        print("PASS: desktop lens \(displaced) interior pixels displaced, highlight rolloff with preserved midtones/blacks, clipped corners, accessibility bypass, secondary-screen UV mapping")
        return true
    }
}
