# Audio-Reactive Visualization Research (2026)

## Industry Tools & Platforms

### Professional VJ / Live Visual Software

| Tool | Type | Strengths | Used By |
|------|------|-----------|---------|
| **TouchDesigner** | Node-based GPU computing | Real-time generative art, GLSL shaders, GPU particles, instancing | @visualdon, festival VJs, immersive installations |
| **Resolume Arena/Wire** | VJ performance + node compositor | Layer blending, FFGL plugins, DMX integration, real-time mapping | Club VJs, touring artists, LED wall operators |
| **Processing / p5.js** | Creative coding framework | Accessible generative art, strong community, WebGL mode | @trentbrooks, creative coders, education |
| **Deforum / Stable Diffusion** | AI-powered video generation | Style transfer, temporal coherence, audio-reactive prompts | AI artists, music video producers |
| **RunwayML** | AI video toolkit | Gen-3 Alpha video generation, green screen, inpainting | @beeple_crap (compositing), commercial productions |
| **Notch** | Real-time GPU engine | Unreal-level quality, ray marching, volumetrics | Touring productions (Billie Eilish, The Weeknd) |
| **VDMX** | macOS VJ platform | Quartz Composer integration, ISF shaders, Syphon | Mac-based VJ setups |
| **Synesthesia** | Audio-reactive shader platform | Curated GLSL visuals, Spout/Syphon output, MIDI control | DJs, streamers, small venues |

### Key Artist Techniques

**@visualdon** — Known for deep-space cosmic visuals:
- Volumetric ray marching for nebula/cloud effects
- Signed Distance Functions (SDFs) for organic geometry
- Heavy post-processing: chromatic aberration, bloom, film grain
- Slow, hypnotic camera movements through 3D fractal landscapes

**@trentbrooks** — Interactive installations & generative systems:
- Particle systems with flocking/swarming behaviors (Boids algorithm)
- Perlin noise flow fields for organic motion
- Reaction-diffusion patterns for biological aesthetics
- Audio FFT mapped to physics simulation parameters

**@beeple_crap** — Daily renders, massive scale compositions:
- Multi-layer compositing with depth of field
- Volumetric lighting and god rays
- Repetitive geometric instancing
- Strong color grading with cinematic LUTs

## Most Hypnotic WebGL/Canvas Techniques (2025-2026)

### Tier 1: High Impact, Proven Hypnotic

1. **Fractal Noise Flow Fields**
   - Perlin/Simplex noise generates vector fields
   - Thousands of particles follow the flow
   - Audio reactivity modulates noise scale, speed, and turbulence
   - Creates organic, smoke-like motion that is deeply mesmerizing
   - Used by: Stripe homepage, countless creative portfolios

2. **Ray Marching / Signed Distance Functions**
   - Renders 3D scenes without polygons using distance estimation
   - Infinite zoom fractals (Mandelbulb, Menger sponge)
   - Organic blob morphing via smooth-min SDF unions
   - Requires GLSL shaders (WebGL2) for performance

3. **Feedback Loops / Frame Accumulation**
   - Read previous frame back, apply transform, blend with new
   - Creates infinite tunnel/zoom/spiral effects
   - Kaleidoscopic mirroring with rotation creates mandala emergence
   - Very GPU-efficient, extremely psychedelic results

4. **Chromatic Aberration + Bloom**
   - Split RGB channels with slight offset
   - Gaussian blur on bright areas for glow
   - Simulates optical lens effects
   - Instantly adds "premium" feel to any visualization

5. **Metaballs / Isosurface Rendering**
   - Multiple energy sources create blobby, organic shapes
   - Marching squares (2D) or cubes (3D) for smooth contours
   - Audio maps to blob positions, sizes, and threshold
   - Creates liquid, lava-lamp aesthetics

### Tier 2: Strong Supporting Effects

6. **Voronoi / Delaunay Tessellation**
   - Audio-reactive cell patterns that shift and morph
   - Color each cell by nearest frequency band
   - Creates crystalline, shattered-glass aesthetics

7. **Reaction-Diffusion (Gray-Scott)**
   - Two-chemical simulation creates coral/fingerprint patterns
   - Audio modulates feed/kill rates
   - Slow-evolving, organic, deeply fascinating

8. **Spirograph / Lissajous Curves**
   - Parametric curves with audio-modulated ratios
   - Layer multiple with different phase offsets
   - Creates intricate, ever-evolving geometric patterns

9. **Audio-Reactive Typography**
   - Text characters displaced by frequency data
   - Pixel-level manipulation of rendered text
   - Creates glitch aesthetics popular in club visuals

10. **Displacement Mapping**
    - Use frequency data as height map
    - Apply to mesh grids or images
    - Creates terrain-like undulating surfaces

## Recommended Enhancements for PSYCHEDELICA

### New Visualization Modes

1. **Flow Field** — Perlin noise particle flow with audio-reactive turbulence
2. **Fractal Zoom** — Infinite fractal zoom with beat-synced acceleration
3. **Metaball Blobs** — Organic metaball rendering with marching squares
4. **Sacred Geometry** — Flower of Life, Metatron's Cube, Sri Yantra with audio pulse
5. **Lissajous Orbits** — Parametric curves creating spirograph patterns

### Post-Processing Effects

- Chromatic aberration on beat hits
- Bloom/glow pass for bright elements
- Film grain overlay for analog texture
- Motion blur via frame blending
- Vignette darkening at edges

### Animation Improvements

- Use `performance.now()` delta time instead of fixed 0.016
- Ease beat energy with exponential decay curves
- Add sub-bass (20-60Hz) isolation for deeper body response
- Smooth frequency interpolation to prevent jitter
- Add momentum/inertia to visual parameters

### New Color Palettes

- **Infrared**: thermal camera aesthetics (black > blue > red > yellow > white)
- **Bioluminescence**: deep ocean blues with electric cyan/green accents
- **Sunset Acid**: orange > magenta > deep purple gradient
- **Monochrome**: white-on-black for maximum contrast and clean aesthetics

## Technical Notes

- Canvas 2D is sufficient for particle systems, flow fields, and 2D fractals
- WebGL2 would unlock ray marching and GPU-compute shaders (future upgrade path)
- For 60fps on mobile: keep particle count under 3000, use object pooling
- `OffscreenCanvas` + Web Workers can offload computation (Chrome/Edge only)
- `requestAnimationFrame` timestamp should drive animation, not fixed dt

## Sources & References

- Shadertoy.com — Largest GLSL shader community, thousands of audio-reactive examples
- The Book of Shaders (thebookofshaders.com) — Foundational shader education
- Processing Foundation — p5.js audio visualization examples
- Three.js examples gallery — WebGL visualization patterns
- Inigo Quilez (iquilezles.org) — SDF and ray marching reference
