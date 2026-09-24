# Pet character glass and white text

Status: confirmed by the operator, 2026-09-25.

Relation: supersedes the un-tinted floating material and black text decisions in `2026-09-25-pet-clear-material-correction.md`. The sharp foreground host, optical edge, original idle portraits and expanded character poses remain.

- Text and icons use opaque white-family tokens: bright white primary, softer white secondary and light grey metadata. No glyph halo or full-content shadow.
- Basic/typing state must retain the earlier clear appearance: no persistent character wash. The operator explicitly rejected the always-translucent body after reviewing it.
- Pressing/dragging temporarily shows the selected pet's translucent color, then releases back to clear. Eevee: brown; Vaporeon: blue; Jolteon: gold; Flareon: warm red; Espeon: lilac; Umbreon: midnight; Leafeon: sage; Glaceon: ice blue; Sylveon: soft blush pink at 60% wash opacity (reduced from 76% at the operator's request). These colors are confined to the native pet.
- Keep native clear glass and the optical rim. The temporary wash does not add blur or guarantee text contrast over every desktop image. Window inactivity is not used to latch a permanent colored sheet over the panel.
- Character selection updates existing material views through the model, without rebuilding the text host or losing a draft/focus. No new product controls.
- Reduce Transparency / Increase Contrast makes the wash solid and retains the native accessibility material fallback.
- The optional material lab provides a non-persistent character selector and an explicit tint preview, off by default, to compare native and Metal surfaces. That override is never enabled in real panels.

Interaction contract: consume no input events; begin from a mouse-down inside this panel or an explicit drag signal from its handle/companion pet; clear on release even outside the panel, key loss, app deactivation or detach. A release-only timer runs during a press in common run-loop modes to cover native controls that consume mouse-up internally. It never runs while idle.

Implementation/verification: define native theme tokens; connect the three floating hosts to character selection; match the lab; run Swift self-check/build; inspect native text, editing and character changes. Do not add application records during visual QA.

2026-09-25 drag correction: the separate pet window must forward drag start/update/end to every visible companion panel. Native handle drags also send those signals directly. The wash listens only to its own target window; release watchdog, key loss and app deactivation still clear it. No drag state survives into normal typing.
