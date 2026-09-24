# Quick memo perch and drag feedback

Status: confirmed by the operator, 2026-09-25.

Relation: refines the memo dimensions and quick-panel character placement in `2026-09-24-pet-approved-glass-design.md`. The clear-at-rest contract in `2026-09-25-pet-character-glass-design.md` remains authoritative.

## Approved behavior

- Actual dragging must show the same temporary character wash as a press, including dragging the separate idle portrait while its quick panel follows.
- On release, normal typing and the resting panel return to clear glass. Keep white text and Sylveon's soft blush at 60% during interaction only.
- Adapt the supplied glass-card reference for quick memo: a generous landscape body, large title, inline 할 일/메모 selector, inset writing area, bottom-right collapse, and transparent perched character at the upper right.
- Memo window: 520×440pt including the 54pt upper character allowance. Both quick and pinned memo use the same composition.
- Original portrait remains the idle form. Hide that separate portrait while the perched quick memo is open, and restore it on close or transition back to the quick task panel.
- Existing tasks and their vertical schedule layout stay intact. Council continuation and memo pinning remain in More, with the existing keyboard shortcuts and automatic local saving.

## Material and geometry

Use the existing native clear material, transparent optical rim, and separate sharp foreground host. The reference informs proportions and character placement; it is not a bitmap background. The native glass retains its rounded rectangle; this change does not introduce the reference's custom concave notch.

## Verification scope

Swift self-check covers drag state release, geometry, persistence and real Metal output. Native QA must cover quick memo opening, task/memo switching, collapse to portrait, and physical drag event delivery. Do not create or replace the operator's records while checking visuals.
