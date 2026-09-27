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
        // A convex face enlarges the rear scene: samples on both sides move
        // toward its center. Count-only displacement checks cannot distinguish
        // a magnifying lens from the previous shrinking (concave) field.
        var ramp = [UInt8](repeating: 255, count: size*size*4)
        for y in 0..<size {
            for x in 0..<size {
                for c in 0..<3 { ramp[(y*size+x)*4+c] = UInt8(32+x/2) }
            }
        }
        ramp.withUnsafeBytes { bytes in
            texture.replace(region: MTLRegionMake2D(0,0,size,size),mipmapLevel: 0,
                            withBytes: bytes.baseAddress!,bytesPerRow: size*4)
        }
        u.material.z = 0
        guard let rampStraight = renderer.pixels(u,width: size,height: size,backdrop: texture) else { return false }
        u.material.z = 8
        guard let rampBent = renderer.pixels(u,width: size,height: size,backdrop: texture) else { return false }
        let left = (80*size+48)*4, right = (80*size+112)*4
        let leftShift = Int(rampBent[left])-Int(rampStraight[left])
        let rightShift = Int(rampBent[right])-Int(rampStraight[right])
        guard leftShift >= 3, rightShift <= -3 else {
            fputs("Convex face must magnify, not shrink the rear scene: left \(leftShift), right \(rightShift)\n",stderr)
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
        // Sharp background detail may return only at the polished lip. It
        // must not defeat center diffusion or enter the foreground layer.
        guard let polished = renderer.device.makeTexture(descriptor: descriptor) else { return false }
        pattern.withUnsafeBytes { bytes in
            polished.replace(region: MTLRegionMake2D(0,0,size,size),mipmapLevel: 0,
                             withBytes: bytes.baseAddress!,bytesPerRow: size*4)
        }
        guard let separated = renderer.pixels(u,width: size,height: size,backdrop: texture,
                                              polishedBackdrop: polished) else { return false }
        var restoredLipDetail = 0
        for y in 32..<128 {
            for x in 3..<17 {
                let i = (y*size+x)*4
                if abs(Int(separated[i])-Int(flat[i])) > 8 { restoredLipDetail += 1 }
            }
            for x in 32..<128 {
                let i = (y*size+x)*4
                guard Array(separated[i..<i+4]) == Array(flat[i..<i+4]) else {
                    fputs("Polished detail leaked into the diffuse face\n",stderr); return false
                }
            }
        }
        guard restoredLipDetail > 150 else {
            fputs("Polished lip lost its sharp refracted detail\n",stderr); return false
        }
        // Single-pixel background texture must not become colored sparkling
        // dots at the lip. Coarse detail above must survive this same filter.
        for y in 0..<size {
            for x in 0..<size {
                for c in 0..<3 { pattern[(y*size+x)*4+c] = (x+y).isMultiple(of: 2) ? 32 : 224 }
            }
        }
        pattern.withUnsafeBytes { bytes in
            polished.replace(region: MTLRegionMake2D(0,0,size,size),mipmapLevel: 0,
                             withBytes: bytes.baseAddress!,bytesPerRow: size*4)
        }
        guard let filtered = renderer.pixels(u,width: size,height: size,backdrop: texture,
                                            polishedBackdrop: polished) else { return false }
        var fineDetailLeak = 0
        for y in 32..<128 {
            for x in 3..<17 {
                let i = (y*size+x)*4
                for c in 0..<3 { fineDetailLeak = max(fineDetailLeak,abs(Int(filtered[i+c])-Int(flat[i+c]))) }
            }
        }
        guard fineDetailLeak <= 3 else {
            fputs("Single-pixel background detail sparkles at the lip: \(fineDetailLeak)/255\n",stderr); return false
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
            let face = Int(rendered[(80*size+80)*4])
            let lip = Int(rendered[(80*size+5)*4])
            guard input == 255 ? lip-face >= 12 : abs(lip-face) <= 1 else {
                fputs("Polished transmission must recover highlights without lifting black: face \(face), lip \(lip)\n",stderr)
                return false
            }
        }
        // Distinct upper midtones must not collapse into the same gray band.
        // This is where bright window contours used to lose visible depth.
        var highlightSteps: [Int] = []
        for input: UInt8 in [166, 191, 217] {
            var field = [UInt8](repeating: input, count: size*size*4)
            for i in stride(from: 3,to: field.count,by: 4) { field[i] = 255 }
            field.withUnsafeBytes { bytes in
                texture.replace(region: MTLRegionMake2D(0,0,size,size),mipmapLevel: 0,
                                withBytes: bytes.baseAddress!,bytesPerRow: size*4)
            }
            guard let rendered = renderer.pixels(u,width: size,height: size,backdrop: texture) else { return false }
            highlightSteps.append(Int(rendered[(80*size+80)*4]))
        }
        guard zip(highlightSteps,highlightSteps.dropFirst()).allSatisfy({ $1-$0 >= 4 }) else {
            fputs("Bright background contours collapsed: \(highlightSteps)\n",stderr); return false
        }
        u.light.z = 1
        guard let accessible = renderer.pixels(u, width: size, height: size, backdrop: texture),
              accessible.allSatisfy({ $0 == 0 }) else { return false }
        print("PASS: desktop lens \(displaced) interior pixels displaced, \(restoredLipDetail) polished lip pixels, diffuse face preserved, highlight steps \(highlightSteps), preserved midtones/blacks, clipped corners, accessibility bypass, secondary-screen UV mapping")
        return true
    }
}
