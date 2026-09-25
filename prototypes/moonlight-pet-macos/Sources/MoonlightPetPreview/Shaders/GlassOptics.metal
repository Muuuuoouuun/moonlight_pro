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
    // A restrained spectrum in the rounded lip, not a rainbow frame. Its
    // direction follows the surface normal; wavelength peaks are subpoint
    // offsets and vanish before the flat face. On desktop this is a simulated
    // reflected light, not refraction of windows behind the application.
    // Scale the spectral lip with the bevel: production 9pt is 90% of the
    // previous 10pt band. The outer hairline stays one physical pixel.
    float lipScale = min(1.0,bevel/10.0);
    float dispersion = .36*lipScale*clamp(u.material.z,0.0,1.8);
    float direction = dot(outward,normalize(float2(-.7,-.5))) >= 0 ? 1.0 : -1.0;
    float center = min(1.35*lipScale,bevel*.18);
    float width = max(.52,.72/u.viewport.z)*lipScale;
    float3 spectrum = float3(reflectionBand(depth,center-dispersion*direction,width),
                              reflectionBand(depth,center,width),
                              reflectionBand(depth,center+dispersion*direction,width));
    float litArc = .24 + .76*pow(abs(dot(outward,normalize(float2(-.7+u.light.x*.1,-.5+u.light.y*.1)))),3.0);
    float3 prism = spectrum * (.11*litArc*(1.0-t));
    if (!lab) {
        // Premultiplied alpha; exactly transparent center, pass-through input.
        float3 reflection = float3(highlight) + prism;
        float a = (max(reflection.r,max(reflection.g,reflection.b))+shadow)*coverage;
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
    glass = glass*(1-shadow) + highlight*.54 + prism*.65;
    return float4(mix(backdrop,clamp(glass,0.0,1.0),coverage),1);
}
