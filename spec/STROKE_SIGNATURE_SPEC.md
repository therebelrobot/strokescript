# Stroke Signature Specification
**Version 0.1 — MVP**

> A notation system for describing cam motion profiles. Stroke Signatures are designed to be writable by hand, readable at a glance, usable as physical cam labels, and parseable by machines. They are intentionally independent of any software implementation.

---

## 1. Concepts

### 1.1 What is a Stroke Signature?

A Stroke Signature describes the complete motion profile of a single cam through one full revolution. It defines:

- How many motion segments the revolution is divided into
- The amplitude (follower rise) of each segment
- The curve type used to achieve each transition
- How segments relate to each other in time and phase

A Stroke Signature can be written on paper, stamped on a physical cam, annotated in a design file, or fed into a digital editor.

### 1.2 The Cam Model

This specification assumes a **disk cam with a linear follower**. The cam rotates at constant angular velocity. The follower displacement at any angle is defined entirely by the Stroke Signature.

Key terms:
- **Base radius** — the minimum radius of the cam (follower at rest)
- **Amplitude** — follower displacement above the base radius, in millimetres
- **Stroke** — the full range of follower travel (max amplitude − 0)
- **Segment** — one subdivision of the revolution, defined by a curve type and amplitude
- **Seam** — the point where the last segment meets the first (at 0°/360°)
- **Dwell** — a segment where the follower holds at a fixed amplitude

### 1.3 The Continuity Rule

**A valid Stroke Signature must be continuous at all segment boundaries, including the seam.**

The amplitude at the end of each segment must equal the amplitude at the start of the next. The end of the last segment must equal the start of the first. A notation that violates this describes a physically impossible cam and is considered malformed.

> Example of a valid seam: `[S3 D3 L0]` — rises to 3, holds at 3, returns to 0, seam connects back to 0. ✓  
> Example of an invalid seam: `[S3 D3]` — ends at 3, seam would need to jump back to start of S3. ✗

---

## 2. Primitive Alphabet

Six built-in curve types cover the majority of automata motion needs.

| Symbol | Name | Description |
|--------|------|-------------|
| `S` | Sine | Smooth acceleration and deceleration. The default. Forgiving to cut. |
| `D` | Dwell | Flat hold at current amplitude. No movement. |
| `L` | Linear | Constant velocity rise or fall. Mechanically harsh at endpoints. |
| `E` | Ease | Asymmetric — fast in, slow out. Organic, lifelike feel. |
| `Q` | Quick/Snap | Fast rise, slow return. For strikes, pecks, impacts. |
| `H` | Hold-step | Instantaneous jump. Ratchet or escapement character. |

> **Note on H (Hold-step):** This is a deliberate discontinuity. It is the one exception to the continuity rule — it describes a cam with a sharp drop or rise edge. Use only where the follower has a spring return or the mechanism tolerates impact.

---

## 3. Syntax

### 3.1 Basic Sequence

A Stroke Signature is a **space-separated sequence of segments inside square brackets**.

```
[S3 D L0 D]
```

Each segment is a **curve type symbol followed by an amplitude value** (integer or decimal, in mm).

```
S3    → sine rise to 3mm
D     → dwell (amplitude unchanged from previous segment end)
L0    → linear fall to 0mm
```

> `D` with no amplitude value holds at whatever the previous segment ended at. `D0` holds explicitly at 0mm.

Segments are distributed **evenly** around the 360° revolution by default.

---

### 3.2 Weighted Segments

Use `@` followed by a number to give a segment proportionally more arc space.

```
[S3@2 D L0]
```

Here `S3` receives twice the arc of `D` and `L0`. Total weight = 4 parts. S3 = 180°, D = 90°, L0 = 90°.

---

### 3.3 Nested Subdivision

Square brackets can be nested. A nested group occupies the arc space of one segment, subdivided evenly within it.

```
[S3 [L1 D1 L0] S0]
```

The middle group `[L1 D1 L0]` occupies one third of the revolution, itself split into three equal parts.

---

### 3.4 Repeats

Append `*N` to a group to repeat it N times around the revolution.

```
[S3 D]*4
```

Equivalent to `[S3 D S3 D S3 D S3 D]`. The pattern fills the full revolution.

---

### 3.5 Direction

By default, a Stroke Signature is valid in the direction that produces smooth follower motion. Cams with asymmetric profiles (especially `Q` and `H`) may only be valid in one rotational direction.

Append `CW` or `CCW` after the closing bracket to specify required rotation direction:

```
[Q3 D S0 D] CW
```

---

### 3.6 Custom Curves

Arbitrary curve shapes can be defined using Bézier control points and referenced by name.

**Definition:**
```
@name = B(x1, y1, x2, y2)
```

Where `x1, y1, x2, y2` are the two control points of a cubic Bézier, normalised 0–1 on both axes (matching CSS `cubic-bezier()` convention).

**Usage — inline with colon-separated amplitude:**
```
[@gentle:3 D S0 D]
```

**Predefined library suggestions:**
```
@gentle  = B(0.2, 0.0, 0.8, 1.0)   → smooth, symmetrical ease
@snap    = B(0.9, 0.0, 1.0, 0.4)   → fast attack, slow release
@bounce  = B(0.4, 2.0, 0.6, -0.5)  → overshoot and return
```

---

### 3.7 Comments

Lines beginning with `#` are treated as **line comments** and are ignored by the parser. A `#` may also appear **inline** after valid content — everything from `#` to the end of the line is discarded.

```
# This is a full-line comment

rpm: 120        # tempo in revolutions per minute
base: 20mm      # minimum cam radius
scale: shared   # shared Y axis across all voices
```

```
# Define custom curves
@gentle = B(0.2, 0.0, 0.8, 1.0)

---

# Voice definitions
A: [S3@2 D S0]  # main cam — weighted slow rise
B: A@0.5        # phase offset copy — half revolution
```

> **Note:** The `#` prefix used in compact physical label shorthand (§5, e.g. `#S4-3030`) is a separate human-readable convention and is **not** parseable syntax. The `#` comment syntax described here applies only within parseable score documents.

---

## 4. Multi-Cam Notation (Score Format)

When multiple cams share a shaft, their timing relationships matter. Stroke Signatures can be written as a score.

### 4.1 Named Voices

Assign a label to each cam:

```
cam: [S3 D S0 D]
follower: [D S3 D S0]
```

#### Voice Name Rules

Voice names are **IDENTIFIER tokens** with the pattern `[a-zA-Z_][a-zA-Z0-9_]*` — they begin with a letter or underscore, and may continue with letters, digits, or underscores.

A token becomes a `PRIMITIVE` **only** when **all three** of these conditions hold:
1. The source character is **uppercase** (i.e. the literal character in the file is uppercase)
2. It is one of the six primitive letters: `S`, `D`, `L`, `E`, `Q`, `H`
3. It is **not** immediately followed by another letter

Lowercase letters are **never** tokenised as primitives — `s`, `s1`, `d`, and `q` are all valid IDENTIFIER tokens even though their uppercase forms are primitives. To avoid any risk of primitive tokenisation, voice names should start with a **lowercase letter** or **underscore**.

| Format | Valid? | Reason |
|--------|--------|--------|
| `cam` | ✅ | Lowercase multi-char identifier |
| `cam1` | ✅ | Lowercase identifier with trailing digit |
| `voice_2` | ✅ | Lowercase identifier with underscore and digit |
| `a` | ✅ | Single lowercase letter |
| `a1` | ✅ | Lowercase letter with digit |
| `s` | ✅ | Lowercase form of primitive letter `S` — always an IDENTIFIER, never a PRIMITIVE |
| `s1` | ✅ | Lowercase primitive-letter + digit — tokenises as full IDENTIFIER `"s1"` |
| `S` | ❌ | Uppercase `S` with no following letter — tokenises as PRIMITIVE, not an identifier |
| `S1` | ❌ | Uppercase `S` followed by digit — tokenises as PRIMITIVE `S` + NUMBER `1`, not an identifier |
| `D2` | ❌ | Uppercase `D` followed by digit — tokenises as PRIMITIVE `D` + NUMBER `2` |
| `L1`, `E3`, `Q2`, `H4` | ❌ | All uppercase primitive letters suffer the same tokeniser treatment |

> **Reserved primitive letters (uppercase only):** `S`, `D`, `L`, `E`, `Q`, `H` — these are the six built-in curve type symbols (§2). An **uppercase** primitive letter that is not immediately followed by another letter tokenises as a `PRIMITIVE` token, not part of an identifier. For this reason, uppercase primitive letters cannot safely start a voice name. Their **lowercase** forms (`s`, `d`, `l`, `e`, `q`, `h`) are always identifiers and may freely be used in voice names.

Single uppercase letters that are **not** in the primitive set (e.g. `A`, `B`, `C`) tokenise as identifiers and are accepted as voice names, though lowercase names are recommended for clarity.

### 4.2 Phase Offset

A voice can be defined as a phase-shifted copy of another:

```
B: A@0.5
```

`@0.5` means offset by half a revolution (180°). `@0.25` = 90°, etc.

### 4.3 Score Header

A full score document includes a metadata header, custom curve definitions, and voice definitions separated by `---`:

```
rpm: 33
base: 20mm
max: 8mm
scale: shared          ← or "independent" — see note below
shaft: hex             ← shape of the shaft hole (default: circle)
shaft-diameter: 6      ← diameter in mm (default: 6)
shaft-origin: 12       ← zero-degree reference corner (default: top-right / 12)
cross-leg-width: 2     ← arm width for cross shaft only (default: 2, mm)

@gentle = B(0.2, 0.0, 0.8, 1.0)
@snap   = B(0.9, 0.0, 1.0, 0.4)

---

A: [S3 D @gentle:0]*2
B: A@0.5
C: [Q2 D0]*4 CW
```

**`scale` field:** Controls how amplitudes are compared across voices in a visualiser.
- `shared` — all voices share the same Y axis. Amplitudes are directly comparable.
- `independent` — each voice normalises to its own max. Useful when cams have very different stroke ranges.

**`shaft` field:** Specifies the shape of the shaft hole (crankshaft bore). See §7 for supported shapes. Defaults to `circle`.

**`shaft-diameter` field:** Specifies the shaft hole diameter in mm (circumscribed circle diameter for polygon shapes). Must be positive and less than `2 × base`. Defaults to `6`.

**`shaft-origin` field:** Designates which corner of the shaft polygon (or arm tip for cross) is the zero-degree reference — i.e., the corner/tip that aligns to the cam's 0° position. This eliminates ambiguity when a shaft has multiple identical orientations. See §7.4 for supported values per shape. Defaults to `top-right` for square shafts, `12` for all clock-position shapes including `cross`.

**`cross-leg-width` field:** Specifies the width of each arm of a `cross`-shaped shaft hole, in mm. Only applicable when `shaft: cross`. Defaults to `2`. Must be positive and less than `shaft-diameter`. Ignored for all other shaft shapes.

---

## 5. Shorthand for Physical Labels

When writing a Stroke Signature on a physical cam (marker, stamp, engraving), use the compact form:

- Drop spaces, use `.` as segment separator
- Omit the outer brackets
- Example: `S3.D.L0.D`

For a quick identifier on a toolbox cam, a hash can be used:
```
#S4-3030   → 4-beat sine, amplitudes 3-0-3-0
#Q2-2020   → 4-beat quick, amplitudes 2-0-2-0
```

The hash format is not formally parseable — it is a human-readable label only.

---

## 6. Validity Rules Summary

| Rule | Description |
|------|-------------|
| Continuity | End amplitude of each segment = start amplitude of next |
| Seam | End of last segment = start of first segment |
| H exception | `H` segments are exempt from continuity — discontinuity is intentional |
| Amplitude | Must be ≥ 0. Negative amplitudes are not supported in this version. |
| Custom curves | Must be defined before use |
| Weights | Must be positive non-zero numbers |
| Voice names | Must be IDENTIFIER tokens (`[a-zA-Z_][a-zA-Z0-9_]*`). Uppercase primitive letters (`S`, `D`, `L`, `E`, `Q`, `H`) tokenise as `PRIMITIVE` and cannot start a voice name when uppercased. Lowercase forms (`s`, `d`, etc.) are always identifiers and are valid. Start voice names with a **lowercase letter or underscore** to be safe. |

---

## 7. Shaft Hole Definition

The shaft hole (also called the crankshaft bore or centre hole) is the cutout at the centre of the cam through which the shaft passes.

### 7.1 Syntax

In the **score header** (the metadata section before `---`), add these optional properties:

```
shaft: circle          # Shape of the shaft hole (default: circle)
shaft-diameter: 6      # Diameter in mm (default: 6)
shaft-origin: top-right  # Zero-degree reference corner (default: top-right)
```

### 7.2 Supported Shapes

| Shape | Keyword | Description |
|-------|---------|-------------|
| Circle | `circle` | Standard circular bore (default) |
| Triangle | `tri` | Equilateral triangle inscribed in the shaft diameter |
| Square | `square` | Square inscribed in the shaft diameter |
| Pentagon | `pent` | Regular pentagon inscribed in the shaft diameter |
| Hexagon | `hex` | Regular hexagon inscribed in the shaft diameter |
| Heptagon | `hept` | Regular heptagon inscribed in the shaft diameter |
| Octagon | `oct` | Regular octagon inscribed in the shaft diameter |
| Cross | `cross` | Plus-sign / cross shape with four square-cut arms. See §7.6. |

The `shaft-diameter` specifies the **circumscribed circle diameter** for polygon shapes — i.e., the diameter of the smallest circle that fully contains the polygon. For `circle`, it is simply the diameter. For `cross`, it is the **tip-to-tip span** of each arm (i.e., the total width and height of the cross). See §7.6 for full cross geometry.

### 7.3 Rules

| Rule | Description |
|------|-------------|
| Size constraint | `shaft-diameter` must be positive and less than `2 × base` (the shaft hole must fit inside the base circle) |
| Shape default | `shaft` defaults to `circle` if not specified |
| Diameter default | `shaft-diameter` defaults to `6` if not specified |
| Origin default | `shaft-origin` defaults to `top-right` for square shafts; `12` for all clock-position shapes including `cross` |
| Origin validation | The `shaft-origin` value must be a legal corner/tip for the specified `shaft` shape (see §7.4) |
| Origin for circle | `shaft-origin` has no effect when `shaft: circle` and is ignored by the parser |
| Cross leg width | `cross-leg-width` is required (or defaults to `2`) when `shaft: cross`; ignored for all other shapes |
| Cross leg width range | `cross-leg-width` must be positive and strictly less than `shaft-diameter` |
| Cross leg width default | `cross-leg-width` defaults to `2` if not specified |

### 7.4 Origin Reference

The `shaft-origin` field designates which corner of the shaft polygon (or arm tip for `cross`) is the **zero-degree reference** — the feature that aligns to the cam's 0° position. This is essential when a shaft has multiple identical orientations (e.g., a square has four indistinguishable faces; a cross has four indistinguishable arms; without `shaft-origin`, the cam could be mounted in any matching orientation and still fit the shaft).

#### Supported Values by Shape

| Shape | Keyword | Valid `shaft-origin` Values |
|-------|---------|----------------------------|
| `circle` | Circle | *(not applicable — ignored)* |
| `square` | Square | `top-right`, `top-left`, `bottom-right`, `bottom-left` |
| `tri` | Triangle | `12`, `4`, `8` |
| `pent` | Pentagon | `12`, `2.4`, `4.8`, `7.2`, `9.6` |
| `hex` | Hexagon | `12`, `2`, `4`, `6`, `8`, `10` |
| `hept` | Heptagon | `12`, `1.7`, `3.4`, `5.1`, `6.9`, `8.6`, `10.3` |
| `oct` | Octagon | `12`, `1.5`, `3`, `4.5`, `6`, `7.5`, `9`, `10.5` |
| `cross` | Cross | `12`, `3`, `6`, `9` |

For **square** shafts, corner names use cardinal descriptors (`top-right`, etc.).

For all **polygon** shafts with N sides, corners are labelled by their approximate **clock-face hour position** (e.g., `12`, `2`, `4`, `6`, `8`, `10` for a hexagon). The `12` position corresponds to straight up. Values are read as strings (not numbers), so `12` is the string `"12"`.

For **cross** shafts, the four arm tips are labelled by clock-face hour position: `12` (top arm), `3` (right arm), `6` (bottom arm), `9` (left arm). The `shaft-origin` designates which arm tip is the zero-degree reference.

For polygon shapes not listed above (custom or future additions), label vertices by clock position in the same convention, evenly spaced around the face.

#### Default

If `shaft-origin` is unspecified:
- For `square`: defaults to `top-right`
- For all clock-position shapes (polygon and cross): defaults to `12`

#### Validation

The parser must validate that `shaft-origin` is a legal value for the specified `shaft` shape. An illegal value (e.g., `shaft-origin: top-right` when `shaft: hex`, or `shaft-origin: 2` when `shaft: cross`) is a parse error.

### 7.5 Examples

Simple circle shaft:
```
shaft: circle
shaft-diameter: 8
---
A: [S3 D S0 D]
```

Hexagonal shaft (common for hex key drive), origin at 12 o'clock:
```
shaft: hex
shaft-diameter: 6
shaft-origin: 12
---
A: [S3 D S0 D]
```

Square shaft with explicit origin corner:
```
shaft: square
shaft-diameter: 6
shaft-origin: top-right
---
A: [S3 D S0 D]
```

Cross shaft (laser-cut physical build), custom leg width, top arm as origin:
```
shaft: cross
shaft-diameter: 6
cross-leg-width: 2
shaft-origin: 12
---
A: [S3 D S0 D]
```

In single-voice shorthand (no score format), the shaft defaults to `circle` at `6mm`. To specify a non-default shaft, use the score format.

---

### 7.6 Cross Shape Geometry

The `cross` shaft describes a plus-sign shaped bore suitable for laser-cut physical cam builds where rotational registration is required and the stock or cutter produces straight edges.

#### Geometry

A cross shaft is defined by two parameters:

| Parameter | Header Key | Description | Default |
|-----------|------------|-------------|---------|
| Tip-to-tip span | `shaft-diameter` | Total width and height of the cross, in mm. Each arm extends `shaft-diameter / 2` from the centre to its tip. | `6` |
| Arm width | `cross-leg-width` | Width of each arm of the cross, in mm. All four arms are equal width. | `2` |

The cross is constructed as the **union of two rectangles** sharing the same centre:
- A vertical rectangle: `cross-leg-width` wide × `shaft-diameter` tall
- A horizontal rectangle: `shaft-diameter` wide × `cross-leg-width` tall

All corners and arm ends are **square-cut** (right-angle corners, no rounding, no arcing). This matches the output of a laser cutter or CNC router with a square-end bit and produces the cleanest keyed fit against a matching cross-section shaft stock.

#### Constraints

- `shaft-diameter` must be positive and less than `2 × base`
- `cross-leg-width` must be positive and strictly less than `shaft-diameter`
- `cross-leg-width` defaults to `2` if not specified when `shaft: cross`
- If `cross-leg-width ≥ shaft-diameter`, the cross degenerates into a square and is a validation error

#### Visual Reference

```
        ┌───┐
        │   │   ← cross-leg-width
    ┌───┼───┼───┐
    │   │   │   │  ← cross-leg-width
    └───┼───┼───┘
        │   │
        └───┘
    |←shaft-diam→|
```

Each arm has length `shaft-diameter / 2` from centre to tip, and width `cross-leg-width`. The origin corner (`shaft-origin`) is the tip of the arm at the designated clock position.

---

## 8. Kerf Offset

Kerf is the width of material removed by the laser beam during cutting. When a laser cuts through material, it vaporises a stripe equal to the beam diameter, causing the resulting cut to be slightly smaller than the programmed shape. Kerf offset compensates for this material removal.

### 8.1 The Rule of Internal and External Cuts

The direction of kerf compensation depends on whether a cut is **internal** or **external**:

| Cut Type | Description | Kerf Action | Effect |
|----------|-------------|-------------|--------|
| **Internal cuts** | Cuts that remove material from within a larger piece (e.g., shaft holes, holes in the cam body) | **Subtract** kerf offset | The hole shrinks inward; compensate by cutting slightly larger |
| **External cuts** | Cuts that define the outer edge of a piece (e.g., cam outline, the outer perimeter) | **Add** kerf offset | The piece shrinks inward; compensate by cutting slightly larger |

> **Example:** If `kerfOffset: 0.2` and a shaft hole is programmed at 6mm diameter, the actual cut removes 0.2mm on each side, yielding approximately 5.6mm. To achieve a true 6mm hole, program it at 6.4mm (6 + 0.2 + 0.2).

### 8.2 Syntax

In the **score header**, add the `kerfOffset` property:

```
kerfOffset: 0.2
```

The value is a positive number in the same unit system as the score (typically millimetres).

### 8.3 Interface

```
kerfOffset: number
```

| Property | Type | Description |
|----------|------|-------------|
| `kerfOffset` | `number` | The width of material removed by the laser beam, in the score's unit system. Must be non-negative. Defaults to `0` (no compensation). |

### 8.4 Interaction with Shaft Hole

The shaft hole is an **internal cut** — it removes material from the cam blank. Therefore, the shaft hole geometry is **expanded outward** by `kerfOffset` on all sides during rendering. For a circular shaft, the diameter is increased by `2 × kerfOffset`. For polygon shafts, each vertex is pushed outward along its radial direction by `kerfOffset`.

### 8.5 Interaction with Cam Outline

The cam outline is an **external cut** — it defines the outer edge of the finished cam. Therefore, the outer profile is **expanded outward** by `kerfOffset` during rendering to compensate for the inward material removal.

### 8.6 Protractor Marks

Protractor marks engraved on the face of the cam must be **larger than the kerf offset** to remain visible after cutting. If a mark's line width is less than or equal to `kerfOffset`, the laser will remove the entire mark during cutting. Implementations should ensure protractor mark geometry exceeds `kerfOffset` in at least one dimension.

### 8.7 Text and Engraving

Text or fine detail smaller than `kerfOffset` will not engrave properly — the laser will remove the entire feature rather than leave a visible mark. Minimum text stroke width and feature size should exceed `kerfOffset`. There is no specific minimum text size defined in this specification, but any feature smaller than the kerf value will be lost.

### 8.8 Default

If `kerfOffset` is unspecified, it defaults to `0` (no kerf compensation applied).

---

## 9. Examples

### Simple four-beat rise and fall
```
[S3 D3 S0 D0]
```
Rise to 3mm, hold, fall to 0mm, hold. Seam: 0→0 ✓

### Asymmetric beat with nested detail
```
[S5@2 [Q2 D2 Q0] D0]
```
Long slow rise to 5mm, then a quick double-tap back down to 0, then hold.

### Two-cam score, phase offset
```
rpm: 45
base: 15mm
max: 6mm
scale: shared
---
A: [S6 D6 S0 D0]
B: A@0.5
```

### Custom curve with bounce
```
@bounce = B(0.4, 2.0, 0.6, -0.5)
---
[@bounce:4 D0]*2
```

---

## 10. Notation Cheat Sheet

```
[S3 D L0 D]          Basic sequence — 4 equal segments
[S3@2 D L0]          Weighted — S3 gets double arc space
[S3 [L1 D] S0]       Nested subdivision
[S3 D]*4             Repeat pattern × 4
[@gentle:3 D S0 D]   Custom curve, amplitude 3mm
A: [S3 D S0 D]       Named voice
B: A@0.5             Phase offset — half revolution
S3.D.L0.D            Compact label form (paper/physical)
```

**Primitive symbols:** `S` sine · `D` dwell · `L` linear · `E` ease · `Q` quick · `H` step
