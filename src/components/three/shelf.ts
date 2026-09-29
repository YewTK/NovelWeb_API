import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  PlaneGeometry,
  PointLight,
  Raycaster,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  type Texture,
} from "three";
import { canvasTexture, createStage, readPalette, seeded, wrapText, type Palette } from "./runtime";

/**
 * A coverflow of real, bound books: the focused one faces the reader, its
 * neighbours stand back on either side, angled in toward it. Drag, swipe or
 * scroll sideways to browse; tap a book to bring it forward, tap again to open.
 */

export interface ShelfBook {
  id: string;
  title: string;
  author?: string;
  cover?: string;
  hue: number;
}

export interface ShelfProps {
  books: ShelfBook[];
  focus: number;
}

export interface ShelfHandle {
  update: (props: ShelfProps) => void;
  setPalette: (p: Palette) => void;
  dispose: () => void;
}

export interface ShelfEvents {
  onFocus: (index: number) => void;
  onOpen: (id: string) => void;
}

const W = 1.3;
const H = 1.95;
const D = 0.26;

/* -------------------------------- textures -------------------------------- */

const FONT = `"Noto Serif Thai", "Leelawadee UI", Tahoma, serif`;

function generatedCover(book: ShelfBook): Texture {
  const rand = seeded(book.hue * 7919 + book.title.length);
  const h = book.hue;
  return canvasTexture(512, 768, (ctx, w, hh) => {
    const g = ctx.createLinearGradient(0, 0, w * 0.6, hh);
    g.addColorStop(0, `hsl(${h} 55% 50%)`);
    g.addColorStop(0.6, `hsl(${(h + 30) % 360} 50% 30%)`);
    g.addColorStop(1, `hsl(${(h + 55) % 360} 45% 16%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, hh);

    // a sun or moon behind the title, and a few stars
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(w * (0.3 + rand() * 0.4), hh * 0.62, 90 + rand() * 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < 40; i++) ctx.fillRect(rand() * w, rand() * hh * 0.5, 2, 2);
    ctx.globalAlpha = 1;

    // gilt frame
    ctx.strokeStyle = "rgba(255, 226, 160, 0.7)";
    ctx.lineWidth = 3;
    ctx.strokeRect(26, 26, w - 52, hh - 52);
    ctx.lineWidth = 1;
    ctx.strokeRect(36, 36, w - 72, hh - 72);

    ctx.fillStyle = "#fff";
    ctx.shadowColor = "rgba(0,0,0,.45)";
    ctx.shadowBlur = 8;
    ctx.font = `600 50px ${FONT}`;
    const lines = wrapText(ctx, book.title, w - 120, 4);
    lines.forEach((line, i) => ctx.fillText(line, 60, 130 + i * 66));

    if (book.author) {
      ctx.font = `400 26px ${FONT}`;
      ctx.fillStyle = "rgba(255,255,255,.82)";
      ctx.fillText(wrapText(ctx, book.author, w - 120, 1)[0] ?? "", 60, hh - 70);
    }
  });
}

function spineTexture(book: ShelfBook): Texture {
  return canvasTexture(128, 768, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, `hsl(${(book.hue + 40) % 360} 45% 18%)`);
    g.addColorStop(0.5, `hsl(${book.hue} 50% 34%)`);
    g.addColorStop(1, `hsl(${(book.hue + 40) % 360} 45% 18%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255, 226, 160, 0.75)";
    ctx.fillRect(0, 60, w, 4);
    ctx.fillRect(0, h - 64, w, 4);
    ctx.save();
    ctx.translate(w / 2 + 14, 100);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = "#fff";
    ctx.font = `600 40px ${FONT}`;
    ctx.fillText(wrapText(ctx, book.title, h - 220, 1)[0] ?? "", 0, 0);
    ctx.restore();
  });
}

function edgeTexture(): Texture {
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = "#efe1c2";
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 3) {
      ctx.fillStyle = `rgba(120, 85, 35, ${0.1 + ((x * 5) % 4) * 0.03})`;
      ctx.fillRect(x, 0, 1, h);
    }
  });
}

function glowTexture(): Texture {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.4, "rgba(255,255,255,0.25)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/* ---------------------------------- scene --------------------------------- */

interface BookMesh {
  id: string;
  group: Group;
  mesh: Mesh;
  front: MeshStandardMaterial;
  textures: Texture[];
  hover: number;
}

export function mount(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  initial: ShelfProps,
  events: ShelfEvents,
): ShelfHandle {
  const stage = createStage(canvas, host, { fov: 30 });
  const { scene, camera } = stage;
  let palette = readPalette();
  let props = initial;

  camera.position.set(0, 0.35, 7.4);
  camera.lookAt(0, 0.1, 0);

  const ambient = new AmbientLight(0xffffff, 0.9);
  const key = new DirectionalLight(0xffffff, 2.2);
  key.position.set(1.5, 3, 5);
  const warm = new PointLight(palette.accent, 12, 10, 1.5);
  warm.position.set(0, 1.8, 2.2);
  const rim = new DirectionalLight(palette.magic, 1.6);
  rim.position.set(-3, 2, -3);
  scene.add(ambient, key, warm, rim);

  const shelfRoot = new Group();
  scene.add(shelfRoot);

  const edges = edgeTexture();
  const glow = glowTexture();
  const edgeMat = new MeshStandardMaterial({ map: edges, roughness: 0.95 });
  const geometry = new BoxGeometry(W, H, D);

  const glowMat = new MeshBasicMaterial({
    map: glow,
    color: palette.accent,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const floorGlow = new Mesh(new PlaneGeometry(3.6, 1.6), glowMat);
  floorGlow.rotation.x = -Math.PI / 2;
  floorGlow.position.set(0, -H / 2 - 0.02, 0.3);
  scene.add(floorGlow);

  const loader = new TextureLoader();
  loader.setCrossOrigin("anonymous");

  let books: BookMesh[] = [];

  const build = (list: ShelfBook[]) => {
    for (const b of books) {
      shelfRoot.remove(b.group);
      b.textures.forEach((t) => t.dispose());
      b.front.dispose();
      (b.mesh.material as MeshStandardMaterial[]).forEach((m) => m !== edgeMat && m.dispose());
    }
    books = list.map((book) => {
      const cover = generatedCover(book);
      const spine = spineTexture(book);
      const front = new MeshStandardMaterial({ map: cover, roughness: 0.55, metalness: 0.05 });
      const spineMat = new MeshStandardMaterial({ map: spine, roughness: 0.6 });
      const back = new MeshStandardMaterial({ color: new Color(`hsl(${book.hue}, 40%, 20%)`), roughness: 0.7 });
      // +x, -x, +y, -y, +z, -z → page edge, spine, top, bottom, front, back
      const mesh = new Mesh(geometry, [edgeMat, spineMat, edgeMat, edgeMat, front, back]);
      const group = new Group();
      group.add(mesh);
      shelfRoot.add(group);
      const entry: BookMesh = { id: book.id, group, mesh, front, textures: [cover, spine], hover: 0 };

      // The reader's own cover, once it arrives. A host without CORS simply
      // keeps the generated one.
      if (book.cover) {
        loader.load(
          book.cover,
          (tex) => {
            tex.colorSpace = SRGBColorSpace;
            entry.textures.push(tex);
            front.map = tex;
            front.needsUpdate = true;
            stage.invalidate();
          },
          undefined,
          () => undefined,
        );
      }
      return entry;
    });
  };
  build(props.books);

  /* focus, dragging and picking */
  let focus = props.focus;
  let target = props.focus;
  let hovered = -1;
  const clampTarget = (v: number) => Math.max(0, Math.min(books.length - 1, v));

  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const pick = (e: PointerEvent): number => {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(books.map((b) => b.mesh), false)[0];
    return hit ? books.findIndex((b) => b.mesh === hit.object) : -1;
  };

  let drag: { x: number; start: number; moved: boolean } | null = null;

  const onDown = (e: PointerEvent) => {
    drag = { x: e.clientX, start: target, moved: false };
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (drag) {
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 6) drag.moved = true;
      if (drag.moved) {
        target = clampTarget(drag.start - dx / Math.max(90, stage.size.w / 7));
        stage.invalidate();
      }
      return;
    }
    const i = pick(e);
    if (i !== hovered) {
      hovered = i;
      canvas.style.cursor = i >= 0 ? "pointer" : "grab";
    }
  };
  const onUp = (e: PointerEvent) => {
    const d = drag;
    drag = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (!d) return;
    if (d.moved) {
      target = Math.round(target);
      events.onFocus(target);
      return;
    }
    const i = pick(e);
    if (i < 0) return;
    if (i === Math.round(focus)) events.onOpen(books[i].id);
    else {
      target = i;
      events.onFocus(i);
    }
  };
  const onLeave = () => {
    hovered = -1;
  };
  const onWheel = (e: WheelEvent) => {
    // Only sideways scrolling browses; vertical wheel keeps scrolling the page.
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    target = clampTarget(target + e.deltaX / 160);
    wheelSettle();
  };
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  const wheelSettle = () => {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      target = Math.round(target);
      events.onFocus(target);
    }, 140);
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.style.cursor = "grab";

  /* palette */
  const applyPalette = (p: Palette) => {
    palette = p;
    warm.color.copy(p.accent);
    rim.color.copy(p.magic);
    glowMat.color.copy(p.accent);
    glowMat.blending = p.light ? NormalBlending : AdditiveBlending;
    glowMat.opacity = p.light ? 0.25 : 0.55;
    glowMat.needsUpdate = true;
    ambient.intensity = p.light ? 1.4 : 0.9;
    stage.invalidate();
  };
  applyPalette(palette);

  /* layout per frame */
  stage.start((t, dt) => {
    // Reduced motion draws single frames with no time step: snap instead of easing.
    focus += (target - focus) * (stage.reduced ? 1 : Math.min(1, dt * 7));
    const narrow = stage.size.w < 640;
    const gap = narrow ? 0.95 : 1.15;

    books.forEach((b, i) => {
      const offset = i - focus;
      const abs = Math.abs(offset);
      const sign = Math.sign(offset);
      const side = Math.min(1, abs);
      b.hover += ((i === hovered && !drag ? 1 : 0) - b.hover) * Math.min(1, dt * 8);

      b.group.position.x = sign * (side * (narrow ? 1.25 : 1.55) + Math.max(0, abs - 1) * gap);
      b.group.position.z = -side * 1.35 - Math.max(0, abs - 1) * 0.4 + b.hover * 0.15;
      b.group.position.y = Math.sin(t * 0.9 + i) * 0.03 + b.hover * 0.08;
      // Turned toward the centre, but not so far that the page block
      // outweighs the cover.
      b.group.rotation.y = -sign * side * 0.78 + (abs < 0.5 ? stage.pointer.x * 0.12 : 0);
      b.group.rotation.x = abs < 0.5 ? -stage.pointer.y * 0.06 : 0;
      b.group.visible = abs < 7;
      const dim = 1 - Math.min(0.55, Math.max(0, abs - 0.4) * 0.18);
      b.front.color.setScalar(dim);
    });

    floorGlow.material.opacity = (palette.light ? 0.22 : 0.5) + Math.sin(t * 1.4) * 0.05;
  });

  return {
    update: (next) => {
      const changed =
        next.books.length !== props.books.length ||
        next.books.some((b, i) => {
          const was = props.books[i];
          return !was || was.id !== b.id || was.title !== b.title || was.cover !== b.cover;
        });
      props = next;
      if (changed) build(next.books);
      target = clampTarget(next.focus);
      stage.invalidate();
    },
    setPalette: applyPalette,
    dispose: () => {
      if (settleTimer) clearTimeout(settleTimer);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
      for (const b of books) b.textures.forEach((t) => t.dispose());
      edges.dispose();
      glow.dispose();
      geometry.dispose();
      stage.dispose();
    },
  };
}
