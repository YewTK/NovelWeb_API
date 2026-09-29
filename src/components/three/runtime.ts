import {
  CanvasTexture,
  Color,
  LinearFilter,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
  type Texture,
} from "three";

/**
 * Shared plumbing for every 3D scene: one renderer per canvas, a pixel ratio
 * clamped for weak devices, and a render loop that only runs while the canvas
 * is on screen and the tab is in front. With reduced motion requested it
 * draws a single still frame and never animates.
 */

export interface Palette {
  accent: Color;
  magic: Color;
  magic2: Color;
  fg: Color;
  bg: Color;
  /** light and sepia themes: additive glows would wash out, so scenes adapt */
  light: boolean;
}

function cssColor(styles: CSSStyleDeclaration, name: string, fallback: string): Color {
  const raw = styles.getPropertyValue(name).trim() || fallback;
  try {
    // three understands #rgb, #rrggbb and rgb(); drop any alpha suffix on hex.
    return new Color(/^#[0-9a-f]{8}$/i.test(raw) ? raw.slice(0, 7) : raw);
  } catch {
    return new Color(fallback);
  }
}

export function readPalette(): Palette {
  const styles = getComputedStyle(document.documentElement);
  const theme = document.documentElement.getAttribute("data-theme");
  return {
    accent: cssColor(styles, "--accent", "#e9b95c"),
    magic: cssColor(styles, "--magic", "#8f7cff"),
    magic2: cssColor(styles, "--magic-2", "#4fd6c8"),
    fg: cssColor(styles, "--fg", "#efe9dc"),
    bg: cssColor(styles, "--bg", "#07080d"),
    light: theme === "light" || theme === "sepia",
  };
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Phones and low-core machines get fewer particles and no MSAA. */
export function isLowPower(): boolean {
  const cores = navigator.hardwareConcurrency ?? 4;
  const small = typeof matchMedia === "function" && matchMedia("(max-width: 640px)").matches;
  return cores <= 4 || small;
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

export interface Stage {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  /** pointer relative to the host, -1..1, eased */
  pointer: { x: number; y: number; tx: number; ty: number };
  size: { w: number; h: number };
  lowPower: boolean;
  reduced: boolean;
  /** draw one frame now, e.g. after a change while paused */
  invalidate: () => void;
  /** starts the loop; `frame` gets elapsed seconds and the step */
  start: (frame: (t: number, dt: number) => void) => void;
  dispose: () => void;
}

export function createStage(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  opts: { fov?: number } = {},
): Stage {
  const lowPower = isLowPower();
  const reduced = prefersReducedMotion();

  const renderer = new WebGLRenderer({
    canvas,
    antialias: !lowPower,
    alpha: true,
    powerPreference: lowPower ? "low-power" : "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const camera = new PerspectiveCamera(opts.fov ?? 35, 1, 0.1, 200);
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const size = { w: 1, h: 1 };

  let frameFn: ((t: number, dt: number) => void) | null = null;
  let raf = 0;
  let onScreen = false;
  let last = 0;
  let elapsed = 0;
  let disposed = false;

  const draw = (dt: number) => {
    frameFn?.(elapsed, dt);
    renderer.render(scene, camera);
  };

  const tick = (now: number) => {
    raf = 0;
    if (disposed) return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    elapsed += dt;
    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 3);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 3);
    draw(dt);
    schedule();
  };

  const running = () => onScreen && document.visibilityState === "visible" && !reduced;

  function schedule() {
    if (!raf && running()) raf = requestAnimationFrame(tick);
  }

  const halt = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  };

  const resize = () => {
    const rect = host.getBoundingClientRect();
    size.w = Math.max(1, Math.round(rect.width));
    size.h = Math.max(1, Math.round(rect.height));
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
    if (!running()) draw(0);
  };

  const ro = new ResizeObserver(resize);
  ro.observe(host);

  const io = new IntersectionObserver(
    ([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) schedule();
      else halt();
    },
    { rootMargin: "80px" },
  );
  io.observe(host);

  const onVisibility = () => {
    if (document.visibilityState === "visible") schedule();
    else halt();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const onPointer = (e: PointerEvent) => {
    if (!onScreen) return;
    const rect = host.getBoundingClientRect();
    pointer.tx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
    pointer.ty = Math.max(-1, Math.min(1, -(((e.clientY - rect.top) / rect.height) * 2 - 1)));
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  resize();

  return {
    renderer,
    scene,
    camera,
    pointer,
    size,
    lowPower,
    reduced,
    invalidate: () => {
      if (!running()) draw(0);
    },
    start: (frame) => {
      frameFn = frame;
      draw(0);
      schedule();
    },
    dispose: () => {
      disposed = true;
      halt();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
      scene.traverse((obj) => {
        const mesh = obj as unknown as {
          geometry?: { dispose: () => void };
          material?: { dispose: () => void; map?: Texture | null } | { dispose: () => void; map?: Texture | null }[];
        };
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const m of mats) {
          m.map?.dispose();
          m.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

/** A canvas-backed texture, drawn once. */
export function canvasTexture(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  paint(ctx, width, height);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

/** Deterministic randomness, so a novel's generated cover never changes. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** Thai has no spaces between words; segment properly where the browser can. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  let words: string[];
  try {
    const seg = new Intl.Segmenter("th", { granularity: "word" });
    words = [...seg.segment(text)].map((s) => s.segment);
  } catch {
    words = text.split(/(\s+)/);
  }
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line + w;
    if (ctx.measureText(next).width > maxWidth && line.trim()) {
      lines.push(line.trim());
      line = w.trimStart();
      if (lines.length === maxLines) break;
    } else {
      line = next;
    }
  }
  if (lines.length < maxLines && line.trim()) lines.push(line.trim());
  if (lines.length === maxLines && words.join("").length > lines.join("").length + 1) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, "…");
  }
  return lines;
}
