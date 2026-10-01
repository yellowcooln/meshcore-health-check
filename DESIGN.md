# App design: radio console

Scope: `/app` only, Operate mode. This supersedes the rejected flat field-utility
look. Shared results, verification and privacy retain their existing designs.

## Direction contract

- **Thesis:** copy a code, send it from MeshCore, observe real reception. The
  interface resembles an illuminated radio instrument, not a telemetry wallpaper.
- **Own world:** navy chassis, cyan controls, amber code/channel emphasis;
  inset code display, beveled panel edges and soft offset shadows. Light mode is
  pale blue/white with dark teal controls and readable bronze code text.
- **Story:** read the configured identity, copy/send, inspect measured reach,
  then adjust observers on the map. Keep full selection caveats beside the score.
- **First viewport:** compact brand/utility header; asymmetric command strip
  with a large code display left and a compact score instrument right. The map
  owns the broad desktop column; receipts/history occupy a narrower side rail.
  Tablet stacks map and reports; phone also stacks command and score.
- **Form:** user/parent-pinned radio-console direction. Launcher/seed unavailable;
  no substitute seed or fabricated visual approval. Existing DOM hooks and score
  ring geometry retained; no new runtime dependencies or invented telemetry.
- **Finish:** parent owns browser review, contrast/overflow verification and test
  execution. This source-only handoff is not a visual approval or deployment.

## Implementation truth

`public/radio-console.css` loads after `styles.css` in the app shell only and
scopes all rules to `body.radio-console[data-page-mode="app"]`.

Dark palette: background `#071526`, surface gradient `#193950` to `#0c2034`,
text `#edf8ff`, secondary `#a7c1d2`, cyan `#69dce9`, code `#ffd08a`.
Light palette: background `#e8f3fa`, surface gradient `#ffffff` to `#e5f2fa`,
text `#12364d`, secondary `#47667c`, teal `#006b82`, code `#87500b`.
System sans for interface text, local monospace stack for codes and measurements.
Panels use 16px corners, controls/display 8-10px; controls retain 44px targets.
The score ring is 104px (84px on phones), driven by existing measured state.
Only state transitions animate; decorative looping glows are removed from the app.
No truncation, clamping or collapsed treatment of selection guidance.

Regression additions cover app-only asset loading, preserved hooks, cache revision,
and dark/light responsive task visibility at 1440, 978 and 390px. Execution and
screenshots are deliberately deferred to the parent agent.
