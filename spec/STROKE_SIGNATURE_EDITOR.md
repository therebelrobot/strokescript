# Stroke Signature Editor — Design Document
**Version 0.1 — MVP**

> A browser-based composition environment for Stroke Signatures. The editor makes the Stroke Signature spec come alive: live parsing, inline visualisation, cam export, and multi-voice playback. Designed for makers, automata builders, and musicians working at the intersection of mechanical and musical timing.

---

## 1. Philosophy

The editor is a **score editor**, not a drawing tool. The source of truth is always the text notation — visualisations are derived from it, not the other way around. This keeps the system honest to the paper spec and makes the notation the transferable artefact.

The UI should feel closer to a code editor or a DAW than to a CAD tool. Fast to type, immediate feedback, nothing hidden behind menus.

---

## 2. Layout

```
┌─────────────────────────────────────────────────────────┐
│  HEADER: score metadata (rpm, base, max, scale)         │
├─────────────────────────────────────────────────────────┤
│  EDITOR PANE                                            │
│                                                         │
│  @gentle = B(0.2, 0.0, 0.8, 1.0)       [~~] [○]       │
│                                                         │
│  A: [S3 D S0 D]                         [~~] [○]       │
│  B: A@0.5                               [~~] [○]       │
│  C: [Q2 D0]*4                           [~~] [○]       │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  TRANSPORT: [▶ Play All]  [■ Stop]  BPM: [120]         │
└─────────────────────────────────────────────────────────┘
```

Each defined voice or curve renders an **inline sparkgraph row** — a waveform thumbnail `[~~]` and a cam thumbnail `[○]` — on the same line as its notation, immediately after parsing.

---

## 3. Inline Sparkgraphs

### 3.1 Waveform Sparkgraph

- A small canvas element, approximately `160px × 32px`
- X axis = 0°–360° (one full revolution)
- Y axis = follower amplitude
- Rendered as a filled area chart for readability at small size
- The line is colour-coded by segment type (configurable palette, see Section 7)
- Segment boundaries are marked with subtle vertical tick marks

**Y axis scaling:**
- Controlled by the `scale` header field
- `shared` — all voices share the same Y max (the global `max` from the header)
- `independent` — each voice normalises to its own maximum amplitude

### 3.2 Cam Sparkgraph

- A small canvas element, approximately `32px × 32px`
- Polar plot: angle = cam rotation, radius = base + amplitude at that angle
- Base circle shown as a faint inner ring
- Cam outline drawn as a closed filled shape
- Rotation direction indicated by a small arrow if `CW`/`CCW` is specified

### 3.3 Placement

Both sparkgraphs appear **inline on the text line** of their definition, right-aligned. They update in real time as the user types. If the notation is unparseable, the sparkgraph area shows a subtle error indicator (red tint, no shape rendered).

---

## 4. Playback

### 4.1 Play All

Pressing **Play All** starts synchronised animation across all voices simultaneously.

- A vertical **"now" line** appears at the left edge of each waveform sparkgraph
- The waveform scrolls rightward, so future content enters from the right and the current moment stays at the left
- The cam sparkgraph rotates at the correct angular velocity for the score's `rpm` value
- A **follower indicator** — a small dot — sits at the 12 o'clock position on each cam and moves radially in sync with the cam's rotation

**Tempo source:**
- `rpm` in the score header drives physical cam speed
- If a `bpm` value is also set in the header, the editor shows alignment between musical beats and cam positions — useful for timing automata to music

### 4.2 Per-Voice Playback

Each voice row has its own play button (the `[○]` cam thumbnail is also a play toggle). Playing a single voice plays only that cam in isolation.

### 4.3 Loop

Playback loops continuously. The waveform scroll and cam rotation repeat seamlessly. A bad seam (continuity violation) will be visually apparent as a jump in the scrolling waveform.

### 4.4 Transport Controls

| Control | Description |
|---------|-------------|
| ▶ Play All | Start all voices in sync |
| ■ Stop | Stop all playback, reset to position 0 |
| BPM | Musical tempo, used for beat grid overlay (optional) |
| RPM | Physical cam speed, drives animation rate |

---

## 5. Interaction

### 5.1 Hover

Hovering a sparkgraph shows a tooltip with:
- Segment index and type at the hovered position
- Amplitude at that point
- Angle in degrees

### 5.2 Click / Tap — Expand to Full View

Clicking either sparkgraph expands that voice to a **full editor panel** overlaid on the page:

```
┌────────────────────────────────────────────────────────┐
│  A: [S3 D S0 D]                              [×] Close │
├──────────────────────────┬─────────────────────────────┤
│                          │                             │
│   WAVEFORM (full width)  │   CAM SHAPE (large)         │
│                          │                             │
│   Segment table below    │   [ Export SVG ]            │
│                          │   [ Export DXF ]            │
│                          │   [ Copy Notation ]         │
└──────────────────────────┴─────────────────────────────┘
```

The segment table shows each segment as a row: type, amplitude, arc degrees, start angle, end angle.

### 5.3 Export

From the expanded view:

| Export | Description |
|--------|-------------|
| **SVG** | Vector cam outline, scaled to real dimensions using `base` from header. Ready for laser cutting or CNC. |
| **DXF** | Same outline in DXF format for CAD import. |
| **Copy Notation** | Copies the compact label form (`S3.D.S0.D`) to clipboard for physical labelling. |
| **Copy Score Block** | Copies the full voice definition including header metadata. |

SVG/DXF output includes:
- Cam outline at 1:1 scale (mm)
- Centre hole circle (diameter configurable, default 6mm for common axle sizes)
- Rotation direction arrow
- Stroke Signature label engraved/etched as text on the face

---

## 6. Parser

### 6.1 Responsibilities

The parser transforms a Stroke Signature string into an **intermediate representation (IR)** used by both the renderer and the exporter.

### 6.2 Intermediate Representation

```typescript
type CurveType = 'S' | 'D' | 'L' | 'E' | 'Q' | 'H' | string // string = custom @name

interface Segment {
  curve: CurveType
  amplitude: number       // mm, absolute target amplitude
  weight: number          // arc weight (default 1)
  startAngle: number      // degrees, computed after layout
  endAngle: number        // degrees, computed after layout
}

interface Voice {
  label: string
  segments: Segment[]
  direction?: 'CW' | 'CCW'
  sourceNotation: string
}

interface Score {
  rpm: number
  bpm?: number
  baseMm: number
  maxMm: number
  scale: 'shared' | 'independent'
  customCurves: Record<string, BezierDefinition>
  voices: Voice[]
}
```

### 6.3 Parse Steps

1. **Tokenise** — split the string into bracket groups, symbols, numbers, operators
2. **Resolve references** — expand `B: A@0.5` into a full segment list with offset applied
3. **Expand repeats** — `[S3 D]*4` → four copies of `[S3 D]`
4. **Flatten nesting** — resolve nested brackets into a flat segment list with computed weights
5. **Assign arc angles** — distribute 360° proportionally by weight
6. **Validate continuity** — check all segment boundaries and the seam; flag `H` segments as exempt
7. **Resolve amplitudes** — `D` with no value inherits previous end amplitude

### 6.4 Error Handling

Errors are non-blocking. A parse error on one voice should not prevent other voices from rendering. Errors are displayed inline below the offending line, in the style of a code editor lint message.

| Error | Message |
|-------|---------|
| Seam discontinuity | `Seam mismatch: ends at {n}mm, starts at {m}mm` |
| Unknown curve type | `Unknown curve type '{X}'` |
| Undefined custom curve | `Custom curve '@name' is not defined` |
| Amplitude out of range | `Amplitude {n}mm exceeds score max {m}mm` |
| Malformed bezier | `B() requires exactly 4 values between 0 and 1` |

---

## 7. Rendering

### 7.1 Waveform Renderer

The waveform renderer samples the cam profile at regular angular intervals (default: 360 samples per revolution) and maps each to a pixel position.

**Curve interpolation per segment type:**

| Type | Interpolation |
|------|--------------|
| `S` | `0.5 * (1 - cos(π * t))` — sine ease |
| `D` | constant — `startAmplitude` |
| `L` | linear — `startAmplitude + t * (endAmplitude - startAmplitude)` |
| `E` | cubic bezier `B(0.25, 0.1, 0.25, 1.0)` |
| `Q` | cubic bezier `B(0.9, 0.0, 0.6, 1.0)` |
| `H` | step — output jumps instantly at `t = 0` |
| `@name` | cubic bezier with user-defined control points |

Where `t` is the normalised position within the segment (0–1).

### 7.2 Cam Shape Renderer

The cam shape is derived from the waveform by converting to polar coordinates:

```
r(θ) = baseMm + amplitude(θ)
x(θ) = r(θ) * cos(θ)
y(θ) = r(θ) * sin(θ)
```

Sample at the same resolution as the waveform. Connect points with a smooth closed path (SVG `path` with cubic bezier segments between sample points, or canvas `bezierCurveTo`).

### 7.3 Colour Palette

Each curve type has a default colour for segment highlighting in the waveform:

| Type | Default colour |
|------|---------------|
| `S` | `#4A90D9` blue |
| `D` | `#9B9B9B` grey |
| `L` | `#E8A838` amber |
| `E` | `#7ED321` green |
| `Q` | `#E8473F` red |
| `H` | `#9B59B6` purple |
| `@custom` | `#1ABC9C` teal |

Palette should be user-configurable in settings.

---

## 8. Technology Recommendations

| Concern | Recommendation |
|---------|---------------|
| Framework | React |
| Editor input | `CodeMirror 6` with a custom Stroke Signature language mode for syntax highlighting |
| Canvas rendering | HTML5 Canvas for sparkgraphs; SVG for the expanded cam view |
| Animation | `requestAnimationFrame` loop driven by a shared clock |
| Export (SVG) | Serialise the SVG cam path directly |
| Export (DXF) | Lightweight DXF writer (e.g. `dxf-writer` npm package) |
| State management | React context or Zustand for score state |
| Parsing | Hand-written recursive descent parser (the grammar is simple enough) |

---

## 9. File Format

The editor saves and loads `.ss` files — plain text Stroke Signature score documents as defined in the spec. This is the canonical file format. There is no proprietary binary format.

A `.ss` file is valid as a standalone text document readable without the editor.

```
# example.ss
rpm: 33
base: 20mm
max: 8mm
scale: shared

@gentle = B(0.2, 0.0, 0.8, 1.0)

---

A: [S3 D S0 D]
B: A@0.5
C: [@gentle:2 D0]*4
```

---

## 10. Future Considerations (Post-MVP)

These are explicitly out of scope for v0.1 but worth designing toward:

- **MIDI export** — map cam positions to MIDI CC values, enabling direct synchronisation with music software
- **Tidal Cycles / Strudel bridge** — output a Strudel pattern string from a Stroke Signature for auditioning rhythms as sound
- **Multi-shaft scores** — cams on different shafts with gear ratio relationships between them
- **3D barrel cam** — cylindrical cam notation as an extension of the disk cam model
- **Fabrication pipeline** — direct send to laser cutter or CNC via browser (WebUSB or local server bridge)
- **Cam library** — a shareable registry of named Stroke Signatures, like a package manager for cam profiles
- **Negative amplitude** — drop cams (below base circle), once physical constraint modelling is in place

---

## 11. Reference: Stroke Signature Spec

This editor implements **Stroke Signature Specification v0.1**. See `STROKE_SIGNATURE_SPEC.md` in this repository for the full paper-readable specification, which is intentionally independent of this software.
