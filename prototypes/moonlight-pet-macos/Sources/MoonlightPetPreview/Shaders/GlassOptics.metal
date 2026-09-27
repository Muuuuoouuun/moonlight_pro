#include <metal_stdlib>
using namespace metal;

// Original implementation. Research and platform boundaries: design/glass-optics-research.md.
struct GlassUniforms {
    float4 viewport; // point width, height, backing scale, mode (0 edge / 1 lab)
    float4 rect;     // glass bounds in top-left point coordinates
    float4 material; // radius, bevel, refraction strength, calibration pattern
    float4 light;    // pointer x/y normalized, accessibility fallback, reflection
    float4 backdrop; // display UV origin and extent
};
struct VertexOut { float4 position [[position]]; };
vertex VertexOut glassVertex(uint id [[vertex_id]]) {
    float2 p = float2((id << 1) & 2, id & 2);
    return { float4(p * 2.0 - 1.0, 0, 1) };
}
float glassDistance(float2 p, float2 size, float radius) {
    float2 q = abs(p - size * .5) - size * .5 + radius;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}
float2 glassNormal(float2 p, float2 size, float r) {
    float2 g = float2(glassDistance(p + float2(.25,0), size,r) - glassDistance(p - float2(.25,0),size,r),
                      glassDistance(p + float2(0,.25), size,r) - glassDistance(p - float2(0,.25),size,r));
    return g / max(length(g), .0001);
}
float reflectionBand(float depth, float center, float width) {
    float distance = (depth-center)/width;
    return exp(-distance*distance);
}
// App-owned calibration scene. Both lab halves evaluate precisely the same field.
// Re-evaluating it at displaced positions is genuine refraction of this scene;
// it does not capture, reconstruct or sample any desktop windows.
float3 calibration(float2 point, constant GlassUniforms &u) {
    float2 p = float2(fract(point.x / (u.viewport.x * .5)), point.y / u.viewport.y);
    if (u.material.w > .5) {
        float2 grid = abs(fract(p * float2(12,10)) - .5);
        float line = 1.0 - smoothstep(.025, .045, min(grid.x, grid.y));
        return float3(mix(.79, .18, line));
    }
    float wave = p.y + .34 * sin(p.x * 4.4 + .6) - .34 * p.x;
    float fold = .5 + .5 * cos(wave * 11.0);
    float sheen = pow(max(0.0, cos(wave * 11.0 - .25)), 22.0);
    float fine = exp(-pow((wave - .27) * 80.0, 2.0));
    float grey = .19 + .42 * fold + .17 * sheen + .16 * fine;
    return float3(grey * .96, grey, grey * 1.055); // neutral cool silver, no category tint
}
float3 softened(float2 p, constant GlassUniforms &u, float blur) {
    float3 c = calibration(p,u) * .28;
    for (int i = 0; i < 8; i++) {
        float a = float(i) * .78539816;
        c += calibration(p + float2(cos(a),sin(a))*blur,u) * .09;
    }
    return c;
}
fragment float4 glassFragment(VertexOut in [[stage_in]], constant GlassUniforms &u [[buffer(0)]]) {
    float2 point = in.position.xy / u.viewport.z;
    bool lab = u.viewport.w > .5;
    float2 p = point - u.rect.xy;
    float r = min(u.material.x, min(u.rect.z,u.rect.w)*.5);
    float sd = glassDistance(p,u.rect.zw,r);
    float aa = .75 / u.viewport.z;
    float coverage = 1.0 - smoothstep(-aa,aa,sd);
    float3 backdrop = lab ? calibration(point,u) : float3(0);
    if (coverage <= 0) return lab ? float4(backdrop,1) : float4(0);
    float depth = max(0.0,-sd);
    float bevel = max(1.0,u.material.y);
    float t = clamp(depth/bevel, .002, 1.0);
    float height = sqrt(max(.0001, t*(2.0-t)));
    float slope = (1.0-t)/height;
    float2 outward = glassNormal(p,u.rect.zw,r);
    float3 normal = normalize(float3(outward*slope,1));
    float3 lamp = normalize(float3(-.55 + u.light.x*.22,-.65 + u.light.y*.22,.72));
    float specular = pow(max(0.0,dot(normal,normalize(lamp+float3(0,0,1)))),40.0);
    float3 bounce = normalize(float3(.62-u.light.x*.12,.48-u.light.y*.12,.52));
    float reflected = pow(max(0.0,dot(normal,normalize(bounce+float3(0,0,1)))),52.0);
    float fresnel = .035 + .965 * pow(1.0-normal.z,5.0);
    float hairline = 1.0-smoothstep(.20/u.viewport.z,.95/u.viewport.z,depth);
    // Separate the crisp lip, curved key light and weaker reflected light.
    // None of these spread across the content-bearing flat face.
    float highlight = clamp((.46*specular + .17*reflected + .26*fresnel)*(1.0-t)
                            + .22*hairline,0.0,.68);
    float shadow = (1.0-t) * .09 * exp(-pow((depth-bevel*.75)/(bevel*.32),2.0)) * max(0.0,dot(outward,float2(.7,.7)));
    if (u.light.z > .5) {
        if (lab) return float4(mix(backdrop,float3(.92)*(1-hairline*.6),coverage),1);
        float a = hairline*.65*coverage;
        return float4(float3(.15)*a,a);
    }
    // Two thin reflections on a curved lip. Concentrate the spectrum at
    // the corners instead of painting a continuous rainbow around the frame.
    float lipScale = min(1.0,bevel/9.0);
    float corner = smoothstep(0.0,1.0,2.0*abs(outward.x*outward.y));
    float facing = dot(outward,normalize(float2(-.72+u.light.x*.16,-.69+u.light.y*.16)));
    float litArc = .32 + .68*pow(abs(facing),4.0);
    // Continuous wavelength orientation: no sign flip across the corner.
    float direction = tanh(facing*3.0);
    // The colored return sits behind the outer glint, like light travelling
    // through a rounded section. Curvature changes its depth continuously.
    float center = (3.35+.65*corner)*lipScale;
    float dispersion = 1.25*lipScale*clamp(u.material.z,0.0,1.8);
    // Convolve the reflection with the pixel footprint. Thin highlights must
    // remain continuous on both 1x and Retina rather than sparkle as RGB dots.
    float footprint = 1.0/(6.0*u.viewport.z*u.viewport.z);
    float width = sqrt(pow(1.55*lipScale,2.0)+footprint);
    float3 spectrum = float3(reflectionBand(depth,center-dispersion*direction,width),
                              reflectionBand(depth,center,width),
                              reflectionBand(depth,center+dispersion*direction,width));
    // Overlapping wavelengths sit inside one neutral specular reflection.
    spectrum = mix(spectrum,float3(dot(spectrum,float3(1.0/3.0))),.18);
    // Long, low-frequency caustic patches also reach the straight sides.
    // Their envelope follows the glass surface; no noise or pixel-scale sparks.
    float sweep = .5+.5*sin((p.x+p.y)*.026+u.light.x*.3);
    float spectralArc = corner + (1.0-corner)*(.08+.48*pow(sweep,4.0));
    float3 prism = spectrum * (1.05*spectralArc*litArc*(1.0-t));
    // A polished round section: bright outer glint, a broad soft shoulder,
    // then a weaker inner return. All three stay inside the existing 9pt lip.
    float outerReturn = reflectionBand(depth,.85*lipScale,sqrt(pow(.54*lipScale,2.0)+footprint))
                        * (.72+.30*litArc);
    float shoulder = reflectionBand(depth,3.15*lipScale,2.1*lipScale)
                        * (.16+.25*litArc) * (1.0-t);
    // The second image of the light follows a different curved optical path.
    // Vary separation slowly along the rim so it reads as reflected depth,
    // while the primary glint retains its thin, stable silhouette.
    float innerReturn = reflectionBand(depth,(5.35+.65*corner+.45*sweep)*lipScale,
                                      sqrt(pow(.55*lipScale,2.0)+footprint))
                        * (.20+.60*litArc) * (1.0-t);
    // The polished shoulder rolls into the face: a low-energy reflection
    // behind the thin lip, localized to the light-facing arcs. A compact
    // support keeps every content-bearing center pixel transparent.
    float faceReturn = reflectionBand(depth,8.5*lipScale,4.8*lipScale)
                     * (.035+.105*corner)*litArc
                     * (1.0-smoothstep(14.0*lipScale,20.0*lipScale,depth));
    if (!lab) {
        // Premultiplied source-over: narrow neutral lines, localized dispersion,
        // and no broad gray shoulder or content-area fill.
        float neutral = (outerReturn + shoulder + innerReturn + faceReturn + highlight*.16)
                        * clamp(u.light.w/.72,0.0,1.3);
        float3 reflection = clamp(float3(neutral)+prism,0.0,.92);
        float reflectionAlpha = max(reflection.r,max(reflection.g,reflection.b));
        // A narrow inner attenuation provides a curved cross-section on bright
        // scenes. It ends inside the bevel and never forms a content-area plate.
        float innerAttenuation = reflectionBand(depth,7.1*lipScale,1.0*lipScale)
                               * (.08+.07*(1.0-litArc));
        float a = (reflectionAlpha + innerAttenuation*(1.0-reflectionAlpha))*coverage;
        return float4(reflection*coverage,a);
    }
    // Wavelength-dependent IOR samples only the app-owned calibration field.
    float travel = (bevel*.28 + height*bevel) * u.material.z;
    float3 ray = refract(float3(0,0,-1),normal,1.0/1.46);
    float3 redRay = refract(float3(0,0,-1),normal,1.0/1.453);
    float3 blueRay = refract(float3(0,0,-1),normal,1.0/1.472);
    float2 displacement = ray.xy / max(.1,-ray.z) * travel;
    float2 samplePoint = point + displacement;
    float blur = .7 * (1.0-t); // edge softness; the flat center remains clear
    float3 glass = softened(samplePoint,u,blur);
    // Small edge dispersion; never offsets or blurs the foreground text.
    glass.r = softened(point + redRay.xy/max(.1,-redRay.z)*travel,u,blur).r;
    glass.b = softened(point + blueRay.xy/max(.1,-blueRay.z)*travel,u,blur).b;
    // Preserve the background: no white floor, panel tint or central blur.
    // Specular light belongs to the bevel rather than a fill across the card.
    glass = glass*(1-shadow) + outerReturn*.65 + shoulder + highlight*.16 + prism*.65 + innerReturn + faceReturn;
    return float4(mix(backdrop,clamp(glass,0.0,1.0),coverage),1);
}

// A small optical footprint removes individual text pixels from the polished
// reflection without giving it the face's much wider diffusion kernel.
float3 polishedSample(texture2d<float> scene, sampler linearSampler, float2 uv, float2 texel) {
    float2 d = texel*.5;
    return (scene.sample(linearSampler,uv+float2(d.x,d.y)).rgb
           +scene.sample(linearSampler,uv+float2(-d.x,d.y)).rgb
           +scene.sample(linearSampler,uv+float2(d.x,-d.y)).rgb
           +scene.sample(linearSampler,uv-d).rgb)*.25;
}

// Experimental desktop path: an app-excluded ScreenCaptureKit texture, blurred
// on the GPU before this pass. Foreground glyphs never enter either pipeline.
fragment float4 desktopGlassFragment(VertexOut in [[stage_in]],
    constant GlassUniforms &u [[buffer(0)]], texture2d<float> scene [[texture(0)]],
    texture2d<float> polishedScene [[texture(1)]]) {
    constexpr sampler linearSampler(coord::normalized, address::clamp_to_edge, filter::linear);
    float2 point = in.position.xy / u.viewport.z;
    float2 size = u.viewport.xy;
    float depth = -glassDistance(point, size, u.material.x);
    if (depth <= 0 || u.light.z > .5) return float4(0);
    float2 q = point / size * 2.0 - 1.0;
    // A shallow continuous lens; fade at the boundary so it meets native glass.
    float dome = pow(max(0.0, 1.0 - dot(q,q)*.5), 2.0);
    float2 bend = q * dome * u.material.z * 6.0;
    float2 outward = glassNormal(point,size,u.material.x);
    float edge = exp(-depth / 7.0) * smoothstep(0.0, 3.0, depth);
    bend -= outward * edge * u.material.z * 1.8;
    float2 uv = u.backdrop.xy + ((point + bend) / size) * u.backdrop.zw;
    float3 color = scene.sample(linearSampler, uv).rgb;
    // Background-only chromatic dispersion follows the curved rim. Keep the
    // content-bearing center achromatic and preserve uniform backgrounds.
    float2 spectralOffset = outward * edge * u.material.z * .24 / size * u.backdrop.zw;
    color.r = scene.sample(linearSampler, uv + spectralOffset).r;
    color.b = scene.sample(linearSampler, uv - spectralOffset).b;
    // Polished glass carries sharper, displaced detail at the curved lip.
    // Keep diffusion through the face; never sharpen the content-bearing center
    // or blur the foreground. Both textures are from the same captured frame.
    float polish = .82*(1.0-smoothstep(4.0,17.0,depth));
    if (polish > 0.0) {
        float2 texel = u.backdrop.zw/size;
        float3 clear = polishedSample(polishedScene,linearSampler,uv,texel);
        clear.r = polishedSample(polishedScene,linearSampler,uv+spectralOffset,texel).r;
        clear.b = polishedSample(polishedScene,linearSampler,uv-spectralOffset,texel).b;
        color = mix(color,clear,polish);
        // A faint secondary background image follows the polished section.
        // This is a screen-space optical approximation, not a ray-traced room:
        // sample inward so even a cropped reference texture has valid context.
        // Uniform scenes remain uniform; only the lip carries this reflection.
        float curvature = 2.0*abs(outward.x*outward.y);
        float2 reflectedPoint = point-outward*(12.0+14.0*curvature);
        float2 reflectedUV = u.backdrop.xy+(reflectedPoint/size)*u.backdrop.zw;
        float3 reflectedScene = polishedSample(polishedScene,linearSampler,reflectedUV,texel);
        float reflection = reflectionBand(depth,5.0+curvature,2.8)
                         * (.12+.12*curvature);
        color = mix(color,reflectedScene,reflection);
    }
    // Neutral highlight roll-off protects fixed white foreground text. This
    // follows captured luminance, never a rectangular readability mask. Midtones
    // and blacks transmit unchanged, so dark scenes are not given a gray floor.
    float peak = max(color.r,max(color.g,color.b));
    // A monotone photographic shoulder preserves bright contour separation.
    // The former subtractive smoothstep had an almost-zero derivative around
    // 0.75, flattening several distinct bright tones into one gray band.
    // Preserve black/midtones, a continuous slope at 0.5, and the same 0.67
    // white endpoint; this changes contrast distribution, not opacity.
    float high = max(0.0,peak-.5);
    float transmitted = min(peak,.5)+high/(1.0+3.882353*high);
    color *= transmitted/max(peak,.0001);
    // Blend into the unchanged native optical lip; no dark inner rectangle.
    float alpha = smoothstep(0.0, 2.5, depth);
    return float4(color * alpha, alpha);
}
