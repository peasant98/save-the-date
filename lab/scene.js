'use strict';
/* The venue painting as a depth-layered diorama.
 *
 * Depth-Anything-V2-Large cut each painting at the 20th/55th/82nd depth
 * percentiles into far / mid / near alpha layers over an untouched full-bleed
 * plate. At rest the stack is pixel-identical to the original; as the camera
 * moves, any gap falls through to real paint, so nothing needs inpainting.
 *
 * Canvases ride *between* the layers, which is the whole point of cutting them:
 * the sky sits under the treeline so the trees mask it for free, the string
 * lights hang in front of the arches but behind the near tree, and the swarm
 * drifts through the middle distance.
 *
 *   new Diorama(document.getElementById('viewport'), PRESET)
 */

const AR = 1536 / 1024;
const HEADROOM = 1.10;              /* over-size so parallax never walks off-screen */
const rnd = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

/* back -> front. `wind` is the share of the sway each layer takes. */
const STACK = [
  { kind: 'img',    key: 'base',   depth: 0.10 },
  { kind: 'canvas', key: 'sky',    depth: 0.14 },
  { kind: 'img',    key: 'far',    depth: 0.34, wind: 0.5 },
  { kind: 'canvas', key: 'fog',    depth: 0.50 },
  { kind: 'img',    key: 'mid',    depth: 0.62, wind: 0.8 },
  { kind: 'canvas', key: 'lights', depth: 0.72 },
  { kind: 'canvas', key: 'swarm',  depth: 0.85 },
  { kind: 'img',    key: 'near',   depth: 1.00, wind: 1.0 },
  { kind: 'canvas', key: 'front',  depth: 1.18 },
];

/* ------------------------------------------------------------------ systems
   Each system owns one canvas key and draws in normalized coordinates, so it
   does not care how big the stage is. */

class Sky {
  constructor(){
    this.stars = Array.from({length: 90}, () => ({
      x: Math.random(), y: rnd(0.02, 0.46),
      r: rnd(0.8, 2.6), ph: Math.random() * TAU, sp: rnd(0.0006, 0.0018),
    }));
    /* the painted swirl-suns, hand-placed so they glow in time with the rest */
    this.suns = [[0.47,0.095],[0.62,0.085],[0.695,0.03],[0.445,0.285],[0.375,0.37],[0.60,0.20]]
      .map(([x, y]) => ({ x, y, ph: Math.random() * TAU, sp: rnd(0.0004, 0.0009) }));
    this.clouds = Array.from({length: 11}, () => ({
      x: Math.random(), y: rnd(0.04, 0.38), w: rnd(0.10, 0.30), h: rnd(0.020, 0.055),
      a: rnd(0.05, 0.14), sp: rnd(0.000004, 0.000013),
    }));
    this.shoot = null;
    this.nextShoot = 2600;
  }

  draw(ctx, t, e){
    ctx.save();
    if (e.night){
      ctx.globalCompositeOperation = 'lighter';
      for (const s of this.stars){
        const a = 0.16 + 0.34 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
        glow(ctx, s.x * e.W, s.y * e.H, s.r * e.k * 6.4, `rgba(255,246,214,${a})`);
      }
      for (const s of this.suns){
        const a = 0.10 + 0.16 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
        glow(ctx, s.x * e.W, s.y * e.H, e.H * 0.075, `rgba(255,228,138,${a})`);
      }
      this.shootingStar(ctx, t, e);
    } else {
      ctx.globalCompositeOperation = 'soft-light';
      for (const c of this.clouds){
        c.x += c.sp * 16;
        if (c.x - c.w > 1.25) c.x = -c.w - 0.25;
        const a = c.a * (0.7 + 0.3 * Math.sin(t * 0.0002 + c.y * 20));
        ctx.save();
        ctx.translate(c.x * e.W, c.y * e.H);
        ctx.scale(1, c.h / c.w);
        glow(ctx, 0, 0, c.w * e.W, `rgba(255,255,248,${a})`);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  shootingStar(ctx, t, e){
    if (!this.shoot){
      if (t < this.nextShoot) return;
      this.shoot = { p: 0, x: rnd(0.15, 0.75), y: rnd(0.02, 0.22), dx: rnd(0.14, 0.30), dy: rnd(0.05, 0.13) };
      this.nextShoot = t + rnd(7000, 15000);
      return;
    }
    const s = this.shoot;
    s.p += 0.014;
    if (s.p >= 1){ this.shoot = null; return; }
    const fade = Math.sin(Math.PI * s.p);
    const x = (s.x + s.dx * s.p) * e.W, y = (s.y + s.dy * s.p) * e.H;
    const tx = x - s.dx * e.W * 0.16, ty = y - s.dy * e.H * 0.16;
    const g = ctx.createLinearGradient(x, y, tx, ty);
    g.addColorStop(0, `rgba(255,250,226,${0.85 * fade})`);
    g.addColorStop(1, 'rgba(255,250,226,0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 2 * e.k;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
  }
}

class Lights {
  constructor(){
    /* catenaries slung across the arches, in image coordinates */
    this.strands = [
      { a: [0.155, 0.678], b: [0.455, 0.700], sag: 0.050, n: 26, ph: 0.0 },
      { a: [0.430, 0.694], b: [0.705, 0.662], sag: 0.055, n: 24, ph: 1.7 },
      { a: [0.200, 0.638], b: [0.720, 0.628], sag: 0.072, n: 38, ph: 3.1 },
      { a: [0.625, 0.652], b: [0.870, 0.618], sag: 0.042, n: 20, ph: 4.6 },
    ];
    for (const s of this.strands) s.bulbs = Array.from({length: s.n}, () => Math.random() * TAU);
  }

  /* quadratic bezier whose control point is the sway */
  point(s, u, t){
    const sway = Math.sin(t * 0.00055 + s.ph) * 0.010 + Math.sin(t * 0.00097 + s.ph * 1.7) * 0.004;
    const cx = (s.a[0] + s.b[0]) / 2 + sway;
    const cy = (s.a[1] + s.b[1]) / 2 + s.sag + Math.sin(t * 0.00041 + s.ph) * 0.006;
    const m = 1 - u;
    return [m*m*s.a[0] + 2*m*u*cx + u*u*s.b[0],
            m*m*s.a[1] + 2*m*u*cy + u*u*s.b[1]];
  }

  draw(ctx, t, e){
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.strands){
      ctx.beginPath();
      for (let i = 0; i <= 40; i++){
        const [x, y] = this.point(s, i / 40, t);
        i ? ctx.lineTo(x * e.W, y * e.H) : ctx.moveTo(x * e.W, y * e.H);
      }
      ctx.strokeStyle = e.night ? 'rgba(90,74,44,.5)' : 'rgba(70,60,40,.34)';
      ctx.lineWidth = Math.max(1, 1.3 * e.k);
      ctx.stroke();

      for (let i = 0; i < s.n; i++){
        const [x, y] = this.point(s, (i + 0.5) / s.n, t);
        const tw = 0.62 + 0.38 * Math.sin(t * 0.0021 + s.bulbs[i]);
        const a = (e.night ? 0.95 : 0.55) * tw;
        const r = (e.night ? 9 : 6.5) * e.k;
        const g = ctx.createRadialGradient(x*e.W, y*e.H, 0, x*e.W, y*e.H, r);
        g.addColorStop(0, `rgba(255,244,205,${a})`);
        g.addColorStop(0.28, `rgba(255,205,110,${a * 0.55})`);
        g.addColorStop(1, 'rgba(255,190,90,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x*e.W, y*e.H, r, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }
}

/* Mist lying along the lawn and the creek line. */
class Fog {
  constructor(density){
    this.density = density;
    /* narrow and low, so it lies on the lawn instead of hazing the painting */
    this.bands = Array.from({length: 6}, (_, i) => ({
      x: Math.random(), y: rnd(0.70, 0.90), w: rnd(0.14, 0.30), h: rnd(0.018, 0.042),
      a: rnd(0.35, 1), sp: rnd(0.0000045, 0.000012) * (i % 2 ? 1 : -1),
    }));
  }

  draw(ctx, t, e){
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.bands){
      b.x += b.sp * 16;
      if (b.x - b.w > 1.3) b.x = -b.w - 0.3;
      if (b.x + b.w < -0.3) b.x = 1.3 + b.w;
      const a = this.density * b.a * (e.night ? 0.10 : 0.06)
              * (0.72 + 0.28 * Math.sin(t * 0.00018 + b.y * 17));
      const tint = e.night ? '176,196,224' : '255,255,246';
      ctx.save();
      ctx.translate(b.x * e.W, b.y * e.H);
      ctx.scale(1, b.h / b.w);
      glow(ctx, 0, 0, b.w * e.W, `rgba(${tint},${a})`);
      ctx.restore();
    }
    ctx.restore();
  }
}

/* Fireflies after dark, dust in the light by day. */
class Swarm {
  constructor(count, scale = 1){
    this.scale = scale;
    this.bugs = Array.from({length: count}, () => ({
      x: Math.random(), y: rnd(0.46, 0.99),
      ax: rnd(0.010, 0.045), ay: rnd(0.006, 0.026),
      fx: rnd(0.00007, 0.00022), fy: rnd(0.00009, 0.00028),
      px: Math.random() * TAU, py: Math.random() * TAU,
      blink: rnd(0.0008, 0.0026), bph: Math.random() * TAU,
      r: rnd(0.9, 2.3), drift: rnd(-0.000006, 0.000012),
    }));
  }

  draw(ctx, t, e){
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.bugs){
      b.x += b.drift * 16;
      if (b.x > 1.1) b.x = -0.1;
      if (b.x < -0.1) b.x = 1.1;
      const x = (b.x + b.ax * Math.sin(t * b.fx + b.px)) * e.W;
      const y = (b.y + b.ay * Math.sin(t * b.fy + b.py)) * e.H;
      /* cubed sine == mostly dark with a soft pulse, the way they actually blink */
      const pulse = Math.max(0, Math.sin(t * b.blink + b.bph)) ** 3;
      const a = (e.night ? 0.95 : 0.34) * pulse;
      if (a < 0.01) continue;
      const tint = e.night ? '198,255,150' : '255,248,214';
      glow(ctx, x, y, b.r * e.k * this.scale * 5.5, `rgba(${tint},${a})`);
    }
    ctx.restore();
  }
}

/* Embers climbing off the lights at night; leaves coming down by day. */
class Drifters {
  constructor(count){
    this.items = Array.from({length: count}, () => this.spawn(Math.random()));
  }

  spawn(y0){
    return {
      x: Math.random(), y: y0,
      vy: rnd(0.000018, 0.000055), vx: rnd(-0.000012, 0.000012),
      sway: rnd(0.006, 0.024), f: rnd(0.00025, 0.0009), ph: Math.random() * TAU,
      size: rnd(0.7, 2.1), spin: rnd(-0.0013, 0.0013), a: rnd(0.45, 1),
    };
  }

  draw(ctx, t, e){
    ctx.save();
    for (const d of this.items){
      /* embers rise, leaves fall */
      d.y += (e.night ? -d.vy : d.vy) * 16;
      d.x += d.vx * 16;
      if (e.night && d.y < 0.26) Object.assign(d, this.spawn(rnd(0.72, 0.95)));
      if (!e.night && d.y > 1.04) Object.assign(d, this.spawn(rnd(-0.06, 0.05)));
      const x = (d.x + d.sway * Math.sin(t * d.f + d.ph)) * e.W;
      const y = d.y * e.H;
      const r = d.size * e.k * 2.1;
      if (e.night){
        ctx.globalCompositeOperation = 'lighter';
        const fade = Math.min(1, (d.y - 0.26) * 4);
        glow(ctx, x, y, r * 3.4, `rgba(255,178,86,${0.7 * d.a * fade})`);
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * d.spin + d.ph);
        ctx.fillStyle = `rgba(126,146,52,${0.6 * d.a})`;
        ctx.beginPath(); ctx.ellipse(0, 0, r * 2.8, r * 1.05, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }
}

function glow(ctx, x, y, r, color){
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

/* ------------------------------------------------------------------ diorama */

export class Diorama {
  constructor(root, cfg = {}){
    this.root = root;
    this.cfg = Object.assign({
      art: '/lab/scene/',
      amp: [0.034, 0.022],   /* camera travel, as a share of stage size */
      drift: 1.0,            /* idle wander */
      breathe: 0,            /* slow dolly in and out */
      wind: 0,               /* degrees of sway on the tree layers */
      fog: 0, swarm: 0, drifters: 0,
      captions: { night: '', day: '' },
    }, cfg);

    this.night = true;
    this.W = this.H = 0;
    this.cam = { x: 0, y: 0, tx: 0, ty: 0 };
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.build();
    this.bind();
    this.layout();
    requestAnimationFrame(t => this.frame(t));
  }

  build(){
    this.stage = el('div', 'stage');
    this.sets = {};
    for (const mode of ['night', 'day']){
      const set = el('div', 'set' + (mode === 'day' ? ' hidden' : ''));
      set.dataset.systems = '';
      const nodes = {};
      for (const L of STACK){
        let node;
        if (L.kind === 'img'){
          node = el('img');
          /* daylight is a second full download, so it waits to be asked for */
          if (mode === 'night') node.src = `${this.cfg.art}venue-night-${L.key}.webp`;
          else node.dataset.src = `${this.cfg.art}venue-day-${L.key}.webp`;
          node.alt = '';
        } else {
          node = el('canvas');
        }
        node.dataset.depth = L.depth;
        if (L.wind) node.dataset.wind = L.wind;
        node.dataset.phase = Math.random() * TAU;
        set.appendChild(node);
        nodes[L.key] = node;
      }
      set.nodes = nodes;
      this.sets[mode] = set;
      this.stage.appendChild(set);
    }
    this.root.appendChild(this.stage);

    const c = this.cfg;
    this.systems = [
      ['sky',   new Sky()],
      ['lights', new Lights()],
      c.fog      ? ['fog',   new Fog(c.fog)] : null,
      c.swarm    ? ['swarm', new Swarm(c.swarm)] : null,
      c.swarm    ? ['front', new Swarm(Math.round(c.swarm * 0.18), 1.9)] : null,
      c.drifters ? ['front', new Drifters(c.drifters)] : null,
    ].filter(Boolean);
  }

  bind(){
    addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      this.look((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    });
    addEventListener('touchmove', e => {
      const t = e.touches[0];
      this.look((t.clientX / innerWidth) * 2 - 1, (t.clientY / innerHeight) * 2 - 1);
    }, { passive: true });
    addEventListener('deviceorientation', e => {
      if (e.gamma == null) return;
      this.look(e.gamma / 34, (e.beta - 45) / 34);
    });
    addEventListener('resize', () => this.layout());
  }

  look(px, py){
    this.cam.tx = Math.max(-1, Math.min(1, px));
    this.cam.ty = Math.max(-1, Math.min(1, py));
    this.root.dispatchEvent(new CustomEvent('diorama:look'));
  }

  layout(){
    const vw = this.root.clientWidth, vh = this.root.clientHeight;
    let W = vw, H = vw / AR;
    if (H < vh){ H = vh; W = H * AR; }
    this.W = W * HEADROOM;
    this.H = H * HEADROOM;
    this.stage.style.width = this.W + 'px';
    this.stage.style.height = this.H + 'px';
    const dpr = Math.min(devicePixelRatio || 1, 2);
    for (const c of this.stage.querySelectorAll('canvas')){
      c.width = Math.round(this.W * dpr);
      c.height = Math.round(this.H * dpr);
      c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  camera(t){
    const c = this.cfg, cam = this.cam;
    /* idle wander, so the scene breathes when nobody is touching it */
    const dx = (Math.sin(t * 0.00019) * 0.42 + Math.sin(t * 0.00043) * 0.16) * c.drift;
    const dy = Math.cos(t * 0.00025) * 0.30 * c.drift;
    cam.x += ((cam.tx + dx) * 0.5 - cam.x) * 0.045;
    cam.y += ((cam.ty + dy) * 0.5 - cam.y) * 0.045;

    const dolly = c.breathe ? c.breathe * Math.sin(t * 0.00012) : 0;
    for (const node of this.stage.querySelectorAll('[data-depth]')){
      const d = +node.dataset.depth;
      const x = -cam.x * this.W * c.amp[0] * d;
      const y = -cam.y * this.H * c.amp[1] * d;
      let tf = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      if (dolly) tf += ` scale(${(1 + dolly * d).toFixed(4)})`;
      if (c.wind && node.dataset.wind){
        const w = c.wind * +node.dataset.wind * (
          Math.sin(t * 0.00037 + +node.dataset.phase) * 0.7 +
          Math.sin(t * 0.00083 + +node.dataset.phase * 2.1) * 0.3);
        tf += ` rotate(${w.toFixed(3)}deg)`;
      }
      node.style.transform = tf;
    }
  }

  frame(t){
    if (this.root.clientWidth !== this._w || this.root.clientHeight !== this._h){
      this._w = this.root.clientWidth; this._h = this.root.clientHeight;
      this.layout();
    }
    const at = this.reduced ? 0 : t;
    this.camera(at);

    const set = this.sets[this.night ? 'night' : 'day'];
    const env = { W: this.W, H: this.H, night: this.night, k: this.H / 1024 * 1.6 };
    const cleared = new Set();   /* a canvas shared by two systems clears once */
    for (const [key, sys] of this.systems){
      const canvas = set.nodes[key];
      const ctx = canvas.getContext('2d');
      if (!cleared.has(canvas)){ ctx.clearRect(0, 0, this.W, this.H); cleared.add(canvas); }
      sys.draw(ctx, at, env);
    }
    requestAnimationFrame(t2 => this.frame(t2));
  }

  setNight(on){
    if (!on){   /* daylight is a second full download; fetch it on first ask */
      for (const img of this.sets.day.querySelectorAll('img[data-src]')){
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
      }
    }
    this.night = on;
    this.sets.night.classList.toggle('hidden', !on);
    this.sets.day.classList.toggle('hidden', on);
    document.body.classList.toggle('day', !on);
    this.root.dispatchEvent(new CustomEvent('diorama:mode', { detail: { night: on } }));
  }
}

function el(tag, cls){
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
}
