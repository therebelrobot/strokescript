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

## 4. Multi-Cam Notation (Score Format)

When multiple cams share a shaft, their timing relationships matter. Stroke Signatures can be written as a score.

### 4.1 Named Voices

Assign a label to each cam:

```
A: [S3 D S0 D]
B: [D S3 D S0]
```

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
scale: shared        ← or "independent" — see note below
shaft: hex           ← shape of the shaft hole (default: circle)
shaft-diameter: 6    ← diameter in mm (default: 6)

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

---

## 7. Shaft Hole Definition

The shaft hole (also called the crankshaft bore or centre hole) is the cutout at the centre of the cam through which the shaft passes.

### 7.1 Syntax

In the **score header** (the metadata section before `---`), add these optional properties:

```
shaft: circle          # Shape of the shaft hole (default: circle)
shaft-diameter: 6      # Diameter in mm (default: 6)
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

The `shaft-diameter` specifies the **circumscribed circle diameter** — i.e., the diameter of the smallest circle that fully contains the polygon. For a circle shape, it is simply the diameter.

### 7.3 Rules

| Rule | Description |
|------|-------------|
| Size constraint | `shaft-diameter` must be positive and less than `2 × base` (the shaft hole must fit inside the base circle) |
| Shape default | `shaft` defaults to `circle` if not specified |
| Diameter default | `shaft-diameter` defaults to `6` if not specified |
| Orientation | Polygon shapes are oriented with one vertex pointing straight up (12 o'clock) |

### 7.4 Examples

Simple circle shaft:
```
shaft: circle
shaft-diameter: 8
---
A: [S3 D S0 D]
```

Hexagonal shaft (common for hex key drive):
```
shaft: hex
shaft-diameter: 6
---
A: [S3 D S0 D]
```

In single-voice shorthand (no score format), the shaft defaults to `circle` at `6mm`. To specify a non-default shaft, use the score format.

---

## 8. Examples

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

## 9. Notation Cheat Sheet

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
