# Design System

## Source of Truth

- Selected map-first reference: `project-intelligence/assets/design-references/selected-2026-08-15/direction-map-first.png`
- Selected journey and companion reference: `project-intelligence/assets/design-references/selected-2026-08-15/direction-journey-companion.png`
- Fusion contract: `project-intelligence/assets/design-references/selected-2026-08-15/00-fusion-visual-contract.md`

The two selected images and fusion contract form the visual target. Generated map geometry and generated scenery are visual references only and never factual data.

## Visual Theme

Contemporary Lingnan travel editorial with precise cartography. Use a moon-white neutral field, deep pine navigation surfaces, route gold for confirmed directional emphasis, lychee red for warm highlights, river blue for map information, and tea-brown supporting text. The product should feel calm and tangible rather than nostalgic or ceremonial.

## Color Strategy

Use semantic CSS tokens and OKLCH values. Keep the visitor product primarily light for outdoor legibility, with dark pine surfaces reserved for navigation, media overlays, and night-map context. High-contrast mode is a first-class theme rather than a browser afterthought.

- `--canvas`: neutral moon-white page background.
- `--surface`: clean content surface.
- `--surface-muted`: quiet controls, toolbars, and secondary regions.
- `--ink`: primary dark pine text.
- `--ink-muted`: supporting copy with WCAG AA contrast.
- `--brand`: pine green for primary actions and current navigation.
- `--route`: route gold for selected or verified path emphasis.
- `--lychee`: warm red for highlights, not error semantics.
- `--river`: restrained blue for water, information, and location.
- `--danger`, `--warning`, `--success`, `--focus`: independent semantic state colors.

## Typography

Use a readable Chinese-first sans-serif stack for navigation, controls, body copy, and dense map information. A restrained Song-style serif may appear only in immersive editorial headlines or cultural quotations, never in small labels, forms, data, or safety controls.

- Product body: 16px desktop and mobile, minimum 14px for compact metadata.
- Headings: fixed product scale with balanced wrapping; hero display may use `clamp()` but must not exceed 6rem.
- Body line length: 45-75 characters.
- Display tracking: never tighter than -0.04em.
- Use tabular figures for distances, times, coordinates, revisions, and route metrics.

## Spacing And Grid

Base spacing unit is 4px. Common steps are 4, 8, 12, 16, 24, 32, 48, 64, and 96px. Avoid isolated values unless optical alignment requires them.

- Mobile: one column, 16px page inset, safe-area aware, bottom task navigation.
- Tablet: 24px inset, two-column content where useful.
- Desktop editorial pages: max 1280px content frame with asymmetric media and content tracks.
- Desktop map workspace: map owns 60%-75% of the viewport; controls use edge rails and task panels.
- Minimum touch target: 48 by 48px for the visitor product.

## Layout Families

### Immersive

Home and cloud-tour pages. Video or authentic media creates atmosphere; clear route, map, and cloud-tour tasks remain visible. Do not cover important content with permanent copy or the mascot.

### Map Workspace

Visitor map, arrival, live guide, and map editor. Use high information density, edge-aligned controls, readable labels, an accessible equivalent list, and explicit state or provenance. Style themes may change expression but not geometry or operational status.

### Journey Editorial

Plan, journey, saved knowledge, and sharing. Use a continuous itinerary rhythm with time, evidence, confidence, and actions. Prefer lines, spacing, and sections over nested cards.

### Utility

Account, privacy, readiness, and administration. Reduce decoration, preserve the same typography, token, control, and feedback vocabulary.

## Navigation

The visitor information architecture uses four stable destinations: 首页, 行程, 地图, 我的. 云游, AI问答, and 现场导览 are task entry points within pages. Desktop may add a top navigation treatment, but labels, destinations, active state, and reading order remain consistent. Use Phosphor icons throughout.

## Components

- Buttons: primary, secondary, quiet, destructive; all include hover, focus, active, disabled, loading, success, and error behavior where relevant.
- Inputs: visible labels, persistent hints when necessary, inline errors, 48px visitor height, and no placeholder-only labeling.
- Panels: use only for real containment or layered map controls; never nest decorative cards.
- Dialogs and sheets: trap focus, restore focus, close with Escape, and use bottom sheets on phone when appropriate.
- Status: pair icon and text; color alone is insufficient.
- Map markers: maintain a 48px interactive target, visible selection, text/list equivalent, and theme-independent geometry.
- Mascot: movable 2.5D assistant with bounded drag, edge hiding, dismissible transient bubbles, and a reduced-motion static state.

## Media

The homepage hero uses the provided ten-second video as muted, looping, inline background media with a poster frame. Respect reduced motion and data-saving preferences. Real scenic photography must carry source, usage rights, and an honest caption when context requires it. AI images never impersonate real scenery.

## Motion

Product transitions use 150-250ms ease-out curves. Motion communicates state, focus, location, speaking, listening, or completion. No bounce or elastic easing. Never animate layout properties in continuous interaction. Every animation has a reduced-motion alternative.

## Map Themes

1. 标准详图: maximum label and facility legibility.
2. 岭南禅意: restrained pine, ink, stone, and route-gold expression over unchanged data.
3. 夜游安心: dark low-glare surface with strong path, safety, exit, and help contrast.
4. 香荔手账: warm editorial accents for planning and cloud touring, never for safety-critical live navigation.

## Quality Bars

- Home and immersive surfaces: design variance 7, motion 5, density 4.
- Map workspace: design variance 4, motion 3, density 8.
- Utility and administration: design variance 3, motion 2, density 6.
- No visible em dash or en dash characters.
- No generic placeholder imagery, hand-drawn interface SVGs, emoji icons, or fake map details.
- No component may conceal provenance, verification status, offline limits, or safety boundaries.
