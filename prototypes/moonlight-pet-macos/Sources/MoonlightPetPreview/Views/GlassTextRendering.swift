import SwiftUI

/// Protects glyphs, never their enclosing rectangle. The native glass stays a
/// sibling underneath, so neither the letters nor these shadows are refracted.
struct GlassTextProtection: ViewModifier {
    var enabled = true
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast

    func body(content: Content) -> some View {
        if #available(macOS 15.0, *) {
            content.textRenderer(GlassTextRenderer(shadows: enabled && !reduceTransparency && contrast != .increased))
                .labelStyle(GlassLabelStyle())
        } else {
            // macOS 14 uses the denser native popover material instead of clear glass.
            content
        }
    }
}

@available(macOS 15.0, *)
struct GlassTextRenderer: TextRenderer {
    var shadows = true
    var contactOpacity = GlassStudy.glyphShadow
    var softOpacity = GlassStudy.softGlyphShadow
    var contactRadius: CGFloat = GlassStudy.contactRadius
    var softRadius: CGFloat = GlassStudy.softRadius
    var displayPadding: EdgeInsets { EdgeInsets(top: 3, leading: 3, bottom: 3, trailing: 3) }

    func draw(layout: Text.Layout, in context: inout GraphicsContext) {
        for line in layout {
            if shadows {
                // Two shadow-only draws; draw the unchanged glyphs once at the end.
                var soft = context
                soft.addFilter(.shadow(color: Palette.glassShadow.opacity(softOpacity), radius: softRadius,
                                       x: 0, y: 0.5, options: .shadowOnly))
                soft.draw(line)
                var contact = context
                contact.addFilter(.shadow(color: Palette.glassShadow.opacity(contactOpacity),
                                          radius: contactRadius, x: 0, y: 0.35, options: .shadowOnly))
                contact.draw(line)
            }
            context.draw(line)
        }
    }
}

/// Native input views and standalone symbols do not use TextRenderer. Apply
/// before padding/background, only to a transparent input or symbol leaf.
struct GlassGlyphShadow: ViewModifier {
    var enabled = true
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast

    func body(content: Content) -> some View {
        let protected = !enabled || reduceTransparency || contrast == .increased
        content
            .modifier(GlassTextProtection(enabled: false))
            .shadow(color: Palette.glassShadow.opacity(protected ? 0 : GlassStudy.glyphShadow), radius: GlassStudy.contactRadius, y: 0.35)
            .shadow(color: Palette.glassShadow.opacity(protected ? 0 : GlassStudy.softGlyphShadow), radius: GlassStudy.softRadius, y: 0.5)
    }
}

private struct GlassLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 5) {
            configuration.icon.modifier(GlassGlyphShadow())
            configuration.title
        }
    }
}
