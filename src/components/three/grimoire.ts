import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  PlaneGeometry,
  PointLight,
  Points,
  ShaderMaterial,
  type Texture,
} from "three";
import { canvasTexture, createStage, readPalette, seeded, type Palette } from "./runtime";

/**
 * The hero: an open grimoire hovering over a slowly turning sigil, pages
 * leafing on their own, Thai letters and embers rising out of it into a
 * starfield. "writing" mode stirs everything up while the studio is at work.
 */

export type GrimoireMode = "idle" | "writing";

export interface GrimoireProps {
  mode?: GrimoireMode;
  /** a smaller, calmer version for side panels */
  compact?: boolean;
}

export interface SceneHandle {
  update: (props: GrimoireProps) => void;
  setPalette: (p: Palette) => void;
  dispose: () => void;
}

const PAGE_W = 2;
const PAGE_H = 2.8;
const SEGMENTS = 28;

/* -------------------------------- textures -------------------------------- */

function pageTexture(seed: number): Texture {
  const rand = seeded(seed);
  return canvasTexture(512, 720, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#f4e8cc");
    g.addColorStop(1, "#e3cfa4");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // age spots and a vignette, so it reads as paper rather than plastic
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(120, 82, 30, ${0.03 + rand() * 0.04})`;
      ctx.beginPath();
      ctx.arc(rand() * w, rand() * h, 8 + rand() * 40, 0, Math.PI * 2);
      ctx.fill();
    }
    const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(90,55,15,0.28)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);

    // drop cap
    ctx.fillStyle = "#8a2f1a";
    ctx.fillRect(56, 70, 70, 78);
    ctx.fillStyle = "#e9c46a";
    ctx.font = "bold 58px serif";
    ctx.fillText("ก", 70, 130);

    // lines of "text": ink bars of varied length, as a reader squinting would see
    ctx.fillStyle = "rgba(55, 35, 15, 0.55)";
    let y = 90;
    for (let line = 0; line < 22; line++) {
      const indent = line < 3 ? 150 : 56;
      let x = indent;
      const end = w - 56 - (line % 7 === 6 ? rand() * 200 : 0);
      while (x < end) {
        const word = 14 + rand() * 46;
        ctx.fillRect(x, y, Math.min(word, end - x), 5);
        x += word + 9;
      }
      y += line === 2 ? 40 : 26;
    }

    // a small sigil at the foot of the page
    ctx.strokeStyle = "rgba(138, 47, 26, 0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w / 2, h - 80, 28, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const b = ((i + 2) / 5) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.cos(a) * 28, h - 80 + Math.sin(a) * 28);
      ctx.lineTo(w / 2 + Math.cos(b) * 28, h - 80 + Math.sin(b) * 28);
      ctx.stroke();
    }
  });
}

function edgeTexture(): Texture {
  return canvasTexture(64, 256, (ctx, w, h) => {
    ctx.fillStyle = "#e8d6ae";
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) {
      ctx.fillStyle = `rgba(120, 85, 35, ${0.12 + ((y * 7) % 5) * 0.03})`;
      ctx.fillRect(0, y, w, 1);
    }
  });
}

function leatherTexture(): Texture {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#3a1d14");
    g.addColorStop(1, "#1d0e0a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const rand = seeded(7);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rand() * 0.25})`;
      ctx.fillRect(rand() * w, rand() * h, 2, 2);
    }
    ctx.strokeStyle = "rgba(233, 185, 92, 0.75)";
    ctx.lineWidth = 3;
    ctx.strokeRect(14, 14, w - 28, h - 28);
  });
}

/** Concentric rings, star polygons and tick marks — an invented sigil. */
function sigilTexture(): Texture {
  return canvasTexture(1024, 1024, (ctx, w) => {
    const c = w / 2;
    ctx.translate(c, c);
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#ffffff";

    const ring = (r: number, width: number, alpha: number) => {
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    };
    ring(492, 6, 0.9);
    ring(470, 2, 0.6);
    ring(360, 3, 0.8);
    ring(250, 2, 0.55);
    ring(120, 3, 0.8);

    // tick marks between the outer rings
    ctx.globalAlpha = 0.75;
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const long = i % 10 === 0;
      ctx.lineWidth = long ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 470, Math.sin(a) * 470);
      ctx.lineTo(Math.cos(a) * (long ? 430 : 452), Math.sin(a) * (long ? 430 : 452));
      ctx.stroke();
    }

    // runic marks: short invented glyphs made from strokes
    const rand = seeded(42);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      ctx.save();
      ctx.rotate(a);
      ctx.translate(0, -410);
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(0, 14);
      const n = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) {
        const y = -10 + rand() * 20;
        ctx.moveTo(0, y);
        ctx.lineTo((rand() > 0.5 ? 1 : -1) * (6 + rand() * 8), y + (rand() - 0.5) * 12);
      }
      ctx.stroke();
      ctx.restore();
    }

    // two interlocking stars
    const star = (points: number, step: number, r: number, alpha: number, rot: number) => {
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const a = ((i * step) / points) * Math.PI * 2 + rot;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    star(7, 3, 356, 0.7, -Math.PI / 2);
    star(6, 1, 250, 0.55, 0);
    star(3, 1, 250, 0.45, Math.PI / 6);

    // small circles at the heptagram's points
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 360, Math.sin(a) * 360, 22, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

/** Thai letters and a few stars in a 4×4 atlas, for the rising glyph sprites. */
function glyphAtlas(): Texture {
  const glyphs = ["ก", "ข", "ค", "ง", "จ", "ฉ", "ญ", "ฎ", "ณ", "ธ", "ฬ", "อ", "ฮ", "✦", "✧", "๏"];
  return canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 84px "Noto Serif Thai", "Leelawadee UI", Tahoma, serif`;
    glyphs.forEach((g, i) => {
      const x = (i % 4) * 128 + 64;
      const y = Math.floor(i / 4) * 128 + 68;
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 12;
      ctx.fillText(g, x, y);
    });
  });
}

/* --------------------------------- shaders -------------------------------- */

const MOTE_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uPixel;
  attribute vec3 aSeed;
  varying float vAlpha;
  varying float vMix;
  void main() {
    float life = fract(aSeed.x + uTime * (0.035 + aSeed.y * 0.05) * uSpeed);
    float angle = aSeed.z * 6.2831 + uTime * (0.18 + aSeed.y * 0.3) * uSpeed;
    float radius = 0.25 + life * (1.6 + aSeed.y * 2.2);
    vec3 p = vec3(cos(angle) * radius, -0.2 + life * 4.6, sin(angle) * radius * 0.7);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = (0.6 + aSeed.y * 1.6) * uPixel;
    gl_PointSize = size * (7.0 / -mv.z);
    vAlpha = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.65, 1.0, life));
    vMix = aSeed.z;
  }
`;

const MOTE_FRAGMENT = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vMix;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float glow = smoothstep(0.5, 0.0, d);
    glow = glow * glow;
    vec3 color = mix(uColorA, uColorB, smoothstep(0.35, 0.95, vMix));
    gl_FragColor = vec4(color, glow * vAlpha * uOpacity);
  }
`;

const GLYPH_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uPixel;
  attribute vec3 aSeed;
  attribute float aCell;
  varying float vAlpha;
  varying float vCell;
  void main() {
    float life = fract(aSeed.x + uTime * 0.045 * uSpeed);
    float angle = aSeed.z * 6.2831 + uTime * 0.12 * uSpeed;
    float radius = 0.4 + life * (1.2 + aSeed.y * 1.4);
    vec3 p = vec3(cos(angle) * radius, 0.1 + life * 3.6, sin(angle) * radius * 0.6);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (14.0 + aSeed.y * 12.0) * uPixel * (7.0 / -mv.z);
    vAlpha = smoothstep(0.0, 0.18, life) * (1.0 - smoothstep(0.55, 1.0, life));
    vCell = aCell;
  }
`;

const GLYPH_FRAGMENT = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vCell;
  void main() {
    vec2 cell = vec2(mod(vCell, 4.0), floor(vCell / 4.0));
    vec2 uv = (cell + vec2(gl_PointCoord.x, gl_PointCoord.y)) / 4.0;
    uv.y = 1.0 - uv.y;
    float a = texture2D(uAtlas, uv).a;
    gl_FragColor = vec4(uColor, a * vAlpha * uOpacity);
  }
`;

const STAR_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uPixel;
  attribute float aSeed;
  varying float vTwinkle;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (0.8 + fract(aSeed * 7.3) * 1.8) * uPixel;
    vTwinkle = 0.45 + 0.55 * sin(uTime * (0.6 + fract(aSeed * 3.1) * 1.6) + aSeed * 40.0);
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying float vTwinkle;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor, a * vTwinkle * 0.8);
  }
`;

/* ---------------------------------- scene --------------------------------- */

export function mount(canvas: HTMLCanvasElement, host: HTMLElement, initial: GrimoireProps): SceneHandle {
  const stage = createStage(canvas, host, { fov: 34 });
  const { scene, camera, lowPower } = stage;
  const pixel = stage.renderer.getPixelRatio();
  let palette = readPalette();
  let props = { mode: "idle" as GrimoireMode, compact: false, ...initial };

  camera.position.set(0, 3.4, 9.4);
  camera.lookAt(0, 0.4, 0);

  /* lights */
  const ambient = new AmbientLight(0xffffff, 0.55);
  const candle = new PointLight(palette.accent, 16, 14, 1.6);
  candle.position.set(0.2, 2.6, 1.4);
  const rim = new DirectionalLight(palette.magic, 1.4);
  rim.position.set(-4, 3, -4);
  scene.add(ambient, candle, rim);

  /* the book */
  const root = new Group();
  scene.add(root);
  const book = new Group();
  book.position.set(0, 0.35, 0);
  book.rotation.set(0.62, 0, 0);
  root.add(book);

  const leather = leatherTexture();
  const edges = edgeTexture();
  const pageLeft = pageTexture(11);
  const pageRight = pageTexture(23);
  const pageTurn = pageTexture(37);

  const coverMat = new MeshStandardMaterial({ map: leather, roughness: 0.7, metalness: 0.15 });
  const edgeMat = new MeshStandardMaterial({ map: edges, roughness: 0.95 });

  const side = (dir: 1 | -1, top: Texture) => {
    const pivot = new Group();
    pivot.rotation.z = dir * -0.1; // a gentle V, the way an open book rests
    const cover = new Mesh(new BoxGeometry(PAGE_W + 0.14, 0.06, PAGE_H + 0.16), coverMat);
    cover.position.set(dir * (PAGE_W / 2 + 0.05), -0.13, 0);
    const topMat = new MeshStandardMaterial({ map: top, roughness: 0.9, emissive: new Color(0x2a1a06), emissiveIntensity: 0.4 });
    const stack = new Mesh(new BoxGeometry(PAGE_W, 0.2, PAGE_H), [edgeMat, edgeMat, topMat, edgeMat, edgeMat, edgeMat]);
    stack.position.set(dir * (PAGE_W / 2 + 0.02), 0, 0);
    pivot.add(cover, stack);
    book.add(pivot);
    return pivot;
  };
  side(-1, pageLeft);
  side(1, pageRight);

  const spine = new Mesh(new BoxGeometry(0.16, 0.12, PAGE_H + 0.16), coverMat);
  spine.position.set(0, -0.16, 0);
  book.add(spine);

  // The turning leaf: a strip of vertices bent every frame around the spine.
  const leafGeo = new PlaneGeometry(PAGE_W, PAGE_H, SEGMENTS, 1);
  leafGeo.rotateX(-Math.PI / 2);
  leafGeo.translate(PAGE_W / 2, 0, 0);
  const leafRest = (leafGeo.getAttribute("position").array as Float32Array).slice();
  const leafMat = new MeshStandardMaterial({
    map: pageTurn,
    side: DoubleSide,
    roughness: 0.9,
    emissive: new Color(0x2a1a06),
    emissiveIntensity: 0.4,
  });
  const leaf = new Mesh(leafGeo, leafMat);
  leaf.position.set(0.02, 0.11, 0);
  book.add(leaf);

  const bendLeaf = (theta: number) => {
    const pos = leafGeo.getAttribute("position") as BufferAttribute;
    const arr = pos.array as Float32Array;
    // The free edge lags behind the spine, which is what makes paper look like paper.
    const lag = Math.sin(theta) * 0.55;
    for (let i = 0; i < arr.length; i += 3) {
      const d = leafRest[i];
      const t = d / PAGE_W;
      const a = theta - lag * t * t;
      arr[i] = Math.cos(a) * d;
      arr[i + 1] = Math.sin(a) * d * 0.9 + Math.sin(t * Math.PI) * 0.04;
      arr[i + 2] = leafRest[i + 2];
    }
    pos.needsUpdate = true;
    leafGeo.computeVertexNormals();
  };

  /* the sigil beneath */
  const sigil = sigilTexture();
  const circleMat = new MeshBasicMaterial({
    map: sigil,
    color: palette.accent,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const circle = new Mesh(new PlaneGeometry(6.4, 6.4), circleMat);
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = -0.9;
  root.add(circle);

  const innerMat = circleMat.clone();
  innerMat.color = palette.magic.clone();
  innerMat.opacity = 0.4;
  const inner = new Mesh(new PlaneGeometry(3.4, 3.4), innerMat);
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = -0.86;
  root.add(inner);

  /* rising motes */
  const moteCount = lowPower ? 520 : 1400;
  const moteSeeds = new Float32Array(moteCount * 3);
  const rand = seeded(1234);
  for (let i = 0; i < moteSeeds.length; i++) moteSeeds[i] = rand();
  const moteGeo = new BufferGeometry();
  moteGeo.setAttribute("position", new BufferAttribute(new Float32Array(moteCount * 3), 3));
  moteGeo.setAttribute("aSeed", new BufferAttribute(moteSeeds, 3));
  const moteMat = new ShaderMaterial({
    vertexShader: MOTE_VERTEX,
    fragmentShader: MOTE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uSpeed: { value: 1 },
      uPixel: { value: pixel * 4 },
      uColorA: { value: palette.accent.clone() },
      uColorB: { value: palette.magic.clone() },
      uOpacity: { value: 1 },
    },
  });
  const motes = new Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  motes.position.y = 0.2;
  root.add(motes);

  /* rising letters */
  const glyphCount = lowPower ? 22 : 48;
  const glyphSeeds = new Float32Array(glyphCount * 3);
  const cells = new Float32Array(glyphCount);
  for (let i = 0; i < glyphCount; i++) {
    glyphSeeds[i * 3] = rand();
    glyphSeeds[i * 3 + 1] = rand();
    glyphSeeds[i * 3 + 2] = rand();
    cells[i] = Math.floor(rand() * 16);
  }
  const glyphGeo = new BufferGeometry();
  glyphGeo.setAttribute("position", new BufferAttribute(new Float32Array(glyphCount * 3), 3));
  glyphGeo.setAttribute("aSeed", new BufferAttribute(glyphSeeds, 3));
  glyphGeo.setAttribute("aCell", new BufferAttribute(cells, 1));
  const atlas = glyphAtlas();
  const glyphMat = new ShaderMaterial({
    vertexShader: GLYPH_VERTEX,
    fragmentShader: GLYPH_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uSpeed: { value: 1 },
      uPixel: { value: pixel },
      uAtlas: { value: atlas },
      uColor: { value: palette.accent.clone() },
      uOpacity: { value: 0.9 },
    },
  });
  const glyphs = new Points(glyphGeo, glyphMat);
  glyphs.frustumCulled = false;
  glyphs.position.y = 0.2;
  root.add(glyphs);

  /* the night sky */
  const starCount = lowPower ? 500 : 1300;
  const starPos = new Float32Array(starCount * 3);
  const starSeed = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    const u = rand() * 2 - 1;
    const a = rand() * Math.PI * 2;
    const r = 26 + rand() * 30;
    const s = Math.sqrt(1 - u * u);
    starPos[i * 3] = Math.cos(a) * s * r;
    starPos[i * 3 + 1] = Math.abs(u) * r * 0.8 - 4;
    starPos[i * 3 + 2] = Math.sin(a) * s * r - 12;
    starSeed[i] = rand();
  }
  const starGeo = new BufferGeometry();
  starGeo.setAttribute("position", new BufferAttribute(starPos, 3));
  starGeo.setAttribute("aSeed", new BufferAttribute(starSeed, 1));
  const starMat = new ShaderMaterial({
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixel: { value: pixel * 1.5 },
      uColor: { value: palette.fg.clone() },
    },
  });
  const stars = new Points(starGeo, starMat);
  scene.add(stars);

  /* palette */
  const applyPalette = (p: Palette) => {
    palette = p;
    const blending = p.light ? NormalBlending : AdditiveBlending;
    candle.color.copy(p.accent);
    rim.color.copy(p.magic);
    circleMat.color.copy(p.accent);
    innerMat.color.copy(p.magic);
    circleMat.blending = innerMat.blending = blending;
    circleMat.opacity = p.light ? 0.35 : 0.55;
    innerMat.opacity = p.light ? 0.25 : 0.4;
    // On paper, dark gold dots read as dust: lift them toward white and let
    // them fade back instead of glowing.
    moteMat.uniforms.uColorA.value.copy(p.light ? p.accent.clone().lerp(new Color(0xffffff), 0.35) : p.accent);
    moteMat.uniforms.uColorB.value.copy(p.magic);
    moteMat.uniforms.uOpacity.value = p.light ? 0.55 : 1;
    moteMat.blending = glyphMat.blending = blending;
    glyphMat.uniforms.uColor.value.copy(p.light ? p.magic : p.accent);
    ambient.intensity = p.light ? 1.1 : 0.55;
    stars.visible = !p.light;
    for (const m of [circleMat, innerMat, moteMat, glyphMat]) m.needsUpdate = true;
    stage.invalidate();
  };
  applyPalette(palette);

  /* layout */
  const layout = () => {
    const portrait = stage.size.w / stage.size.h < 0.9;
    const scale = props.compact ? 0.8 : portrait ? 0.78 : 1;
    root.scale.setScalar(scale);
    root.position.y = portrait ? 0.35 : 0;
  };
  layout();

  /* motion */
  let intensity = props.mode === "writing" ? 1 : 0;
  let flip = 0;
  let scrollTilt = 0;

  stage.start((t, dt) => {
    const target = props.mode === "writing" ? 1 : 0;
    intensity += (target - intensity) * Math.min(1, dt * 1.5);
    const speed = 1 + intensity * 1.8;

    // Leafing: one page every few seconds, quicker while writing.
    flip += dt * (0.16 + intensity * 0.3);
    const cycle = flip % 1;
    const theta = cycle < 0.72 ? (1 - Math.cos((cycle / 0.72) * Math.PI)) * 0.5 * Math.PI : Math.PI;
    bendLeaf(stage.reduced ? 0.9 : theta);
    leaf.visible = cycle < 0.74 || stage.reduced;

    moteMat.uniforms.uTime.value = t;
    moteMat.uniforms.uSpeed.value = speed;
    glyphMat.uniforms.uTime.value = t;
    glyphMat.uniforms.uSpeed.value = speed;
    starMat.uniforms.uTime.value = t;

    circle.rotation.z = t * 0.05 * speed;
    inner.rotation.z = -t * 0.09 * speed;
    circleMat.opacity = (palette.light ? 0.3 : 0.45) + intensity * 0.3 + Math.sin(t * 1.3) * 0.05;

    candle.intensity = 14 + intensity * 10 + Math.sin(t * 7.3) * 0.8 + Math.sin(t * 13.1) * 0.5;

    // The book breathes, follows the pointer a little, and turns with the scroll.
    const y = window.scrollY || 0;
    scrollTilt += (Math.min(1, y / 900) - scrollTilt) * Math.min(1, dt * 4);
    root.position.y = (stage.size.w / stage.size.h < 0.9 ? 0.35 : 0) + Math.sin(t * 0.8) * 0.08;
    book.rotation.y = stage.pointer.x * 0.25 + scrollTilt * 0.6 + Math.sin(t * 0.3) * 0.05;
    book.rotation.x = 0.62 - stage.pointer.y * 0.1 + scrollTilt * 0.2;
    stars.rotation.y = t * 0.004;

    camera.position.x = stage.pointer.x * 0.5;
    camera.position.y = 3.4 + stage.pointer.y * 0.25;
    camera.lookAt(0, 0.4, 0);
  });

  return {
    update: (next) => {
      props = { ...props, ...next };
      layout();
      stage.invalidate();
    },
    setPalette: applyPalette,
    dispose: () => {
      for (const t of [leather, edges, pageLeft, pageRight, pageTurn, sigil, atlas]) t.dispose();
      stage.dispose();
    },
  };
}
