(() => {
  'use strict';

  // ─── Color Palettes ───────────────────────────────────────────────
  const PALETTES = {
    neon: ['#ff00ff', '#00ffff', '#ff0080', '#80ff00', '#ffff00', '#ff4400'],
    vaporwave: ['#ff71ce', '#01cdfe', '#05ffa1', '#b967ff', '#fffb96', '#f6a4ec'],
    cosmic: ['#1a0533', '#4a0e78', '#7b2fbe', '#c084fc', '#e9d5ff', '#ffffff'],
    'deep-void': ['#0d001a', '#1a0033', '#33004d', '#660066', '#990099', '#cc00cc'],
    infrared: ['#000022', '#0000aa', '#cc0000', '#ff6600', '#ffee00', '#ffffff'],
    bioluminescence: ['#000d1a', '#002233', '#004466', '#00ccaa', '#00ffcc', '#66ffee'],
    'sunset-acid': ['#1a0011', '#660033', '#cc3366', '#ff6633', '#ff9900', '#ffcc00'],
    monochrome: ['#ffffff', '#cccccc', '#999999', '#666666', '#cccccc', '#ffffff'],
  };

  // ─── Perlin Noise (simplex-like 2D) ────────────────────────────────
  const PERM = new Uint8Array(512);
  const GRAD = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  (function initNoise() {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
  })();

  function noise2D(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const aa = PERM[PERM[X] + Y], ab = PERM[PERM[X] + Y + 1];
    const ba = PERM[PERM[X + 1] + Y], bb = PERM[PERM[X + 1] + Y + 1];
    const g = (h, dx, dy) => { const g2 = GRAD[h & 7]; return g2[0] * dx + g2[1] * dy; };
    const l1 = g(aa, xf, yf) * (1 - u) + g(ba, xf - 1, yf) * u;
    const l2 = g(ab, xf, yf - 1) * (1 - u) + g(bb, xf - 1, yf - 1) * u;
    return l1 * (1 - v) + l2 * v;
  }

  // ─── State ─────────────────────────────────────────────────────────
  const state = {
    mode: 'kaleidoscope',
    palette: 'neon',
    sensitivity: 1.5,
    audioCtx: null,
    analyser: null,
    source: null,
    freqData: null,
    timeData: null,
    isRecording: false,
    mediaRecorder: null,
    recordedChunks: [],
    bpm: 0,
    beatTimes: [],
    time: 0,
    dt: 0.016,
    lastFrame: 0,
    particles: [],
    lastBeat: 0,
    beatEnergy: 0,
    avgEnergy: 0,
    // Post-processing
    chromaticAberration: 0,
    bloomIntensity: 0,
    postFx: true,
    // Flow field
    flowParticles: [],
    flowFieldInited: false,
    // Metaballs
    metaballs: [],
    // Lissajous
    lissajousTrail: [],
    // Fractal zoom
    fractalZoom: 1,
    fractalOffset: { x: -0.745, y: 0.186 },
    // Smooth freq bands
    smoothBass: 0,
    smoothMid: 0,
    smoothHigh: 0,
    smoothSubBass: 0,
  };

  // ─── Canvas Setup ──────────────────────────────────────────────────
  const canvas = document.getElementById('viz-canvas');
  const ctx = canvas.getContext('2d');

  // Offscreen buffer for post-processing
  const offCanvas = document.createElement('canvas');
  const offCtx = offCanvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    offCanvas.width = canvas.width;
    offCanvas.height = canvas.height;
    state.flowFieldInited = false;
  }
  window.addEventListener('resize', resize);
  resize();

  // ─── Audio Setup ───────────────────────────────────────────────────
  function initAudio() {
    if (state.audioCtx) return;
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    state.analyser = state.audioCtx.createAnalyser();
    state.analyser.fftSize = 2048;
    state.analyser.smoothingTimeConstant = 0.82;
    state.freqData = new Uint8Array(state.analyser.frequencyBinCount);
    state.timeData = new Uint8Array(state.analyser.fftSize);
  }

  function connectSource(sourceNode) {
    if (state.source) {
      try { state.source.disconnect(); } catch (_) { /* noop */ }
    }
    state.source = sourceNode;
    sourceNode.connect(state.analyser);
    state.analyser.connect(state.audioCtx.destination);
  }

  // ─── File Upload & Playback ─────────────────────────────────────────
  const fileInput = document.getElementById('file-input');
  const btnUpload = document.getElementById('btn-upload');
  const nowPlaying = document.getElementById('now-playing');
  const trackName = document.getElementById('track-name');
  const playbackControls = document.getElementById('playback-controls');
  const btnPlay = document.getElementById('btn-play');
  const btnStop = document.getElementById('btn-stop');
  const playbackTime = document.getElementById('playback-time');

  let currentAudioBuffer = null;
  let isPlaying = false;
  let playbackOffset = 0;
  let playbackStartedAt = 0;

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function startPlayback(offset) {
    if (!currentAudioBuffer) return;
    initAudio();
    if (state.audioCtx.state === 'suspended') state.audioCtx.resume();

    // Stop existing source if any
    if (state.source) {
      try { state.source.disconnect(); state.source.stop(); } catch (_) { /* noop */ }
    }

    const source = state.audioCtx.createBufferSource();
    source.buffer = currentAudioBuffer;
    source.loop = true;
    connectSource(source);
    source.start(0, offset);

    playbackStartedAt = state.audioCtx.currentTime - offset;
    isPlaying = true;
    btnPlay.textContent = 'Pause';
    btnPlay.classList.add('playing');
  }

  function pausePlayback() {
    if (!isPlaying) return;
    playbackOffset = (state.audioCtx.currentTime - playbackStartedAt) % currentAudioBuffer.duration;
    if (state.source) {
      try { state.source.disconnect(); state.source.stop(); } catch (_) { /* noop */ }
      state.source = null;
    }
    isPlaying = false;
    btnPlay.textContent = 'Play';
    btnPlay.classList.remove('playing');
    updateBpmVisibility();
  }

  function stopPlayback() {
    pausePlayback();
    playbackOffset = 0;
  }

  function updatePlaybackTime() {
    if (!currentAudioBuffer) return;
    const dur = currentAudioBuffer.duration;
    let cur = 0;
    if (isPlaying && state.audioCtx) {
      cur = (state.audioCtx.currentTime - playbackStartedAt) % dur;
    } else {
      cur = playbackOffset;
    }
    playbackTime.textContent = formatTime(cur) + ' / ' + formatTime(dur);
  }

  btnUpload.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    initAudio();
    if (state.audioCtx.state === 'suspended') await state.audioCtx.resume();

    // Stop any existing playback
    stopPlayback();

    const arrayBuffer = await file.arrayBuffer();
    currentAudioBuffer = await state.audioCtx.decodeAudioData(arrayBuffer);

    trackName.textContent = file.name;
    nowPlaying.classList.remove('hidden');
    playbackControls.classList.remove('hidden');

    // Auto-play on upload
    startPlayback(0);
    updateBpmVisibility();
  });

  btnPlay.addEventListener('click', () => {
    if (!currentAudioBuffer) return;
    if (isPlaying) {
      pausePlayback();
    } else {
      startPlayback(playbackOffset);
    }
  });

  btnStop.addEventListener('click', () => {
    stopPlayback();
    updateBpmVisibility();
  });

  // ─── Mic Input ─────────────────────────────────────────────────────
  const btnMic = document.getElementById('btn-mic');
  let micStream = null;

  btnMic.addEventListener('click', async () => {
    initAudio();
    if (state.audioCtx.state === 'suspended') await state.audioCtx.resume();

    if (micStream) {
      micStream.getTracks().forEach(t => t.stop());
      micStream = null;
      btnMic.classList.remove('active');
      trackName.textContent = '';
      nowPlaying.classList.add('hidden');
      if (state.source) {
        try { state.source.disconnect(); } catch (_) { /* noop */ }
        state.source = null;
      }
      updateBpmVisibility();
      return;
    }

    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = state.audioCtx.createMediaStreamSource(micStream);
      if (state.source) {
        try { state.source.disconnect(); } catch (_) { /* noop */ }
      }
      state.source = source;
      source.connect(state.analyser);
      btnMic.classList.add('active');
      trackName.textContent = 'Microphone Input';
      nowPlaying.classList.remove('hidden');
      updateBpmVisibility();
    } catch (err) {
      console.error('Mic access denied:', err);
    }
  });

  // ─── UI Controls ───────────────────────────────────────────────────
  document.getElementById('viz-modes').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn) return;
    document.querySelectorAll('#viz-modes .btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.mode = btn.dataset.mode;
    state.particles = [];
    state.flowParticles = [];
    state.flowFieldInited = false;
    state.lissajousTrail = [];
    state.fractalZoom = 1;
  });

  document.getElementById('palettes').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-palette]');
    if (!btn) return;
    document.querySelectorAll('#palettes .btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.palette = btn.dataset.palette;
  });

  document.getElementById('sensitivity').addEventListener('input', (e) => {
    state.sensitivity = parseFloat(e.target.value);
  });

  document.getElementById('btn-toggle-ui').addEventListener('click', () => {
    document.getElementById('ui-overlay').classList.toggle('hidden');
  });

  // Post-FX toggle
  const btnPostFx = document.getElementById('btn-postfx');
  if (btnPostFx) {
    btnPostFx.addEventListener('click', () => {
      state.postFx = !state.postFx;
      btnPostFx.classList.toggle('active', state.postFx);
    });
  }

  // ─── Frequency Band Display ────────────────────────────────────────
  const bandBassBar = document.getElementById('band-bass');
  const bandMidBar = document.getElementById('band-mid');
  const bandHighBar = document.getElementById('band-high');
  const bandBassVal = document.getElementById('band-bass-val');
  const bandMidVal = document.getElementById('band-mid-val');
  const bandHighVal = document.getElementById('band-high-val');

  function updateBandDisplay() {
    const bass = Math.min(1, state.smoothBass);
    const mid = Math.min(1, state.smoothMid);
    const high = Math.min(1, state.smoothHigh);
    bandBassBar.style.width = (bass * 100) + '%';
    bandMidBar.style.width = (mid * 100) + '%';
    bandHighBar.style.width = (high * 100) + '%';
    bandBassVal.textContent = Math.round(bass * 100);
    bandMidVal.textContent = Math.round(mid * 100);
    bandHighVal.textContent = Math.round(high * 100);
  }

  // ─── Manual BPM Input ─────────────────────────────────────────────
  const bpmInput = document.getElementById('bpm-input');
  const bpmValue = document.getElementById('bpm-value');
  let manualBpm = 0;

  function updateBpmVisibility() {
    const hasSource = !!state.source;
    bpmInput.classList.toggle('hidden', hasSource);
    bpmValue.classList.toggle('hidden', !hasSource && manualBpm > 0);
  }

  bpmInput.addEventListener('input', () => {
    const val = parseInt(bpmInput.value, 10);
    if (val >= 40 && val <= 300) {
      manualBpm = val;
      state.bpm = val;
      bpmValue.textContent = val;
    } else if (!bpmInput.value) {
      manualBpm = 0;
      bpmValue.textContent = '--';
    }
    updateBpmVisibility();
  });

  // ─── Recording ─────────────────────────────────────────────────────
  const btnRecord = document.getElementById('btn-record');
  const recordStatus = document.getElementById('record-status');

  btnRecord.addEventListener('click', () => {
    if (state.isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  function startRecording() {
    const stream = canvas.captureStream(30);

    if (state.audioCtx && state.audioCtx.state === 'running') {
      const dest = state.audioCtx.createMediaStreamDestination();
      state.analyser.connect(dest);
      stream.addTrack(dest.stream.getAudioTracks()[0]);
    }

    state.mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 5000000,
    });
    state.recordedChunks = [];

    state.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) state.recordedChunks.push(e.data);
    };

    state.mediaRecorder.onstop = () => {
      const blob = new Blob(state.recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `psychedelica-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    };

    state.mediaRecorder.start(100);
    state.isRecording = true;
    btnRecord.classList.add('recording');
    btnRecord.textContent = 'Stop';
    recordStatus.textContent = 'REC';
  }

  function stopRecording() {
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    }
    state.isRecording = false;
    btnRecord.classList.remove('recording');
    btnRecord.textContent = 'Record';
    recordStatus.textContent = '';
  }

  // ─── BPM Detection ────────────────────────────────────────────────
  function detectBPM(freqData) {
    let energy = 0;
    const bassRange = Math.floor(freqData.length * 0.1);
    for (let i = 0; i < bassRange; i++) {
      energy += freqData[i];
    }
    energy /= bassRange;

    state.avgEnergy = state.avgEnergy * 0.95 + energy * 0.05;
    const threshold = state.avgEnergy * 1.4;

    const now = performance.now();
    if (energy > threshold && now - state.lastBeat > 200) {
      state.beatEnergy = 1.0;
      state.chromaticAberration = 1.0;
      state.bloomIntensity = 1.0;
      state.beatTimes.push(now);
      state.lastBeat = now;

      if (state.beatTimes.length > 20) state.beatTimes.shift();

      if (state.beatTimes.length > 3) {
        let totalInterval = 0;
        for (let i = 1; i < state.beatTimes.length; i++) {
          totalInterval += state.beatTimes[i] - state.beatTimes[i - 1];
        }
        const avgInterval = totalInterval / (state.beatTimes.length - 1);
        state.bpm = Math.round(60000 / avgInterval);
        if (state.bpm > 200) state.bpm = Math.round(state.bpm / 2);
        if (state.bpm < 60) state.bpm = Math.round(state.bpm * 2);
        document.getElementById('bpm-value').textContent = state.bpm;
      }
    }

    state.beatEnergy *= 0.92;
    state.chromaticAberration *= 0.88;
    state.bloomIntensity *= 0.90;
    return energy;
  }

  // ─── Helpers ───────────────────────────────────────────────────────
  function hexToRgb(hex) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
  }

  function getColor(index, alpha = 1) {
    const colors = PALETTES[state.palette];
    const c = colors[index % colors.length];
    if (alpha === 1) return c;
    const [r, g, b] = hexToRgb(c);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // Interpolate between two palette colors based on t (0-1)
  function getColorLerp(t, alpha = 1) {
    const colors = PALETTES[state.palette];
    const idx = t * (colors.length - 1);
    const i = Math.floor(idx);
    const f = idx - i;
    const c1 = hexToRgb(colors[Math.min(i, colors.length - 1)]);
    const c2 = hexToRgb(colors[Math.min(i + 1, colors.length - 1)]);
    const r = Math.round(c1[0] + (c2[0] - c1[0]) * f);
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * f);
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * f);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function getFreqNorm(i) {
    if (!state.freqData) return 0;
    return (state.freqData[Math.min(i, state.freqData.length - 1)] / 255) * state.sensitivity;
  }

  function getAvgFreq(start, end) {
    if (!state.freqData) return 0;
    let sum = 0;
    const s = Math.floor(start * state.freqData.length);
    const e = Math.floor(end * state.freqData.length);
    for (let i = s; i < e; i++) sum += state.freqData[i];
    return (sum / (e - s) / 255) * state.sensitivity;
  }

  // Smooth frequency bands with exponential smoothing
  function updateSmoothBands() {
    const lerp = 0.15;
    const target_subBass = getAvgFreq(0, 0.04);
    const target_bass = getAvgFreq(0, 0.1);
    const target_mid = getAvgFreq(0.1, 0.5);
    const target_high = getAvgFreq(0.5, 1.0);
    state.smoothSubBass += (target_subBass - state.smoothSubBass) * lerp;
    state.smoothBass += (target_bass - state.smoothBass) * lerp;
    state.smoothMid += (target_mid - state.smoothMid) * lerp;
    state.smoothHigh += (target_high - state.smoothHigh) * lerp;
  }

  // ─── Post-Processing Effects ───────────────────────────────────────

  function applyPostProcessing() {
    if (!state.postFx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Chromatic aberration on beats
    if (state.chromaticAberration > 0.05) {
      const offset = Math.round(state.chromaticAberration * 6);
      if (offset > 0) {
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;
        const copy = new Uint8ClampedArray(data);

        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            // Shift red channel left
            const rIdx = (y * w + Math.min(x + offset, w - 1)) * 4;
            // Shift blue channel right
            const bIdx = (y * w + Math.max(x - offset, 0)) * 4;
            data[idx] = copy[rIdx];       // R from shifted position
            data[idx + 2] = copy[bIdx + 2]; // B from shifted position
          }
        }
        ctx.putImageData(imgData, 0, 0);
      }
    }

    // Bloom / glow pass
    if (state.bloomIntensity > 0.05) {
      offCtx.clearRect(0, 0, w, h);
      offCtx.filter = `blur(${8 + state.bloomIntensity * 16}px) brightness(${1 + state.bloomIntensity * 0.5})`;
      offCtx.drawImage(canvas, 0, 0);
      offCtx.filter = 'none';
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = state.bloomIntensity * 0.35;
      ctx.drawImage(offCanvas, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // Vignette (always on, subtle)
    const vGrad = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.75);
    vGrad.addColorStop(0, 'transparent');
    vGrad.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, w, h);

    // Film grain (subtle)
    if (state.smoothBass > 0.3) {
      const grainAlpha = 0.02 + state.smoothBass * 0.03;
      ctx.save();
      ctx.globalAlpha = grainAlpha;
      const grainSize = 3;
      for (let i = 0; i < 800; i++) {
        const gx = Math.random() * w;
        const gy = Math.random() * h;
        const gv = Math.random() > 0.5 ? 255 : 0;
        ctx.fillStyle = `rgb(${gv},${gv},${gv})`;
        ctx.fillRect(gx, gy, grainSize, grainSize);
      }
      ctx.restore();
    }
  }

  // ─── Original Visualizer Modes ─────────────────────────────────────

  function drawKaleidoscope() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const segments = 12;
    const bass = state.smoothBass;
    const mid = state.smoothMid;
    const high = state.smoothHigh;
    const radius = Math.min(cx, cy) * 0.8;

    ctx.save();
    ctx.translate(cx, cy);

    for (let s = 0; s < segments; s++) {
      ctx.save();
      ctx.rotate((s / segments) * Math.PI * 2);
      if (s % 2 === 1) ctx.scale(1, -1);

      const count = 64;
      for (let i = 0; i < count; i++) {
        const freq = getFreqNorm(i * 4);
        const angle = (i / count) * (Math.PI / segments);
        const r = radius * (0.2 + freq * 0.8) * (1 + state.beatEnergy * 0.3);
        const x = Math.cos(angle + state.time * 0.5) * r;
        const y = Math.sin(angle + state.time * 0.5) * r;
        const size = 2 + freq * 8 + bass * 4;

        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = getColor(i % 6, 0.3 + freq * 0.7);
        ctx.fill();
      }

      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const freq = getFreqNorm(i * 2);
        const angle = (i / count) * (Math.PI / segments);
        const r = radius * 0.3 * (1 + mid * 0.5);
        const x = Math.cos(angle) * r * (1 + freq * 0.3);
        const y = Math.sin(angle) * r * (1 + freq * 0.3);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = getColor(s % 6, 0.4 + high * 0.6);
      ctx.lineWidth = 1 + bass * 3;
      ctx.stroke();

      ctx.restore();
    }

    ctx.restore();
  }

  function drawTunnel() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const maxR = Math.max(cx, cy) * 1.2;
    const rings = 30;
    const bass = state.smoothBass;

    ctx.save();
    ctx.translate(cx, cy);

    for (let r = rings; r >= 0; r--) {
      const freq = getFreqNorm(r * 8);
      const ringR = (r / rings) * maxR * (1 + state.beatEnergy * 0.2);
      const distort = freq * 30;
      const rot = state.time * (0.2 + r * 0.02) + freq * 0.5;
      const sides = 6 + Math.floor(bass * 4);

      ctx.beginPath();
      for (let i = 0; i <= sides; i++) {
        const angle = (i / sides) * Math.PI * 2 + rot;
        const wobble = ringR + Math.sin(angle * 3 + state.time * 2) * distort;
        const x = Math.cos(angle) * wobble;
        const y = Math.sin(angle) * wobble;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = getColor(r % 6, 0.15 + freq * 0.6);
      ctx.lineWidth = 1 + freq * 3;
      ctx.stroke();

      if (freq > 0.5) {
        ctx.fillStyle = getColor(r % 6, freq * 0.05);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function drawWaveformMorph() {
    if (!state.timeData) return;
    if (state.analyser) state.analyser.getByteTimeDomainData(state.timeData);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const bass = state.smoothBass;
    const mid = state.smoothMid;
    const layers = 6;

    for (let l = 0; l < layers; l++) {
      ctx.beginPath();
      const yOff = (l - layers / 2) * (40 + bass * 60);

      for (let i = 0; i < state.timeData.length; i += 2) {
        const x = (i / state.timeData.length) * canvas.width;
        const sample = (state.timeData[i] / 128 - 1) * state.sensitivity;
        const freq = getFreqNorm(Math.floor(i / state.timeData.length * 256));
        const morph = Math.sin(state.time * 2 + l * 0.5) * 50 * mid;
        const y = cy + yOff + sample * (100 + freq * 200) + morph;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }

      ctx.strokeStyle = getColor(l, 0.4 + mid * 0.6);
      ctx.lineWidth = 2 + state.beatEnergy * 4;
      ctx.shadowColor = getColor(l);
      ctx.shadowBlur = 10 + bass * 30;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  function drawParticleBurst() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const bass = state.smoothBass;
    const mid = state.smoothMid;

    if (state.beatEnergy > 0.8) {
      const count = 20 + Math.floor(bass * 40);
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 6 * state.sensitivity;
        state.particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: 0.005 + Math.random() * 0.015,
          size: 2 + Math.random() * 4,
          color: Math.floor(Math.random() * 6),
          trail: [],
        });
      }
    }

    state.particles = state.particles.filter(p => p.life > 0);
    if (state.particles.length > 2000) state.particles.splice(0, state.particles.length - 2000);

    for (const p of state.particles) {
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 8) p.trail.shift();

      p.x += p.vx * (1 + mid);
      p.y += p.vy * (1 + mid);
      p.vx *= 0.99;
      p.vy *= 0.99;
      p.life -= p.decay;

      const dx = cx - p.x;
      const dy = cy - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        p.vx += (dx / dist) * bass * 0.3;
        p.vy += (dy / dist) * bass * 0.3;
      }

      if (p.trail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(p.trail[0].x, p.trail[0].y);
        for (const t of p.trail) ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = getColor(p.color, p.life * 0.3);
        ctx.lineWidth = p.size * 0.5;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fillStyle = getColor(p.color, p.life);
      ctx.fill();
    }

    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 100 + bass * 200);
    gradient.addColorStop(0, getColor(0, 0.1 + state.beatEnergy * 0.3));
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawMandala() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const bass = state.smoothBass;
    const mid = state.smoothMid;
    const high = state.smoothHigh;
    const maxR = Math.min(cx, cy) * 0.85;
    const layers = 8;

    ctx.save();
    ctx.translate(cx, cy);

    for (let l = 0; l < layers; l++) {
      const layerR = maxR * ((l + 1) / layers) * (1 + state.beatEnergy * 0.15);
      const points = 60;
      const petals = 6 + l * 2;
      const rot = state.time * (0.1 + l * 0.05) * (l % 2 === 0 ? 1 : -1);

      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2 + rot;
        const freqIdx = Math.floor((i / points) * 128);
        const freq = getFreqNorm(freqIdx);
        const petalMod = Math.sin(angle * petals) * 0.3 * (1 + freq);
        const r = layerR * (0.5 + petalMod + freq * 0.3);
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = getColor(l % 6, 0.3 + mid * 0.5);
      ctx.lineWidth = 1 + bass * 2;
      ctx.stroke();

      for (let p = 0; p < petals; p++) {
        const angle = (p / petals) * Math.PI * 2 + rot;
        const freq = getFreqNorm(p * 16);
        const r = layerR * (0.8 + freq * 0.2);
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        const dotSize = 2 + freq * 6 + high * 3;

        ctx.beginPath();
        ctx.arc(x, y, dotSize, 0, Math.PI * 2);
        ctx.fillStyle = getColor((l + p) % 6, 0.5 + freq * 0.5);
        ctx.fill();
      }
    }

    const centerR = 20 + bass * 40 + state.beatEnergy * 20;
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, centerR);
    gradient.addColorStop(0, getColor(0, 0.8));
    gradient.addColorStop(0.5, getColor(2, 0.4));
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, centerR, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ─── NEW: Flow Field Mode ──────────────────────────────────────────
  // Perlin noise flow field with thousands of trailing particles

  function initFlowParticles() {
    state.flowParticles = [];
    const count = 1500;
    for (let i = 0; i < count; i++) {
      state.flowParticles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        px: 0, py: 0,
        speed: 0.5 + Math.random() * 1.5,
        color: Math.floor(Math.random() * 6),
        life: Math.random(),
      });
    }
    state.flowFieldInited = true;
  }

  function drawFlowField() {
    if (!state.flowFieldInited) initFlowParticles();

    const w = canvas.width;
    const h = canvas.height;
    const bass = state.smoothBass;
    const mid = state.smoothMid;
    const high = state.smoothHigh;

    // Noise parameters modulated by audio
    const noiseScale = 0.003 + bass * 0.004;
    const noiseSpeed = state.time * (0.3 + mid * 0.5);
    const turbulence = 1 + state.beatEnergy * 3;
    const particleSpeed = (1.5 + bass * 3 + state.beatEnergy * 4);

    for (const p of state.flowParticles) {
      p.px = p.x;
      p.py = p.y;

      // Sample noise field for flow direction
      const nx = p.x * noiseScale;
      const ny = p.y * noiseScale;
      const angle = noise2D(nx + noiseSpeed, ny + noiseSpeed * 0.7) * Math.PI * 2 * turbulence;

      // Move particle along flow
      p.x += Math.cos(angle) * p.speed * particleSpeed;
      p.y += Math.sin(angle) * p.speed * particleSpeed;

      // Wrap around edges
      if (p.x < 0) p.x = w;
      if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h;
      if (p.y > h) p.y = 0;

      // Skip drawing if wrapped
      const dx = p.x - p.px;
      const dy = p.y - p.py;
      if (dx * dx + dy * dy > (w * 0.25) * (w * 0.25)) continue;

      // Draw line from previous to current position
      const freqIdx = Math.floor((p.x / w) * 128);
      const freq = getFreqNorm(freqIdx);
      const alpha = 0.15 + freq * 0.5 + high * 0.2;
      const lineW = 0.5 + freq * 2.5 + state.beatEnergy * 1.5;

      ctx.beginPath();
      ctx.moveTo(p.px, p.py);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = getColorLerp(
        (noise2D(p.x * 0.001, p.y * 0.001) + 1) * 0.5,
        alpha
      );
      ctx.lineWidth = lineW;
      ctx.stroke();
    }

    // Respawn dead particles on beat
    if (state.beatEnergy > 0.7) {
      const respawn = Math.floor(state.flowParticles.length * 0.1);
      for (let i = 0; i < respawn; i++) {
        const idx = Math.floor(Math.random() * state.flowParticles.length);
        state.flowParticles[idx].x = Math.random() * w;
        state.flowParticles[idx].y = Math.random() * h;
        state.flowParticles[idx].px = state.flowParticles[idx].x;
        state.flowParticles[idx].py = state.flowParticles[idx].y;
      }
    }
  }

  // ─── NEW: Fractal Zoom (Mandelbrot) ────────────────────────────────
  // Beat-synced zoom into the Mandelbrot set with audio-reactive coloring

  function drawFractalZoom() {
    const w = canvas.width;
    const h = canvas.height;
    const bass = state.smoothBass;
    const mid = state.smoothMid;

    // Zoom in on beat, slowly zoom out otherwise
    state.fractalZoom *= 1 + state.beatEnergy * 0.08;
    if (state.fractalZoom > 1e8) state.fractalZoom = 1;

    const zoom = state.fractalZoom;
    const ox = state.fractalOffset.x;
    const oy = state.fractalOffset.y;

    // Render at reduced resolution for performance
    const scale = 4;
    const sw = Math.floor(w / scale);
    const sh = Math.floor(h / scale);
    const imgData = ctx.createImageData(sw, sh);
    const data = imgData.data;

    const maxIter = 40 + Math.floor(mid * 30);
    const aspect = sw / sh;

    for (let py = 0; py < sh; py++) {
      for (let px = 0; px < sw; px++) {
        const x0 = ox + (px / sw - 0.5) * (3 / zoom) * aspect;
        const y0 = oy + (py / sh - 0.5) * (3 / zoom);

        let x = 0, y = 0, iter = 0;
        while (x * x + y * y <= 4 && iter < maxIter) {
          const xt = x * x - y * y + x0;
          y = 2 * x * y + y0;
          x = xt;
          iter++;
        }

        const idx = (py * sw + px) * 4;
        if (iter === maxIter) {
          data[idx] = 10;
          data[idx + 1] = 0;
          data[idx + 2] = 26;
        } else {
          // Smooth coloring with audio modulation
          const t = (iter + 1 - Math.log2(Math.log2(x * x + y * y))) / maxIter;
          const colorShift = state.time * 0.1 + bass * 0.5;
          const colors = PALETTES[state.palette];
          const ci = ((t * 4 + colorShift) % 1) * (colors.length - 1);
          const c1 = hexToRgb(colors[Math.floor(ci) % colors.length]);
          const c2 = hexToRgb(colors[(Math.floor(ci) + 1) % colors.length]);
          const f = ci - Math.floor(ci);
          data[idx] = Math.round(c1[0] + (c2[0] - c1[0]) * f);
          data[idx + 1] = Math.round(c1[1] + (c2[1] - c1[1]) * f);
          data[idx + 2] = Math.round(c1[2] + (c2[2] - c1[2]) * f);
        }
        data[idx + 3] = 255;
      }
    }

    // Draw scaled up
    offCtx.putImageData(imgData, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(offCanvas, 0, 0, sw, sh, 0, 0, w, h);
  }

  // ─── NEW: Metaball Blobs ───────────────────────────────────────────
  // Organic metaball rendering using marching squares threshold

  function drawMetaballs() {
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const bass = state.smoothBass;
    const mid = state.smoothMid;
    const high = state.smoothHigh;

    // Update metaball positions (audio-reactive orbits)
    const numBalls = 8;
    if (state.metaballs.length !== numBalls) {
      state.metaballs = [];
      for (let i = 0; i < numBalls; i++) {
        state.metaballs.push({
          x: cx, y: cy,
          radius: 60 + Math.random() * 80,
          phase: Math.random() * Math.PI * 2,
          speed: 0.3 + Math.random() * 0.7,
          orbitR: 100 + Math.random() * 200,
        });
      }
    }

    for (let i = 0; i < state.metaballs.length; i++) {
      const mb = state.metaballs[i];
      const freq = getFreqNorm(i * 32);
      const t = state.time * mb.speed + mb.phase;
      mb.x = cx + Math.cos(t) * mb.orbitR * (1 + bass * 0.5);
      mb.y = cy + Math.sin(t * 1.3) * mb.orbitR * (0.8 + mid * 0.4);
      mb.radius = 60 + freq * 100 + state.beatEnergy * 40;
    }

    // Render metaballs at reduced resolution
    const scale = 4;
    const sw = Math.floor(w / scale);
    const sh = Math.floor(h / scale);
    const imgData = ctx.createImageData(sw, sh);
    const data = imgData.data;
    const threshold = 1.0;

    for (let py = 0; py < sh; py++) {
      for (let px = 0; px < sw; px++) {
        const wx = px * scale;
        const wy = py * scale;

        // Sum metaball field
        let field = 0;
        let dominantBall = 0;
        let maxContrib = 0;
        for (let i = 0; i < state.metaballs.length; i++) {
          const mb = state.metaballs[i];
          const dx = wx - mb.x;
          const dy = wy - mb.y;
          const distSq = dx * dx + dy * dy;
          const contrib = (mb.radius * mb.radius) / (distSq + 1);
          field += contrib;
          if (contrib > maxContrib) {
            maxContrib = contrib;
            dominantBall = i;
          }
        }

        const idx = (py * sw + px) * 4;
        if (field > threshold) {
          const intensity = Math.min(1, (field - threshold) * 0.5);
          const t = (dominantBall / numBalls + state.time * 0.05) % 1;
          const colors = PALETTES[state.palette];
          const ci = t * (colors.length - 1);
          const c1 = hexToRgb(colors[Math.floor(ci) % colors.length]);
          const c2 = hexToRgb(colors[(Math.floor(ci) + 1) % colors.length]);
          const f = ci - Math.floor(ci);
          data[idx] = Math.round((c1[0] + (c2[0] - c1[0]) * f) * intensity);
          data[idx + 1] = Math.round((c1[1] + (c2[1] - c1[1]) * f) * intensity);
          data[idx + 2] = Math.round((c1[2] + (c2[2] - c1[2]) * f) * intensity);
          data[idx + 3] = Math.round(255 * Math.min(1, intensity));

          // Bright edge at threshold boundary
          if (field < threshold + 0.3) {
            data[idx] = Math.min(255, data[idx] + 120);
            data[idx + 1] = Math.min(255, data[idx + 1] + 120);
            data[idx + 2] = Math.min(255, data[idx + 2] + 120);
            data[idx + 3] = 255;
          }
        } else {
          data[idx] = 10;
          data[idx + 1] = 0;
          data[idx + 2] = 26;
          data[idx + 3] = 255;
        }
      }
    }

    offCtx.putImageData(imgData, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(offCanvas, 0, 0, sw, sh, 0, 0, w, h);

    // Glow overlay for each metaball
    for (let i = 0; i < state.metaballs.length; i++) {
      const mb = state.metaballs[i];
      const freq = getFreqNorm(i * 32);
      const glowR = mb.radius * 1.5;
      const grad = ctx.createRadialGradient(mb.x, mb.y, 0, mb.x, mb.y, glowR);
      grad.addColorStop(0, getColor(i, 0.08 + freq * 0.12));
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(mb.x - glowR, mb.y - glowR, glowR * 2, glowR * 2);
    }
  }

  // ─── NEW: Sacred Geometry ──────────────────────────────────────────
  // Flower of Life, Metatron's Cube with audio-reactive pulsing

  function drawSacredGeometry() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const bass = state.smoothBass;
    const mid = state.smoothMid;
    const high = state.smoothHigh;
    const baseR = Math.min(cx, cy) * 0.12 * (1 + bass * 0.3);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(state.time * 0.05);

    // Flower of Life: concentric rings of circles
    const rings = 3;
    const positions = [{ x: 0, y: 0 }];

    for (let ring = 1; ring <= rings; ring++) {
      const count = ring * 6;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const r = baseR * ring * 2;
        positions.push({
          x: Math.cos(angle) * r,
          y: Math.sin(angle) * r,
        });
      }
    }

    // Draw circles with audio reactivity
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const freq = getFreqNorm(i * 4);
      const breathe = Math.sin(state.time * 1.5 + i * 0.2) * 0.1;
      const r = baseR * (1 + breathe + freq * 0.3 + state.beatEnergy * 0.2);

      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = getColor(i % 6, 0.15 + freq * 0.5 + high * 0.2);
      ctx.lineWidth = 0.8 + freq * 2 + state.beatEnergy * 1.5;
      ctx.stroke();

      // Inner glow on high energy
      if (freq > 0.4) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = getColor(i % 6, freq * 0.2);
        ctx.fill();
      }
    }

    // Metatron's Cube: connect centers of outer ring circles
    ctx.globalAlpha = 0.2 + mid * 0.4;
    const outerPositions = positions.slice(1, 7); // First ring (6 points)
    // Connect all pairs
    for (let i = 0; i < outerPositions.length; i++) {
      for (let j = i + 1; j < outerPositions.length; j++) {
        const freq = getFreqNorm((i + j) * 16);
        ctx.beginPath();
        ctx.moveTo(outerPositions[i].x, outerPositions[i].y);
        ctx.lineTo(outerPositions[j].x, outerPositions[j].y);
        ctx.strokeStyle = getColor((i + j) % 6, 0.2 + freq * 0.5);
        ctx.lineWidth = 0.5 + freq * 1.5;
        ctx.stroke();
      }
      // Connect to center
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(outerPositions[i].x, outerPositions[i].y);
      ctx.strokeStyle = getColor(i % 6, 0.15 + state.beatEnergy * 0.4);
      ctx.lineWidth = 0.5 + state.beatEnergy * 2;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Central pulsing eye
    const eyeR = baseR * (0.5 + state.beatEnergy * 0.8 + bass * 0.4);
    const eyeGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, eyeR);
    eyeGrad.addColorStop(0, getColor(0, 0.9));
    eyeGrad.addColorStop(0.4, getColor(2, 0.5));
    eyeGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = eyeGrad;
    ctx.beginPath();
    ctx.arc(0, 0, eyeR, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ─── NEW: Lissajous Orbits ─────────────────────────────────────────
  // Parametric spirograph curves with audio-modulated ratios

  function drawLissajous() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const bass = state.smoothBass;
    const mid = state.smoothMid;
    const high = state.smoothHigh;
    const maxR = Math.min(cx, cy) * 0.75;

    const curves = 5;
    const pointsPerCurve = 600;

    ctx.save();
    ctx.translate(cx, cy);

    for (let c = 0; c < curves; c++) {
      const freq = getFreqNorm(c * 40);
      // Audio-reactive frequency ratios
      const a = 3 + c + Math.floor(bass * 3);
      const b = 2 + c + Math.floor(mid * 2);
      const delta = state.time * (0.3 + c * 0.15) + freq * Math.PI;
      const amplitude = maxR * (0.3 + c * 0.15) * (1 + state.beatEnergy * 0.3);

      ctx.beginPath();
      for (let i = 0; i <= pointsPerCurve; i++) {
        const t = (i / pointsPerCurve) * Math.PI * 2;
        const freqMod = getFreqNorm(Math.floor((i / pointsPerCurve) * 128));
        const x = Math.sin(a * t + delta) * amplitude * (1 + freqMod * 0.2);
        const y = Math.sin(b * t) * amplitude * (1 + freqMod * 0.15);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }

      ctx.strokeStyle = getColor(c, 0.25 + freq * 0.5 + high * 0.2);
      ctx.lineWidth = 1 + freq * 2 + state.beatEnergy * 1.5;
      ctx.shadowColor = getColor(c);
      ctx.shadowBlur = 5 + bass * 15;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Persistent trail points at curve intersections
    const trailMax = 200;
    if (state.beatEnergy > 0.5) {
      const a = 3 + Math.floor(bass * 3);
      const b = 2 + Math.floor(mid * 2);
      const delta = state.time * 0.3;
      const t = state.time * 2;
      state.lissajousTrail.push({
        x: Math.sin(a * t + delta) * maxR * 0.5,
        y: Math.sin(b * t) * maxR * 0.5,
        life: 1,
        color: Math.floor(Math.random() * 6),
      });
    }

    state.lissajousTrail = state.lissajousTrail.filter(p => p.life > 0);
    if (state.lissajousTrail.length > trailMax) state.lissajousTrail.splice(0, state.lissajousTrail.length - trailMax);

    for (const p of state.lissajousTrail) {
      p.life -= 0.008;
      const size = 2 + p.life * 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fillStyle = getColor(p.color, p.life * 0.6);
      ctx.fill();
    }

    ctx.restore();
  }

  // ─── Render Loop ───────────────────────────────────────────────────
  const vizRenderers = {
    kaleidoscope: drawKaleidoscope,
    tunnel: drawTunnel,
    'waveform-morph': drawWaveformMorph,
    'particle-burst': drawParticleBurst,
    mandala: drawMandala,
    'flow-field': drawFlowField,
    'fractal-zoom': drawFractalZoom,
    metaballs: drawMetaballs,
    'sacred-geometry': drawSacredGeometry,
    lissajous: drawLissajous,
  };

  function mainLoop(timestamp) {
    requestAnimationFrame(mainLoop);

    // Delta time for smooth animation regardless of frame rate
    if (state.lastFrame === 0) state.lastFrame = timestamp;
    state.dt = Math.min((timestamp - state.lastFrame) / 1000, 0.05); // cap at 50ms
    state.lastFrame = timestamp;
    state.time += state.dt;

    generateDemoData();

    if (state.analyser) {
      state.analyser.getByteFrequencyData(state.freqData);
      state.analyser.getByteTimeDomainData(state.timeData);
      detectBPM(state.freqData);
    }

    updateSmoothBands();
    updateBandDisplay();
    updatePlaybackTime();

    // Fade previous frame (mode-specific fade rates)
    const fadeRates = {
      'particle-burst': 'rgba(10,0,26,0.12)',
      'flow-field': 'rgba(10,0,26,0.04)',
      lissajous: 'rgba(10,0,26,0.08)',
      'sacred-geometry': 'rgba(10,0,26,0.18)',
      'fractal-zoom': 'rgba(10,0,26,1)',
      metaballs: 'rgba(10,0,26,1)',
    };
    ctx.fillStyle = fadeRates[state.mode] || 'rgba(10,0,26,0.2)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw current mode
    const renderer = vizRenderers[state.mode];
    if (renderer) renderer();

    // Apply post-processing
    applyPostProcessing();
  }

  // ─── Demo Mode (no audio) ─────────────────────────────────────────
  function generateDemoData() {
    if (state.source) return;
    if (!state.freqData) {
      state.freqData = new Uint8Array(1024);
      state.timeData = new Uint8Array(2048);
    }
    for (let i = 0; i < state.freqData.length; i++) {
      const base = Math.sin(state.time * 2 + i * 0.05) * 40 + 60;
      const pulse = Math.sin(state.time * 4) * 30;
      const wobble = Math.sin(state.time * 0.7 + i * 0.02) * 20;
      state.freqData[i] = Math.max(0, Math.min(255, base + pulse + wobble + Math.random() * 15));
    }
    for (let i = 0; i < state.timeData.length; i++) {
      state.timeData[i] = 128 + Math.sin(state.time * 6 + i * 0.02) * 40;
    }
    // Beat generation: use manual BPM if set, otherwise fake beats
    const now = performance.now();
    if (manualBpm > 0) {
      const beatInterval = 60000 / manualBpm;
      if (now - state.lastBeat > beatInterval) {
        state.beatEnergy = 1.0;
        state.chromaticAberration = 1.0;
        state.bloomIntensity = 1.0;
        state.lastBeat = now;
      }
    } else {
      const beatPhase = Math.sin(state.time * 3);
      if (beatPhase > 0.95 && now - state.lastBeat > 300) {
        state.beatEnergy = 1.0;
        state.chromaticAberration = 1.0;
        state.bloomIntensity = 1.0;
        state.lastBeat = now;
      }
    }
    state.beatEnergy *= 0.92;
    state.chromaticAberration *= 0.88;
    state.bloomIntensity *= 0.90;
  }

  // ─── Batch Render System ──────────────────────────────────────────

  const PRESETS = {
    psytrance: { mode: 'kaleidoscope', palette: 'cosmic', label: 'Psytrance Pack' },
    'deep-house': { mode: 'flow-field', palette: 'vaporwave', label: 'Deep House Pack' },
    techno: { mode: 'tunnel', palette: 'infrared', label: 'Techno Pack' },
  };

  const VIZ_MODES = [
    'kaleidoscope', 'tunnel', 'waveform-morph', 'particle-burst',
    'mandala', 'flow-field', 'fractal-zoom', 'metaballs',
    'sacred-geometry', 'lissajous',
  ];

  const PALETTE_NAMES = Object.keys(PALETTES);

  const batchState = {
    queue: [],       // { id, file, mode, palette, status: 'pending'|'rendering'|'done'|'error' }
    isRendering: false,
    watermark: false,
    currentIndex: -1,
    nextId: 1,
  };

  // DOM refs
  const batchModal = document.getElementById('batch-modal');
  const batchQueue = document.getElementById('batch-queue');
  const batchFileInput = document.getElementById('batch-file-input');
  const btnRenderAll = document.getElementById('btn-render-all');
  const batchProgress = document.getElementById('batch-progress');
  const batchProgressBar = document.getElementById('batch-progress-bar');
  const batchProgressLabel = document.getElementById('batch-progress-label');
  const batchProgressCount = document.getElementById('batch-progress-count');
  const batchCurrentItem = document.getElementById('batch-current-item');
  const btnWatermark = document.getElementById('btn-watermark');

  // Open / Close batch modal
  document.getElementById('btn-batch').addEventListener('click', () => {
    batchModal.classList.remove('hidden');
  });

  document.getElementById('btn-close-batch').addEventListener('click', () => {
    if (!batchState.isRendering) {
      batchModal.classList.add('hidden');
    }
  });

  // Watermark toggle
  btnWatermark.addEventListener('click', () => {
    batchState.watermark = !batchState.watermark;
    btnWatermark.textContent = batchState.watermark ? 'On' : 'Off';
    btnWatermark.classList.toggle('active', batchState.watermark);
  });

  // Add files
  document.getElementById('btn-batch-add').addEventListener('click', () => {
    batchFileInput.click();
  });

  batchFileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      addBatchItem(file, state.mode, state.palette);
    }
    batchFileInput.value = '';
    updateBatchUI();
  });

  // Preset packs
  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const presetKey = btn.dataset.preset;
      const preset = PRESETS[presetKey];
      if (!preset) return;

      // Apply preset settings to all items that don't have files yet,
      // or prompt to add files with preset
      document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update all pending items to use the preset
      for (const item of batchState.queue) {
        if (item.status === 'pending') {
          item.mode = preset.mode;
          item.palette = preset.palette;
        }
      }

      // If queue is empty, open file picker (preset will apply to new files)
      if (batchState.queue.length === 0) {
        batchState._pendingPreset = preset;
        batchFileInput.click();
      }

      updateBatchUI();
    });
  });

  // Override file input handler to use pending preset
  const origFileHandler = batchFileInput.onchange;
  batchFileInput.addEventListener('change', () => {
    if (batchState._pendingPreset) {
      const preset = batchState._pendingPreset;
      // Re-apply preset to newly added items (they were just added by the other handler)
      for (const item of batchState.queue) {
        if (item.status === 'pending') {
          item.mode = preset.mode;
          item.palette = preset.palette;
        }
      }
      batchState._pendingPreset = null;
      updateBatchUI();
    }
  });

  // Clear queue
  document.getElementById('btn-clear-batch').addEventListener('click', () => {
    if (batchState.isRendering) return;
    batchState.queue = [];
    batchState.nextId = 1;
    document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
    updateBatchUI();
  });

  function addBatchItem(file, mode, palette) {
    batchState.queue.push({
      id: batchState.nextId++,
      file,
      mode,
      palette,
      status: 'pending',
    });
  }

  function updateBatchUI() {
    batchQueue.innerHTML = '';
    for (const item of batchState.queue) {
      const el = document.createElement('div');
      el.className = 'queue-item';
      if (item.status === 'rendering') el.classList.add('active');
      if (item.status === 'done') el.classList.add('completed');

      const nameSpan = document.createElement('span');
      nameSpan.className = 'qi-name';
      nameSpan.textContent = item.file.name;

      const modeSelect = document.createElement('select');
      modeSelect.disabled = item.status !== 'pending';
      for (const m of VIZ_MODES) {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m.replace(/-/g, ' ');
        if (m === item.mode) opt.selected = true;
        modeSelect.appendChild(opt);
      }
      modeSelect.addEventListener('change', () => { item.mode = modeSelect.value; });

      const paletteSelect = document.createElement('select');
      paletteSelect.disabled = item.status !== 'pending';
      for (const p of PALETTE_NAMES) {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p.replace(/-/g, ' ');
        if (p === item.palette) opt.selected = true;
        paletteSelect.appendChild(opt);
      }
      paletteSelect.addEventListener('change', () => { item.palette = paletteSelect.value; });

      const statusSpan = document.createElement('span');
      statusSpan.className = 'qi-status ' + item.status;
      statusSpan.textContent = item.status === 'pending' ? 'PENDING' :
        item.status === 'rendering' ? 'RENDERING' :
        item.status === 'done' ? 'DONE' : 'ERROR';

      const removeBtn = document.createElement('button');
      removeBtn.className = 'qi-remove';
      removeBtn.textContent = '\u00d7';
      removeBtn.disabled = item.status === 'rendering';
      removeBtn.addEventListener('click', () => {
        if (item.status === 'rendering') return;
        batchState.queue = batchState.queue.filter(q => q.id !== item.id);
        updateBatchUI();
      });

      el.appendChild(nameSpan);
      el.appendChild(modeSelect);
      el.appendChild(paletteSelect);
      el.appendChild(statusSpan);
      el.appendChild(removeBtn);
      batchQueue.appendChild(el);
    }

    const hasPending = batchState.queue.some(q => q.status === 'pending');
    btnRenderAll.disabled = !hasPending || batchState.isRendering;
  }

  // ─── Watermark Drawing ──────────────────────────────────────────

  function drawWatermark(targetCtx, w, h) {
    targetCtx.save();
    targetCtx.font = '14px "Courier New", monospace';
    targetCtx.letterSpacing = '4px';
    const text = 'PSYCHEDELICA';
    const metrics = targetCtx.measureText(text);
    const textW = metrics.width + 48; // extra for letter-spacing
    const textH = 20;
    const padding = 12;
    const x = w - textW - padding;
    const y = h - textH - padding;

    // Background
    targetCtx.fillStyle = 'rgba(10,0,26,0.6)';
    targetCtx.fillRect(x - 8, y - 14, textW + 16, textH + 12);

    // Border
    targetCtx.strokeStyle = 'rgba(155,89,182,0.4)';
    targetCtx.lineWidth = 1;
    targetCtx.strokeRect(x - 8, y - 14, textW + 16, textH + 12);

    // Text
    targetCtx.fillStyle = 'rgba(155,89,182,0.7)';
    targetCtx.textBaseline = 'top';
    targetCtx.fillText(text, x, y - 8);

    targetCtx.restore();
  }

  // ─── Batch Render Engine ──────────────────────────────────────────

  btnRenderAll.addEventListener('click', () => {
    if (batchState.isRendering) return;
    startBatchRender();
  });

  async function startBatchRender() {
    batchState.isRendering = true;
    batchProgress.classList.remove('hidden');
    btnRenderAll.disabled = true;

    const pending = batchState.queue.filter(q => q.status === 'pending');
    const total = pending.length;

    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      batchState.currentIndex = i;
      item.status = 'rendering';
      batchProgressLabel.textContent = 'Rendering...';
      batchProgressCount.textContent = `${i + 1} / ${total}`;
      batchCurrentItem.textContent = item.file.name + ' [' + item.mode + ' + ' + item.palette + ']';
      batchProgressBar.style.width = ((i / total) * 100) + '%';
      updateBatchUI();

      try {
        await renderSingleItem(item);
        item.status = 'done';
      } catch (err) {
        console.error('Batch render error:', err);
        item.status = 'error';
      }

      batchProgressBar.style.width = (((i + 1) / total) * 100) + '%';
      updateBatchUI();
    }

    batchState.isRendering = false;
    batchState.currentIndex = -1;
    batchProgressLabel.textContent = 'Complete!';
    batchCurrentItem.textContent = '';
    btnRenderAll.disabled = !batchState.queue.some(q => q.status === 'pending');
  }

  async function renderSingleItem(item) {
    // Decode the audio file
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await item.file.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    // Create an offscreen canvas for rendering
    const renderW = 1280;
    const renderH = 720;
    const renderCanvas = document.createElement('canvas');
    renderCanvas.width = renderW;
    renderCanvas.height = renderH;
    const renderCtx = renderCanvas.getContext('2d');

    // Offscreen for post-fx
    const renderOffCanvas = document.createElement('canvas');
    renderOffCanvas.width = renderW;
    renderOffCanvas.height = renderH;
    const renderOffCtx = renderOffCanvas.getContext('2d');

    // Set up MediaRecorder on the render canvas
    const stream = renderCanvas.captureStream(30);
    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 5000000,
    });
    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const done = new Promise((resolve, reject) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeName = item.file.name.replace(/\.[^.]+$/, '');
        a.download = `psychedelica-${safeName}-${item.mode}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        resolve();
      };
      recorder.onerror = reject;
    });

    recorder.start(100);

    // Offline audio analysis: extract frequency data per frame
    const fps = 30;
    const duration = audioBuffer.duration;
    const totalFrames = Math.ceil(duration * fps);
    const fftSize = 2048;
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    // Create a temporary render state
    const rs = {
      mode: item.mode,
      palette: item.palette,
      sensitivity: 1.5,
      freqData: new Uint8Array(fftSize / 2),
      timeData: new Uint8Array(fftSize),
      time: 0,
      dt: 1 / fps,
      beatEnergy: 0,
      chromaticAberration: 0,
      bloomIntensity: 0,
      smoothBass: 0,
      smoothMid: 0,
      smoothHigh: 0,
      smoothSubBass: 0,
      lastBeat: 0,
      avgEnergy: 0,
      beatTimes: [],
      particles: [],
      flowParticles: [],
      flowFieldInited: false,
      metaballs: [],
      lissajousTrail: [],
      fractalZoom: 1,
      fractalOffset: { x: -0.745, y: 0.186 },
      postFx: true,
    };

    // Simple FFT approximation from raw samples
    function analyzeFrame(frameIdx) {
      const samplesPerFrame = Math.floor(sampleRate / fps);
      const startSample = frameIdx * samplesPerFrame;
      const endSample = Math.min(startSample + fftSize, channelData.length);

      // Fill time data
      for (let i = 0; i < fftSize; i++) {
        const si = startSample + i;
        if (si < channelData.length) {
          rs.timeData[i] = Math.round((channelData[si] + 1) * 128);
        } else {
          rs.timeData[i] = 128;
        }
      }

      // Simple spectral approximation using windowed energy bands
      const bucketSize = Math.floor(fftSize / (fftSize / 2));
      for (let b = 0; b < fftSize / 2; b++) {
        let sum = 0;
        const s = startSample + b * bucketSize;
        for (let j = 0; j < bucketSize && s + j < channelData.length; j++) {
          sum += Math.abs(channelData[s + j]);
        }
        const avg = sum / bucketSize;
        // Map to frequency-like curve (bass louder, treble quieter)
        const freqWeight = 1 - (b / (fftSize / 2)) * 0.6;
        rs.freqData[b] = Math.min(255, Math.round(avg * 255 * 3 * freqWeight * rs.sensitivity));
      }
    }

    // Swap render state into main state temporarily
    const savedState = {};
    const keysToSwap = [
      'mode', 'palette', 'sensitivity', 'freqData', 'timeData', 'time', 'dt',
      'beatEnergy', 'chromaticAberration', 'bloomIntensity', 'smoothBass',
      'smoothMid', 'smoothHigh', 'smoothSubBass', 'lastBeat', 'avgEnergy',
      'beatTimes', 'particles', 'flowParticles', 'flowFieldInited',
      'metaballs', 'lissajousTrail', 'fractalZoom', 'fractalOffset', 'postFx',
    ];

    function swapIn() {
      for (const k of keysToSwap) {
        savedState[k] = state[k];
        state[k] = rs[k];
      }
    }

    function swapOut() {
      for (const k of keysToSwap) {
        rs[k] = state[k];
        state[k] = savedState[k];
      }
    }

    // Save original canvas refs and swap to render canvas
    const origCanvas = canvas;
    const origCtx = ctx;
    const origOffCanvas = offCanvas;
    const origOffCtx = offCtx;

    // Render each frame
    const maxFrames = Math.min(totalFrames, duration * fps);
    const frameBatch = 5; // Process 5 frames per tick to avoid blocking too long

    await new Promise((resolveRender) => {
      let frameIdx = 0;

      function renderBatch() {
        swapIn();

        // Temporarily override canvas references (they're const, so we override via the draw functions)
        // Instead, we directly render using the shared ctx variable by reassigning
        // We need to use the render canvas directly
        const batchEnd = Math.min(frameIdx + frameBatch, maxFrames);

        for (; frameIdx < batchEnd; frameIdx++) {
          rs.time = frameIdx / fps;
          state.time = rs.time;
          state.dt = 1 / fps;

          analyzeFrame(frameIdx);
          state.freqData = rs.freqData;
          state.timeData = rs.timeData;

          // BPM / beat detection
          detectBPM(state.freqData);
          updateSmoothBands();

          // Clear frame
          const fadeRates = {
            'particle-burst': 'rgba(10,0,26,0.12)',
            'flow-field': 'rgba(10,0,26,0.04)',
            lissajous: 'rgba(10,0,26,0.08)',
            'sacred-geometry': 'rgba(10,0,26,0.18)',
            'fractal-zoom': 'rgba(10,0,26,1)',
            metaballs: 'rgba(10,0,26,1)',
          };

          // Scale render: draw to offscreen then copy
          renderCtx.fillStyle = fadeRates[state.mode] || 'rgba(10,0,26,0.2)';
          renderCtx.fillRect(0, 0, renderW, renderH);

          // We need to temporarily make the global ctx/canvas point to render canvas
          // This is the simplest approach: draw to main canvas, then copy
          ctx.fillStyle = fadeRates[state.mode] || 'rgba(10,0,26,0.2)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          const renderer = vizRenderers[state.mode];
          if (renderer) renderer();
          applyPostProcessing();

          // Copy main canvas to render canvas (scaled)
          renderCtx.drawImage(origCanvas, 0, 0, origCanvas.width, origCanvas.height, 0, 0, renderW, renderH);

          // Draw watermark if enabled
          if (batchState.watermark) {
            drawWatermark(renderCtx, renderW, renderH);
          }
        }

        swapOut();

        // Update progress within this item
        const itemPct = frameIdx / maxFrames;
        const overallIdx = batchState.currentIndex;
        const totalItems = batchState.queue.filter(q => q.status !== 'pending' || q === batchState.queue.find(qq => qq.status === 'rendering')).length;

        batchCurrentItem.textContent = item.file.name + ' [' + item.mode + ' + ' + item.palette + '] ' + Math.round(itemPct * 100) + '%';

        if (frameIdx < maxFrames) {
          setTimeout(renderBatch, 0);
        } else {
          recorder.stop();
          resolveRender();
        }
      }

      renderBatch();
    });

    await done;
    await audioCtx.close();
  }

  // Start with timestamp-based loop
  requestAnimationFrame(mainLoop);
})();
