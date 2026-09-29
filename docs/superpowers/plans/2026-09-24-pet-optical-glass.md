# Optical glass implementation plan

1. Inspect primary author sources/licenses; record applicable concepts and platform limitations.
2. Implement shared runtime-compiled Metal renderer and optical edge. Keep event-driven rendering and native fallback.
3. Add an app-owned background comparison window through `--glass-lab`; no new normal widget controls.
4. Verify GPU output, existing state/geometry checks and real app UI; review the bounded diff.
5. Commit only owned files, integrate into the original branch, build/run the integrated app, remove the worktree.
