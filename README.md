# StrokeScript

> Sheet music for machines that go clunk — write cam motion profiles in plain text.

StrokeScript is a notation system for describing cam motion profiles, plus a browser-based editor for composing, visualizing, and exporting cam shapes. The notation is designed to be writable by hand, readable at a glance, stampable on a physical cam, and parseable by machines.

## Quick Example

```
[S3 D S0 D]
```

A 4-segment cam profile: **sine rise** to 3mm, **dwell** at top, **sine fall** to 0, **dwell** at bottom. Each segment gets an equal share of the 360° revolution.

## Repository Structure

```
spec/                  ← notation specification & design docs
packages/parser/       ← standalone TypeScript parser (zero dependencies)
packages/editor/       ← browser-based editor (React + CodeMirror + Vite)
```

## Specification

The [Stroke Signature Spec](spec/STROKE_SIGNATURE_SPEC.md) defines the notation language. Six primitive curve types cover most automata motion needs:

| Symbol | Name | Character |
|--------|------|-----------|
| `S` | Sine | Smooth acceleration and deceleration |
| `D` | Dwell | Hold at current amplitude |
| `L` | Linear | Constant velocity rise or fall |
| `E` | Ease | Fast in, slow out — organic feel |
| `Q` | Quick | Fast rise, slow return — strikes and pecks |
| `H` | Hold-step | Instantaneous jump — ratchets |

The spec also supports weighted segments (`S3@2`), nested subdivision (`[S3 [L1 D] S0]`), repeats (`[S3 D]*4`), custom Bézier curves (`@gentle = B(0.2, 0.0, 0.8, 1.0)`), and a multi-cam score format for synchronized cam shafts.

See also: [Editor Design Document](spec/STROKE_SIGNATURE_EDITOR.md) · [Architecture](spec/ARCHITECTURE.md)

## Editor

**Live demo:** [therebelrobot.github.io/strokescript](https://therebelrobot.github.io/strokescript/)

A browser-based score editor with real-time visualization. Write StrokeScript notation and see waveform and cam shape previews update as you type. Export cam outlines as SVG or DXF for laser cutting and CNC fabrication.

## Development

```bash
# Install dependencies
npm install

# Start the editor dev server
npm run dev

# Build all packages
npm run build

# Run tests
npm test
```

Requires [Node.js](https://nodejs.org/) 20+.

## License

MIT — Aster Haven
