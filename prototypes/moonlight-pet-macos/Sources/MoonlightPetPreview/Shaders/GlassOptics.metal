#include <metal_stdlib>
using namespace metal;

// Original implementation. Research and platform boundaries: design/glass-optics-research.md.
struct GlassUniforms {
    float4 viewport; // point width, height, backing scale, mode (0 edge / 1 lab)
    float4 rect;     // glass bounds in top-left point coordinates
    float4 material; // radius, bevel, refraction strength, calibration pattern
    float4 light;    // pointer x/y normalized, accessibility fallback, reserved
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
    float specular = pow(max(0.0,dot(normal,normalize(lamp+float3(0,0,1)))),22.0);
    float fresnel = .035 + .965 * pow(1.0-normal.z,5.0);
    float hairline = 1.0-smoothstep(.35/u.viewport.z,1.25/u.viewport.z,depth);
    float highlight = clamp(.58*specular*(1.0-t) + .42*fresnel*(1.0-t) + .30*hairline,0.0,.82);
    float shadow = (1.0-t) * .09 * exp(-pow((depth-bevel*.75)/(bevel*.32),2.0)) * max(0.0,dot(outward,float2(.7,.7)));
    if (u.light.z > .5) {
        if (lab) return float4(mix(backdrop,float3(.92)*(1-hairline*.6),coverage),1);
        float a = hairline*.65*coverage;
        return float4(float3(.15)*a,a);
    }
    if (!lab) {
        // Premultiplied alpha; exactly transparent center, pass-through input.
        float a = (highlight+shadow)*coverage;
        return float4(float3(highlight)*coverage,a);
    }
    float3 ray = refract(float3(0,0,-1),normal,1.0/1.46);
    float2 displacement = ray.xy / max(.1,-ray.z) * (bevel*.28 + height*bevel) * u.material.z;
    float2 samplePoint = point + displacement;
    float blur = mix(.35,2.0,t);
    float3 glass = softened(samplePoint,u,blur);
    // Small edge dispersion; never offsets or blurs the foreground text.
    glass.r = softened(point + displacement*.992,u,blur).r;
    glass.b = softened(point + displacement*1.012,u,blur).b;
    // Compress backdrop contrast into a silver luminance range so dark foreground
    // labels remain readable on both bright folds and the dark calibration grid.
    glass = float3(.56,.57,.58) + glass*.35;
    glass = glass*(1-shadow) + highlight*.54;
    return float4(mix(backdrop,clamp(glass,0.0,1.0),coverage),1);
}
