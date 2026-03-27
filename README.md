# Psychedelica Viz

Psychedelic audio visualizer built with vanilla JavaScript and the Web Audio API. Renders real-time frequency-reactive visuals in the browser using Canvas 2D.

## Tech Stack

- **Language**: Vanilla JavaScript (no framework)
- **Audio**: Web Audio API (AnalyserNode FFT)
- **Rendering**: HTML5 Canvas 2D
- **Styling**: CSS3

## Files

```
index.html      # Entry point with canvas element
viz.js          # Visualizer engine (audio analysis + rendering)
styles.css      # Layout and styling
RESEARCH.md     # Research notes on psychedelic visual techniques
```

## Usage

Open `index.html` in a browser. No build step required.

```bash
# Serve locally (any static server works)
npx serve .
# or
python3 -m http.server 3000
```

Grant microphone access when prompted to visualize live audio input, or connect an audio source.

## Related

- [kartis-astro](../kartis-astro) -- Nightlife platform (potential embed target)
