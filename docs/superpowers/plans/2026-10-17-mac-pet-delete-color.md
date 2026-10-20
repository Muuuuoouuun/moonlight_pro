# Mac Pet Destructive Action Color

User request: red UX for the task edit/delete flow.

- Use DESIGN.md's danger token in the native palette for destructive actions.
- Make the shared quiet-button style respect the destructive role and disabled state.
- Mark the selected-delete button destructive and tint selected deletion checkboxes red. Keep title text, ordinary completion and edit-mode exit neutral.
- Preserve the existing destructive confirmation and all deletion behavior.

Verification: native build, packaged self-check and visual inspection of the installed selection/confirmation/cancel flow. This is a reversible presentation change; no implementation-mirroring tests are added. Carry the preceding packaged shader repair into the build and preserve it in the original checkout.

Results: native build and strict signature verification passed. Packaged self-check passed with build-tree resources hidden. Independent review found no actionable issue. Installed app inspection confirmed muted disabled deletion with no selection, red selected checkboxes and red enabled delete label/icon, and a red native confirmation action. Cancel preserved both selected rows and the draft; exiting edit mode retained the eight incomplete tasks. No deletion was submitted during verification. The temporary persistent panel was folded back to the pet.
