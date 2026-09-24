# Pet character glass and white text

Status: confirmed by the operator, 2026-09-25.

Relation: supersedes the un-tinted floating material and black text decisions in `2026-09-25-pet-clear-material-correction.md`. The sharp foreground host, optical edge, original idle portraits and expanded character poses remain.

- Text and icons use opaque white-family tokens: bright white primary, softer white secondary and light grey metadata. No glyph halo or full-content shadow.
- Quick panels, persistent panels and short messages use a translucent wash with the selected pet's identity color. Eevee: brown; Vaporeon: blue; Jolteon: gold; Flareon: warm red; Espeon: lilac; Umbreon: midnight; Leafeon: sage; Glaceon: ice blue; Sylveon: soft blush pink (the operator first requested more pink, then a lighter, less saturated pink). These colors are explicitly requested for the native pet, not new Hub palette rules.
- Keep native clear glass and the optical rim. The wash supplies a stable dark base for white text and attenuates background lettering. It reduces body transparency; it does not add more background blur or guarantee readability over every desktop image.
- Character selection updates existing material views through the model, without rebuilding the text host or losing a draft/focus. No new product controls.
- Reduce Transparency / Increase Contrast makes the wash solid and retains the native accessibility material fallback.
- The optional material lab provides a non-persistent character selector to compare the same wash over native and Metal surfaces.

Implementation/verification: define native theme tokens; connect the three floating hosts to character selection; match the lab; run Swift self-check/build; inspect native text, editing and character changes. Do not add application records during visual QA.
