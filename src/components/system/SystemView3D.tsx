import { useEffect, useRef, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { BODIES, bodyById, type BodyInfo } from "@/lib/system";
import { BODY_TEXTURES } from "@/lib/system-art";

export interface SystemLayers {
  labels: boolean;
  ships: boolean;
  locks: boolean;
}

export interface BodyOverlay {
  locked: boolean;
  ships: ReactNode;
}

/** Escala artística: proporciones creíbles pero todo visible y pulsable. */
const orbitRadius = (o: number) => 13 + o * 7.2;
const bodyRadius = (b: BodyInfo) => (b.kind === "moon" ? 0.45 + b.size * 0.9 : 0.9 + b.size * 1.35);
const moonDistance = (b: BodyInfo) => (b.id.endsWith("b") ? 4.4 : 3.2);
const period = (b: BodyInfo) =>
  b.kind === "moon" ? (b.id.endsWith("b") ? 26 : 18) : 90 + b.orbit * 55;
const phase0 = (b: BodyInfo) => b.orbit * 1.7 + (b.id.endsWith("b") ? Math.PI : 0);
const GAS = new Set(["medusa-6", "medusa-7", "medusa-9"]);
const RINGED = new Set(["medusa-6", "medusa-9"]);
const ATMO: Record<string, string> = {
  "medusa-2": "#f0b070",
  "medusa-3": "#ff8a60",
  "medusa-4": "#6fb6ff",
  "medusa-5": "#7fd0ff",
  "medusa-6": "#ffcf8a",
  "medusa-7": "#7fffe0",
  "medusa-8": "#cfe9ff",
  "medusa-9": "#c9a0ff",
};

/** Posición de un cuerpo en el plano de la eclíptica en el instante t (s). */
function bodyPos(b: BodyInfo, t: number): [number, number] {
  if (b.kind === "moon" && b.parent) {
    const p = bodyPos(bodyById(b.parent)!, t);
    const a = (t * 2 * Math.PI) / period(b) + phase0(b);
    const r = moonDistance(b) + bodyRadius(bodyById(b.parent)!) * 0.6;
    return [p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r];
  }
  const a = (t * 2 * Math.PI) / period(b) + phase0(b);
  const r = orbitRadius(b.orbit);
  return [Math.cos(a) * r, Math.sin(a) * r];
}

function radialTexture(stops: [number, string][], size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

/** Nebulosa procedimental para el fondo (nubes suaves de color sobre negro). */
function nebulaTexture() {
  const w = 2048;
  const h = 1024;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, w, h);
  let s = 1234;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const blobs: [number, number, number, string][] = [];
  const palette = ["60,40,120", "20,60,120", "120,40,70", "30,90,110", "90,60,30"];
  for (let i = 0; i < 70; i++) {
    const band = h * 0.5 + (rnd() - 0.5) * h * 0.45;
    blobs.push([rnd() * w, band, 60 + rnd() * 260, palette[Math.floor(rnd() * palette.length)]!]);
  }
  g.globalCompositeOperation = "lighter";
  for (const [x, y, r, col] of blobs) {
    for (const dx of [-w, 0, w]) {
      const gr = g.createRadialGradient(x + dx, y, 0, x + dx, y, r);
      gr.addColorStop(0, `rgba(${col},0.10)`);
      gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x + dx, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Estrellas finas pintadas en la textura (polvo estelar lejano)
  for (let i = 0; i < 9000; i++) {
    const y = h * 0.5 + (rnd() - 0.5) * h * (rnd() < 0.6 ? 0.5 : 1);
    const a = 0.15 + rnd() * 0.5;
    g.fillStyle = `rgba(255,255,255,${a})`;
    g.fillRect(rnd() * w, y, rnd() < 0.97 ? 1 : 2, 1);
  }
  return c;
}

function ringTexture(tint: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 8;
  const g = c.getContext("2d")!;
  let s = 99;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let x = 0; x < 512; x++) {
    const edge = Math.min(x / 40, (512 - x) / 30, 1);
    const a =
      edge *
      (0.3 + 0.5 * rnd()) *
      (Math.sin(x * 0.031) * 0.2 + Math.sin(x * 0.17) * 0.1 + 0.7) *
      (x > 300 && x < 330 ? 0.15 : 1);
    g.fillStyle = tint;
    g.globalAlpha = Math.max(0, a);
    g.fillRect(x, 0, 1, 8);
  }
  return c;
}

/**
 * Sistema Medusa en 3D: sol con resplandor, planetas iluminados con sus texturas, lunas, anillos,
 * cinturón de asteroides y fondo estelar. Arrastra para girar, rueda o pellizco para acercar;
 * al pulsar un cuerpo la cámara vuela hacia él (doble clic: abrir sus regiones).
 */
export function SystemView3D({
  overlays,
  layers,
  selected,
  onSelect,
  onOpen,
  resetSignal,
}: {
  overlays: Record<string, BodyOverlay>;
  layers: SystemLayers;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onOpen: (id: string) => void;
  resetSignal: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const api = useRef<{ focus: (id: string | null) => void; reset: () => void } | null>(null);
  const cbs = useRef({ onSelect, onOpen, overlays, layers });
  cbs.current = { onSelect, onOpen, overlays, layers };
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};
    void (async () => {
      // Solo en el navegador: three.js no entra en el paquete del servidor
      if (import.meta.env.SSR) return;
      const [THREE, { OrbitControls }] = await Promise.all([
        import.meta.env.SSR ? Promise.reject(new Error("ssr")) : import("three"),
        import.meta.env.SSR
          ? Promise.reject(new Error("ssr"))
          : import("three/examples/jsm/controls/OrbitControls.js"),
      ]);
      if (disposed) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        });
      } catch {
        setFailed(true);
        return;
      }
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.domElement.style.display = "block";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.touchAction = "none";
      el.prepend(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 4000);
      const HOME_BASE = new THREE.Vector3(0, 70, 118);
      const HOME = HOME_BASE.clone();
      camera.position.copy(HOME);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.07;
      controls.minDistance = 6;
      controls.maxDistance = 260;
      controls.maxPolarAngle = Math.PI * 0.49;
      controls.rotateSpeed = 0.6;
      controls.zoomSpeed = 0.8;
      controls.enablePan = false;
      controls.autoRotate = !reduced;
      controls.autoRotateSpeed = 0.12;

      const loader = new THREE.TextureLoader();
      const disposables: { dispose: () => void }[] = [];
      const track = <T extends { dispose: () => void }>(x: T) => {
        disposables.push(x);
        return x;
      };
      const canvasTex = (c: HTMLCanvasElement, srgb = true) => {
        const t = track(new THREE.CanvasTexture(c));
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        return t;
      };

      // Fondo: nebulosa y estrellas
      const sky = new THREE.Mesh(
        track(new THREE.SphereGeometry(1800, 48, 24)),
        track(
          new THREE.MeshBasicMaterial({
            map: canvasTex(nebulaTexture()),
            side: THREE.BackSide,
            depthWrite: false,
          }),
        ),
      );
      sky.rotation.z = 0.35;
      scene.add(sky);
      {
        const n = 2600;
        const pos = new Float32Array(n * 3);
        const col = new Float32Array(n * 3);
        let s = 7;
        const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
        const tints = [
          [1, 1, 1],
          [0.75, 0.85, 1],
          [1, 0.9, 0.75],
          [1, 0.75, 0.65],
        ];
        for (let i = 0; i < n; i++) {
          const u = rnd() * 2 - 1;
          const th = rnd() * Math.PI * 2;
          const r = 900 + rnd() * 600;
          const q = Math.sqrt(1 - u * u);
          pos.set([Math.cos(th) * q * r, u * r, Math.sin(th) * q * r], i * 3);
          const tt = tints[Math.floor(rnd() * tints.length)]!;
          const b = 0.4 + rnd() * 0.6;
          col.set([tt[0]! * b, tt[1]! * b, tt[2]! * b], i * 3);
        }
        const geo = track(new THREE.BufferGeometry());
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
        const star = canvasTex(
          radialTexture(
            [
              [0, "rgba(255,255,255,1)"],
              [0.25, "rgba(255,255,255,0.6)"],
              [1, "rgba(255,255,255,0)"],
            ],
            64,
          ),
        );
        scene.add(
          new THREE.Points(
            geo,
            track(
              new THREE.PointsMaterial({
                size: 2.6,
                map: star,
                vertexColors: true,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                sizeAttenuation: true,
              }),
            ),
          ),
        );
      }

      // Sol: superficie animada + coronas
      const sunMat = track(
        new THREE.ShaderMaterial({
          uniforms: { t: { value: 0 } },
          vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix*normal); vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
          fragmentShader: `
            uniform float t; varying vec3 vN; varying vec3 vP;
            float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
            float n(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
              return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                         mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
            void main(){
              vec3 p = vP*0.9;
              float g = n(p*1.6 + t*0.15)*0.55 + n(p*3.5 - t*0.25)*0.3 + n(p*8.0 + t*0.4)*0.15;
              float rim = pow(1.0 - abs(dot(vN, vec3(0,0,1))), 1.5);
              vec3 c = mix(vec3(1.0,0.55,0.12), vec3(1.0,0.92,0.6), g);
              c = mix(c, vec3(1.0,0.4,0.1), rim*0.6);
              gl_FragColor = vec4(c*1.6, 1.0);
            }`,
        }),
      );
      const SUN_R = 6.5;
      const sun = new THREE.Mesh(track(new THREE.SphereGeometry(SUN_R, 64, 32)), sunMat);
      scene.add(sun);
      const glow = (size: number, stops: [number, string][]) => {
        const sp = new THREE.Sprite(
          track(
            new THREE.SpriteMaterial({
              map: canvasTex(radialTexture(stops, 256)),
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              transparent: true,
            }),
          ),
        );
        sp.scale.set(size, size, 1);
        scene.add(sp);
        return sp;
      };
      glow(46, [
        [0, "rgba(255,245,215,1)"],
        [0.15, "rgba(255,205,110,0.7)"],
        [0.4, "rgba(255,130,50,0.2)"],
        [1, "rgba(255,90,20,0)"],
      ]);
      const corona = glow(90, [
        [0, "rgba(255,200,120,0.35)"],
        [0.3, "rgba(255,140,60,0.08)"],
        [1, "rgba(255,100,40,0)"],
      ]);
      scene.add(new THREE.PointLight(0xfff1dc, 3.2, 0, 0));
      scene.add(new THREE.AmbientLight(0x2a3a52, 0.5));

      // Órbitas
      for (const o of [...new Set(BODIES.filter((b) => b.kind === "planet").map((b) => b.orbit))]) {
        const pts = Array.from({ length: 181 }, (_, i) => {
          const a = (i / 180) * Math.PI * 2;
          return new THREE.Vector3(Math.cos(a) * orbitRadius(o), 0, Math.sin(a) * orbitRadius(o));
        });
        scene.add(
          new THREE.Line(
            track(new THREE.BufferGeometry().setFromPoints(pts)),
            track(
              new THREE.LineBasicMaterial({ color: 0x7fb7ff, transparent: true, opacity: 0.11 }),
            ),
          ),
        );
      }

      // Cinturón de asteroides entre Medusa V y VI
      {
        const n = 2400;
        const pos = new Float32Array(n * 3);
        let s = 3;
        const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
        const r0 = (orbitRadius(5) + orbitRadius(6)) / 2;
        for (let i = 0; i < n; i++) {
          const a = rnd() * Math.PI * 2;
          const r = r0 + (rnd() + rnd() - 1) * 3.2;
          pos.set([Math.cos(a) * r, (rnd() - 0.5) * 0.9, Math.sin(a) * r], i * 3);
        }
        const geo = track(new THREE.BufferGeometry());
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const belt = new THREE.Points(
          geo,
          track(
            new THREE.PointsMaterial({
              size: 0.16,
              color: 0x9a8f80,
              transparent: true,
              opacity: 0.75,
            }),
          ),
        );
        scene.add(belt);
        disposables.push({ dispose: () => scene.remove(belt) });
        (scene.userData as { belt?: unknown }).belt = belt;
      }

      // Planetas y lunas
      type Node = {
        b: BodyInfo;
        group: InstanceType<typeof THREE.Group>;
        mesh: InstanceType<typeof THREE.Mesh>;
        hit: InstanceType<typeof THREE.Mesh>;
        r: number;
      };
      const nodes: Node[] = [];
      const atmoMat = (color: string) =>
        track(
          new THREE.ShaderMaterial({
            uniforms: { c: { value: new THREE.Color(color) } },
            vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
            fragmentShader: `uniform vec3 c; varying vec3 vN; varying vec3 vW;
              void main(){ vec3 V = normalize(cameraPosition - vW); float f = pow(1.0 - max(dot(vN, V), 0.0), 3.0);
                float lit = clamp(dot(vN, normalize(-vW))*0.8 + 0.35, 0.0, 1.0);
                gl_FragColor = vec4(c, f*lit*0.9); }`,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.BackSide,
          }),
        );
      for (const b of BODIES) {
        const r = bodyRadius(b);
        const group = new THREE.Group();
        const tex = loader.load(BODY_TEXTURES[b.id]!, () => renderOnce());
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        track(tex);
        const mat = track(
          new THREE.MeshStandardMaterial({
            map: tex,
            roughness: GAS.has(b.id) ? 0.85 : 1,
            metalness: 0,
          }),
        );
        const mesh = new THREE.Mesh(track(new THREE.SphereGeometry(r, 64, 32)), mat);
        mesh.rotation.z = 0.18 + (b.orbit % 3) * 0.08;
        group.add(mesh);
        if (ATMO[b.id] && b.kind === "planet") {
          const atmo = new THREE.Mesh(
            track(new THREE.SphereGeometry(r * 1.06, 48, 24)),
            atmoMat(ATMO[b.id]!),
          );
          group.add(atmo);
        }
        if (RINGED.has(b.id)) {
          const rg = track(new THREE.RingGeometry(r * 1.45, r * 2.4, 128, 1));
          const uv = rg.attributes["uv"]!;
          const p = rg.attributes["position"]!;
          const v = new THREE.Vector3();
          for (let i = 0; i < p.count; i++) {
            v.fromBufferAttribute(p, i);
            uv.setXY(i, (v.length() - r * 1.45) / (r * 0.95), 0.5);
          }
          const ring = new THREE.Mesh(
            rg,
            track(
              new THREE.MeshBasicMaterial({
                map: canvasTex(ringTexture(b.id === "medusa-6" ? "#e9cfa0" : "#c9b5ff")),
                color: 0x9a9a9a,
                transparent: true,
                opacity: 0.7,
                side: THREE.DoubleSide,
                depthWrite: false,
              }),
            ),
          );
          ring.rotation.x = -Math.PI / 2 + 0.35;
          group.add(ring);
        }
        // Zona de pulsación más grande para cuerpos pequeños
        const hit = new THREE.Mesh(
          track(new THREE.SphereGeometry(Math.max(r * 1.6, 1.8), 12, 8)),
          track(new THREE.MeshBasicMaterial({ visible: false })),
        );
        hit.userData["id"] = b.id;
        group.add(hit);
        scene.add(group);
        nodes.push({ b, group, mesh, hit, r });
      }

      // Selección
      const ring = new THREE.Mesh(
        track(new THREE.RingGeometry(1, 1.015, 128)),
        track(
          new THREE.MeshBasicMaterial({
            color: 0x9fe8ff,
            transparent: true,
            opacity: 0.55,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        ),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      scene.add(ring);

      // Cámara: vuelo suave hacia un cuerpo
      let focusId: string | null = null;
      let fly: {
        from: InstanceType<typeof THREE.Vector3>;
        to: InstanceType<typeof THREE.Vector3>;
        t0: number;
        dur: number;
        camFrom: InstanceType<typeof THREE.Vector3>;
        camOff: InstanceType<typeof THREE.Vector3>;
      } | null = null;
      const tmp = new THREE.Vector3();
      const worldOf = (id: string) => {
        const n = nodes.find((x) => x.b.id === id);
        return n ? n.group.position.clone() : new THREE.Vector3();
      };
      const focus = (id: string | null) => {
        focusId = id;
        controls.autoRotate = !id && !reduced;
        const target = id ? worldOf(id) : new THREE.Vector3();
        const n = id ? nodes.find((x) => x.b.id === id) : null;
        const dist = n
          ? Math.max(8, n.r * (n.b.kind === "moon" ? 9 : 7) + (RINGED.has(n.b.id) ? 6 : 0))
          : HOME.length();
        const dir = id
          ? camera.position.clone().sub(controls.target).normalize()
          : HOME.clone().normalize();
        if (id && dir.y < 0.25) dir.y = 0.35;
        dir.normalize();
        fly = {
          from: controls.target.clone(),
          to: target,
          t0: performance.now(),
          dur: 1400,
          camFrom: camera.position.clone(),
          camOff: dir.multiplyScalar(dist),
        };
      };
      api.current = { focus, reset: () => focus(null) };

      // Interacción
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      let down: { x: number; y: number; t: number } | null = null;
      const pick = (ev: PointerEvent | MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        ndc.set(
          ((ev.clientX - rect.left) / rect.width) * 2 - 1,
          -((ev.clientY - rect.top) / rect.height) * 2 + 1,
        );
        ray.setFromCamera(ndc, camera);
        const hits = ray.intersectObjects(
          nodes.map((n) => n.hit),
          false,
        );
        return (hits[0]?.object.userData["id"] as string | undefined) ?? null;
      };
      const onDown = (ev: PointerEvent) => {
        down = { x: ev.clientX, y: ev.clientY, t: performance.now() };
      };
      const onUp = (ev: PointerEvent) => {
        if (!down) return;
        const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6;
        down = null;
        if (moved) return;
        const id = pick(ev);
        if (id) cbs.current.onSelect(id);
      };
      const onDbl = (ev: MouseEvent) => {
        const id = pick(ev);
        if (id && bodyById(id)?.playable) cbs.current.onOpen(id);
      };
      const onMove = (ev: PointerEvent) => {
        if (down) return;
        renderer.domElement.style.cursor = pick(ev) ? "pointer" : "grab";
      };
      renderer.domElement.addEventListener("pointerdown", onDown);
      renderer.domElement.addEventListener("pointerup", onUp);
      renderer.domElement.addEventListener("dblclick", onDbl);
      renderer.domElement.addEventListener("pointermove", onMove);

      let sized = false;
      const resize = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        // En pantallas estrechas, alejar para que quepa el sistema
        camera.fov = w / h < 1 ? 55 : 38;
        camera.updateProjectionMatrix();
        // En vertical, alejar la vista general para que quepan las órbitas exteriores
        const k = w / h < 1 ? Math.min(2.1, 1.1 / (w / h)) : 1;
        HOME.copy(HOME_BASE).multiplyScalar(k);
        if (!sized) camera.position.copy(HOME);
        sized = true;
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      let visible = true;
      const io = new IntersectionObserver(([e]) => {
        visible = !!e?.isIntersecting;
      });
      io.observe(el);

      const start = performance.now();
      // Hora del sistema: avanza solo, pero arranca en una posición fija por día para que todos lo vean igual
      const epoch = (Date.now() / 1000) % 100000;
      let raf = 0;
      const v3 = new THREE.Vector3();
      const draw = () => {
        const now = performance.now();
        const t = epoch + (reduced ? 0 : (now - start) / 1000);
        sunMat.uniforms["t"]!.value = t;
        corona.scale.setScalar(90 + Math.sin(t * 0.7) * 4);
        const belt = (scene.userData as { belt?: InstanceType<typeof THREE.Points> }).belt;
        if (belt) belt.rotation.y = -t * 0.004;
        for (const n of nodes) {
          const [x, z] = bodyPos(n.b, t);
          n.group.position.set(x, 0, z);
          n.mesh.rotation.y = t * (GAS.has(n.b.id) ? 0.25 : 0.12);
          const dim = cbs.current.layers.locks && cbs.current.overlays[n.b.id]?.locked;
          (n.mesh.material as InstanceType<typeof THREE.MeshStandardMaterial>).color.setScalar(
            dim ? 0.45 : 1,
          );
        }
        if (fly) {
          const k = Math.min(1, (now - fly.t0) / fly.dur);
          const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
          const to = focusId ? worldOf(focusId) : fly.to;
          controls.target.lerpVectors(fly.from, to, e);
          tmp.copy(to).add(fly.camOff);
          camera.position.lerpVectors(fly.camFrom, tmp, e);
          if (k >= 1) fly = null;
        } else if (focusId) {
          // Seguir al cuerpo mientras orbita
          const to = worldOf(focusId);
          const delta = to.clone().sub(controls.target);
          controls.target.add(delta);
          camera.position.add(delta);
        }
        if (focusId) {
          const n = nodes.find((x) => x.b.id === focusId)!;
          ring.visible = true;
          ring.position.copy(n.group.position);
          const s = n.r * (RINGED.has(n.b.id) ? 2.6 : 1.35);
          ring.scale.setScalar(s * (1 + Math.sin(t * 3) * 0.03));
        } else ring.visible = false;
        controls.update();
        renderer.render(scene, camera);
        // Etiquetas HTML pegadas a cada cuerpo
        const w = el.clientWidth;
        const h = el.clientHeight;
        for (const n of nodes) {
          const lab = labelRefs.current[n.b.id];
          if (!lab) continue;
          v3.copy(n.group.position);
          v3.y -= n.r * 1.25;
          v3.project(camera);
          const behind = v3.z > 1;
          const dCam = camera.position.distanceTo(n.group.position);
          lab.style.transform = `translate(${((v3.x + 1) / 2) * w}px, ${((1 - v3.y) / 2) * h}px) translate(-50%, 0)`;
          lab.style.opacity = behind
            ? "0"
            : n.b.kind === "moon" && dCam > 90 && focusId !== n.b.id && focusId !== n.b.parent
              ? "0"
              : "1";
        }
      };
      const loop = () => {
        if (visible && !document.hidden) draw();
        raf = requestAnimationFrame(loop);
      };
      const renderOnce = () => {
        if (!disposed) draw();
      };
      raf = requestAnimationFrame(loop);
      setReady(true);

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        io.disconnect();
        controls.dispose();
        renderer.domElement.removeEventListener("pointerdown", onDown);
        renderer.domElement.removeEventListener("pointerup", onUp);
        renderer.domElement.removeEventListener("dblclick", onDbl);
        renderer.domElement.removeEventListener("pointermove", onMove);
        for (const d of disposables) d.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        api.current = null;
      };
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (ready) api.current?.focus(selected);
  }, [selected, ready]);
  useEffect(() => {
    if (ready && resetSignal) api.current?.reset();
  }, [resetSignal, ready]);

  return (
    <div ref={host} className="absolute inset-0 overflow-hidden bg-black">
      {failed && (
        <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
          Tu navegador no permite gráficos 3D (WebGL). Usa la lista de planetas de abajo.
        </p>
      )}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden={!layers.labels && !layers.ships && !layers.locks}
      >
        {BODIES.map((b) => {
          const o = overlays[b.id];
          const showName = layers.labels;
          const showLock = layers.locks && o?.locked;
          const showShips = layers.ships && !!o?.ships;
          if (!showName && !showLock && !showShips)
            return <div key={b.id} ref={(x) => void (labelRefs.current[b.id] = x)} />;
          return (
            <div
              key={b.id}
              ref={(x) => void (labelRefs.current[b.id] = x)}
              className="absolute left-0 top-0 flex flex-col items-center gap-0.5 transition-opacity duration-300 will-change-transform"
            >
              {(showName || showLock) && (
                <span
                  className={`flex items-center gap-1 whitespace-nowrap font-mono uppercase tracking-[0.2em] [text-shadow:0_0_6px_#000,0_0_2px_#000] ${b.kind === "moon" ? "text-[8px] text-slate-300/80" : "text-[10px] text-slate-100/90"} ${selected === b.id ? "text-cyan-200" : ""} ${o?.locked && layers.locks ? "opacity-60" : ""}`}
                >
                  {showLock && <Lock className="size-2.5" aria-label="bloqueado" />}
                  {showName && b.name.replace(" (Medusa I)", "")}
                </span>
              )}
              {showShips && <span className="flex gap-0.5">{o!.ships}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
