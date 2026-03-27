(() => {
  'use strict';

  // ─── Color Palettes ───────────────────────────────────────────────
  const PALETTES = {
    neon: ['#ff00ff', '#00ffff', '#ff0080', '#80ff00', '#ffff00', '#ff4400'],
    vaporwave: ['#ff71ce', '#01cdfe', '#05ffa1', '#b967ff', '#fffb96', '#f6a4ec'],
    cosmic: ['#1a0533', '#4a0e78', '#7b2fbe', '#c084fc', '#e9d5ff', '#ffffff'],
    'deep-void': ['#0d001a', '#1a0033', '#33004d', '#660066', '#990099', '#cc00cc'],
  };

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
    particles: [],
    lastBeat: 0,
    beatEnergy: 0,
    avgEnergy: 0,
  };

  // ─── Canvas Setup ──────────────────────────────────────────────────
  const canvas = document.getElementById('viz-canvas');
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // ─── Audio Setup ───────────────────────────────────────────────────
  function initAudio() {
    if (state.audioCtx) return;
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    state.analyser = state.audioCtx.createAnalyser();
    state.analyser.fftSize = 2048;
    state.analyser.smoothingTimeConstant = 0.8;
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

  // ─── File Upload ───────────────────────────────────────────────────
  const fileInput = document.getElementById('file-input');
  const btnUpload = document.getElementById('btn-upload');
  const nowPlaying = document.getElementById('now-playing');
  const trackName = document.getElementById('track-name');

  btnUpload.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    initAudio();
    if (state.audioCtx.state === 'suspended') await state.audioCtx.resume();

    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await state.audioCtx.decodeAudioData(arrayBuffer);
    const source = state.audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = true;
    connectSource(source);
    source.start(0);

    trackName.textContent = file.name;
    nowPlaying.classList.remove('hidden');
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
      // Don't connect analyser to destination to avoid feedback
      btnMic.classList.add('active');
      trackName.textContent = 'Microphone Input';
      nowPlaying.classList.remove('hidden');
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

    // Merge audio if available
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
    // Simple energy-based beat detection
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
      state.beatTimes.push(now);
      state.lastBeat = now;

      // Keep last 20 beats
      if (state.beatTimes.length > 20) state.beatTimes.shift();

      // Calculate BPM from intervals
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
    return energy;
  }

  // ─── Helpers ───────────────────────────────────────────────────────
  function getColor(index, alpha = 1) {
    const colors = PALETTES[state.palette];
    const c = colors[index % colors.length];
    if (alpha === 1) return c;
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function getFreqNorm(i) {
    if (!state.freqData) return 0;
    return (state.freqData[i] / 255) * state.sensitivity;
  }

  function getAvgFreq(start, end) {
    if (!state.freqData) return 0;
    let sum = 0;
    const s = Math.floor(start * state.freqData.length);
    const e = Math.floor(end * state.freqData.length);
    for (let i = s; i < e; i++) sum += state.freqData[i];
    return (sum / (e - s) / 255) * state.sensitivity;
  }

  // ─── Visualizer Modes ─────────────────────────────────────────────

  function drawKaleidoscope() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const segments = 12;
    const bass = getAvgFreq(0, 0.1);
    const mid = getAvgFreq(0.1, 0.5);
    const high = getAvgFreq(0.5, 1.0);
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

      // Inner ring
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
    const bass = getAvgFreq(0, 0.1);

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
    state.analyser.getByteTimeDomainData(state.timeData);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const bass = getAvgFreq(0, 0.1);
    const mid = getAvgFreq(0.1, 0.5);
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
    const bass = getAvgFreq(0, 0.1);
    const mid = getAvgFreq(0.1, 0.5);

    // Spawn particles on beat
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

    // Update & draw particles
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

      // Gravity toward center on bass
      const dx = cx - p.x;
      const dy = cy - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        p.vx += (dx / dist) * bass * 0.3;
        p.vy += (dy / dist) * bass * 0.3;
      }

      // Draw trail
      if (p.trail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(p.trail[0].x, p.trail[0].y);
        for (const t of p.trail) ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = getColor(p.color, p.life * 0.3);
        ctx.lineWidth = p.size * 0.5;
        ctx.stroke();
      }

      // Draw particle
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fillStyle = getColor(p.color, p.life);
      ctx.fill();
    }

    // Central glow
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 100 + bass * 200);
    gradient.addColorStop(0, getColor(0, 0.1 + state.beatEnergy * 0.3));
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawMandala() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const bass = getAvgFreq(0, 0.1);
    const mid = getAvgFreq(0.1, 0.5);
    const high = getAvgFreq(0.5, 1.0);
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

      // Dots at petal tips
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

    // Center piece
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

  // ─── Render Loop ───────────────────────────────────────────────────
  const vizRenderers = {
    kaleidoscope: drawKaleidoscope,
    tunnel: drawTunnel,
    'waveform-morph': drawWaveformMorph,
    'particle-burst': drawParticleBurst,
    mandala: drawMandala,
  };

  function render() {
    requestAnimationFrame(render);
    state.time += 0.016;

    // Get frequency data
    if (state.analyser) {
      state.analyser.getByteFrequencyData(state.freqData);
      detectBPM(state.freqData);
    }

    // Fade previous frame
    ctx.fillStyle = state.mode === 'particle-burst'
      ? 'rgba(10,0,26,0.15)'
      : 'rgba(10,0,26,0.25)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw current mode
    const renderer = vizRenderers[state.mode];
    if (renderer) renderer();
  }

  // ─── Demo Mode (no audio) ─────────────────────────────────────────
  // Generate fake frequency data when no audio is connected
  function generateDemoData() {
    if (state.source) return;
    if (!state.freqData) {
      state.freqData = new Uint8Array(1024);
      state.timeData = new Uint8Array(2048);
    }
    for (let i = 0; i < state.freqData.length; i++) {
      const base = Math.sin(state.time * 2 + i * 0.05) * 40 + 60;
      const pulse = Math.sin(state.time * 4) * 30;
      state.freqData[i] = Math.max(0, Math.min(255, base + pulse + Math.random() * 20));
    }
    for (let i = 0; i < state.timeData.length; i++) {
      state.timeData[i] = 128 + Math.sin(state.time * 6 + i * 0.02) * 40;
    }
    // Fake beat
    if (Math.sin(state.time * 3) > 0.95 && performance.now() - state.lastBeat > 300) {
      state.beatEnergy = 1.0;
      state.lastBeat = performance.now();
    }
    state.beatEnergy *= 0.92;
  }

  // Patch render to include demo
  const originalRender = render;
  function renderWithDemo() {
    generateDemoData();
    originalRender();
  }

  // Override: use demo-enhanced render
  function mainLoop() {
    requestAnimationFrame(mainLoop);
    state.time += 0.016;

    generateDemoData();

    if (state.analyser) {
      state.analyser.getByteFrequencyData(state.freqData);
      state.analyser.getByteTimeDomainData(state.timeData);
      detectBPM(state.freqData);
    }

    ctx.fillStyle = state.mode === 'particle-burst'
      ? 'rgba(10,0,26,0.15)'
      : 'rgba(10,0,26,0.25)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const renderer = vizRenderers[state.mode];
    if (renderer) renderer();
  }

  // Start
  mainLoop();
})();
