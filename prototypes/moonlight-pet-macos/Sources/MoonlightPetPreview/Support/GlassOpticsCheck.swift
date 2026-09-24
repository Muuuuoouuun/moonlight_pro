import Foundation

/// GPU assertions validate output, not source strings or the shape of the implementation.
enum GlassOpticsCheck {
    static func run() -> Bool {
        guard let renderer = GlassOpticsRenderer.shared else {
            fputs("Glass GPU check unavailable: device/pipeline failed (native fallback remains usable)\n",stderr)
            return false
        }
        let width = 320, height = 240
        var u = GlassUniforms()
        u.viewport = SIMD4(Float(width),Float(height),1,0)
        u.rect = SIMD4(10,10,300,220)
        guard let edge = renderer.pixels(u,width: width,height: height) else { return false }
        func alpha(_ data: [UInt8], _ x: Int, _ y: Int) -> UInt8 { data[(y*width+x)*4+3] }
        guard alpha(edge,160,120) == 0, alpha(edge,10,10) == 0,
              alpha(edge,160,10) > 20 else {
            fputs("Glass edge failed: center=\(alpha(edge,160,120)), corner=\(alpha(edge,10,10)), rim=\(alpha(edge,160,10))\n",stderr)
            return false
        }
        // Every channel must be <= alpha: transparent overlays must be premultiplied.
        for pixel in stride(from: 0,to: edge.count,by: 4) {
            guard edge[pixel] <= edge[pixel+3], edge[pixel+1] <= edge[pixel+3], edge[pixel+2] <= edge[pixel+3] else {
                fputs("Glass edge is not premultiplied\n",stderr); return false
            }
        }
        u.viewport.w = 1
        u.rect = SIMD4(176,20,128,200)
        u.material = SIMD4(24,16,0,1)
        guard let flat = renderer.pixels(u,width: width,height: height) else { return false }
        u.material.z = 1.5
        guard let bent = renderer.pixels(u,width: width,height: height) else { return false }
        var changedEdge = 0
        for y in 24..<216 {
            for x in 176..<192 {
                let index = (y*width+x)*4
                if abs(Int(flat[index])-Int(bent[index])) > 8 { changedEdge += 1 }
            }
        }
        let center = (120*width+240)*4
        guard changedEdge > 100, Array(flat[center..<center+4]) == Array(bent[center..<center+4]) else {
            fputs("Glass refraction must displace the edge and preserve the flat center\n",stderr); return false
        }
        // Clear material must transmit backdrop luminance, not remap dark folds
        // into an opaque-looking white floor. Compare matching scene coordinates.
        u.material.w = 0
        guard let clear = renderer.pixels(u,width: width,height: height) else { return false }
        var deviation = 0.0
        var channels = 0
        for y in stride(from: 60, through: 180, by: 8) {
            for x in stride(from: 216, through: 264, by: 4) {
                for channel in 0..<3 {
                    deviation += Double(abs(Int(clear[(y*width+x)*4+channel]) - Int(clear[(y*width+x-160)*4+channel])))
                    channels += 1
                }
            }
        }
        let meanDeviation = deviation / Double(channels)
        guard meanDeviation < 12 else {
            fputs("Clear material whitens the backdrop: mean RGB drift \(meanDeviation) / 255\n",stderr)
            return false
        }
        // A backing-scale change should preserve point geometry and clipping.
        u.viewport = SIMD4(320,240,2,0)
        u.rect = SIMD4(10,10,300,220)
        guard let retina = renderer.pixels(u,width: 640,height: 480),
              retina[(240*640+320)*4+3] == 0, retina[(20*640+20)*4+3] == 0 else { return false }
        print("PASS: Metal compilation/render, premultiplied transparent rim, Retina geometry, edge refraction (\(changedEdge) displaced pixels), stable center, clear backdrop drift \(String(format: "%.2f", meanDeviation))/255")
        return true
    }
}
