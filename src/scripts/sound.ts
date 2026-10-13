// Generative sound, synthesised live: a low drone that opens up as the particles move,
// a breath of air when you stir them, and a soft chime when a new script forms. Off until asked for.

// D minor pentatonic, one note per script.
const NOTES = [293.66, 349.23, 392.0, 440.0, 523.25, 587.33, 698.46, 783.99, 880.0];

export interface Sound {
  readonly on: boolean;
  toggle(): boolean;
  pulse(energy: number): void;
  chime(index: number): void;
}

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  bus: GainNode;
  tone: BiquadFilterNode;
  air: GainNode;
}

function build(): Graph {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  // A feedback delay stands in for a room.
  const bus = ctx.createGain();
  const delay = ctx.createDelay(1.5);
  delay.delayTime.value = 0.34;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.38;
  const wet = ctx.createGain();
  wet.gain.value = 0.3;
  bus.connect(master);
  bus.connect(delay);
  delay.connect(feedback).connect(delay);
  delay.connect(wet).connect(master);

  // Drone: three detuned low voices through one lowpass.
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 320;
  tone.Q.value = 0.8;
  tone.connect(bus);
  for (const [f, detune, type] of [
    [73.42, 0, "sine"],
    [110.0, 5, "triangle"],
    [146.83, -4, "sine"],
  ] as const) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.value = 0.045;
    o.connect(g).connect(tone);
    o.start();
  }

  // Air: looping brown noise through a bandpass, silent until the pointer stirs things.
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 800;
  band.Q.value = 0.7;
  const air = ctx.createGain();
  air.gain.value = 0;
  noise.connect(band).connect(air).connect(bus);
  noise.start();

  return { ctx, master, bus, tone, air };
}

export function createSound(): Sound {
  let g: Graph | null = null;
  let on = false;
  let lastPulse = 0;

  return {
    get on() {
      return on;
    },
    toggle() {
      on = !on;
      if (!g) g = build();
      const { ctx, master } = g;
      const now = ctx.currentTime;
      if (on) {
        void ctx.resume();
        master.gain.cancelScheduledValues(now);
        master.gain.setTargetAtTime(0.55, now, 0.6);
      } else {
        master.gain.cancelScheduledValues(now);
        master.gain.setTargetAtTime(0, now, 0.15);
        setTimeout(() => {
          if (!on) void ctx.suspend();
        }, 900);
      }
      return on;
    },
    pulse(energy) {
      if (!g || !on) return;
      const now = g.ctx.currentTime;
      if (now - lastPulse < 0.1) return;
      lastPulse = now;
      g.tone.frequency.setTargetAtTime(260 + energy * 1500, now, 0.35);
      g.air.gain.setTargetAtTime(energy * 0.09, now, 0.25);
    },
    chime(index) {
      if (!g || !on) return;
      const { ctx, bus } = g;
      const now = ctx.currentTime;
      const f = NOTES[index % NOTES.length] ?? 440;
      for (const [mult, level, type] of [
        [1, 0.1, "sine"],
        [2, 0.035, "triangle"],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f * mult;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(level, now + 0.012);
        env.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);
        o.connect(env).connect(bus);
        o.start(now);
        o.stop(now + 2.7);
      }
    },
  };
}
