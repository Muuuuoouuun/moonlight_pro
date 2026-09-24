# Pet clear material correction

Status: operator correction — the clear version became foggy/white; restore transparency.
Relation: supersedes the native `regular` default and lab luminance compression in `2026-09-24-pet-optical-glass-design.md`; other interaction/artwork requirements remain as approved.

- Floating utility/widget panels use native `.clear` without tint. Reduce Transparency or Increase Contrast selects `.regular` and responds to live system setting changes. Older macOS keeps the native fallback.
- Remove the Metal comparison's whole-panel white luminance floor and blur in the flat center. Keep edge refraction/reflection.
- Improve content boundaries with a one-point alpha-shaped light halo, not a full-panel scrim. The dark focus shield/card is separate from this correction.
- Verify the original background survives in central shader pixels, retain existing GPU/state checks, inspect both materials over a patterned background and verify input in the native material.

Evidence: old shader failed the new comparison test (75.42/255 mean RGB drift); corrected shader passed at 0.00/255. Native comparison confirmed clear background transmission and Korean paste. No system accessibility preferences were changed during QA.
