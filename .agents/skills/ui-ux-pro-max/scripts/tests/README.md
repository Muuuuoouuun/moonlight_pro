# Vendored skill validation

Run from the Moonlight repository root; Python 3 standard library is sufficient:

```bash
python3 .agents/skills/ui-ux-pro-max/scripts/validate_data.py
python3 -m unittest discover -s .agents/skills/ui-ux-pro-max/scripts/tests -v
```

This is the runtime package from UI/UX Pro Max v2.15.0. The catalog-refresh
and relevance-evaluator test modules and their fixtures are excluded: they test
upstream maintainer tools (`refresh-google-fonts.py`, `refresh-icon-catalog.py`,
and `evaluate-relevance.py`) that are not part of this vendored runtime. All
self-contained search, design-system, data-contract, taxonomy, text-layout, and
framework-guidance suites are included.

Repository adaptations are limited to portable search commands, prerequisite guidance, and upstream
metadata in `SKILL.md`, the MIT license, test packaging, and removal of
whitespace-only indentation in `design_system.py`.
