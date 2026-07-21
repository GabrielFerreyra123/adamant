// ADAMANT · visor 3D del entramado (F2). Three.js: render de piezas[] con color por tipo,
// orbit/zoom/pan (mouse + touch) y selección táctil que reporta nombre y dimensión de la pieza.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { pieceBoxEngine } from "./geometry.js";
import { TIPO_COLOR } from "./palette.js";

const MM = 0.001; // mm → m

// Dirección de cámara por vista (mundo Y-up). "iso-abajo"/"abajo" miran hacia arriba (Y negativo):
// es la contrapicada con la que se ve un cielorraso desde el ambiente al montarlo.
const VIEW_DIR = {
  frontal:     [0.22, 0.14, 1],
  planta:      [0.18, 1, 0.34],
  "iso-abajo": [0.55, -0.6, 0.78],
  abajo:       [0.12, -1, 0.28],
  iso:         [1, 0.75, 1]     // isométrica del conjunto (ambiente completo): frente-arriba-costado
};
const ORTHO_VIEWS = new Set(["planta", "abajo"]);

export class Viewer {
  constructor(container, { onSelect, snapshot } = {}){
    this.container = container;
    this.onSelect = onSelect || (() => {});
    this.selected = null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a1a22);

    this._iso = false;
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 500);
    this.camera.position.set(4, 3, 5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!snapshot });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = "none";

    this._initControls();

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x24303a, 1.15));
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(3, 6, 4);
    this.scene.add(dir);

    // CONVERSIÓN ÚNICA de ejes: el motor usa Z-up (piso z=0); Three.js usa Y-up.
    // Rotar el grupo raíz −90° en X mapea motor (x,y,z) → mundo (x, z, −y): la altura (Z) del
    // motor pasa a ser la vertical (Y) de Three, y la profundidad (Y) queda en Z. TODAS las piezas
    // se construyen en coordenadas del motor dentro de este grupo y heredan esta transformación.
    this.group = new THREE.Group();
    this.group.rotation.x = -Math.PI / 2;
    this.scene.add(this.group);
    this.grid = new THREE.GridHelper(20, 40, 0x1bb6a4, 0x16313b);
    this.grid.position.y = -0.001;
    this.scene.add(this.grid);

    this.ray = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._down = null;
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", e => { this._down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    el.addEventListener("pointerup", e => this._onTap(e));

    this._resize = () => this.resize();
    window.addEventListener("resize", this._resize);
    this.resize();
    this._animate = this._animate.bind(this);
    this.renderer.setAnimationLoop(this._animate);
  }

  _initControls(){
    if (this.controls) this.controls.dispose();
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;   // pan con dos dedos / botón derecho
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 60;
  }

  // Cambia perspectiva (muro) ↔ ortográfica (piso/planta: sin foreshortening → separación pareja).
  _ensureCamera(iso){
    if (iso === this._iso && this.camera) return;
    this._iso = iso;
    const w = this.container.clientWidth || 320, h = this.container.clientHeight || 320;
    this.camera = iso
      ? new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000)
      : new THREE.PerspectiveCamera(55, w / h, 0.05, 500);
    this._initControls();
  }

  resize(){
    const w = this.container.clientWidth || 320, h = this.container.clientHeight || 320;
    this.renderer.setSize(w, h, false);
    if (this.camera.isOrthographicCamera){
      const r = this._fitR || 3, a = w / h;
      this.camera.left = -r * a; this.camera.right = r * a; this.camera.top = r; this.camera.bottom = -r;
    } else {
      this.camera.aspect = w / h;
    }
    this.camera.updateProjectionMatrix();
  }

  _animate(){ this.controls.update(); this.renderer.render(this.scene, this.camera); }

  // Reemplaza la estructura mostrada por las piezas dadas.
  // Cada caja se construye en COORDENADAS DEL MOTOR (mm→m): tamaño y centro en [x, y(prof), z(alto)].
  // El grupo raíz (rotado −90° en X) las lleva a Y-up de una sola vez.
  // vista: "frontal" (muro, cámara de frente) · "iso" (piso/planta, cámara isométrica).
  // vista: "frontal" (muro, perspectiva de frente) · "planta" (piso, ortográfica cenital tipo plano).
  // vista: "frontal" (muro) · "planta" (piso, cenital) · "iso-abajo"/"abajo" (cielorraso, contrapicada).
  // elevacion (mm, motor Z): eleva el grupo raíz para módulos suspendidos (cielorraso). Genérico: el
  // visor sólo lee metadatos, sin condicionales por tipo de módulo.
  setPieces(piezas, { vista = "frontal", elevacion = 0 } = {}){
    this._vista = vista;
    this._ensureCamera(ORTHO_VIEWS.has(vista));
    this.clearSelection();
    this.group.clear();
    this.group.position.y = (+elevacion || 0) * MM; // el grupo está rotado −90° X → Y es la vertical del mundo
    (piezas || []).forEach(p => {
      let geo, center = null;
      if (p.rev){ geo = this._revGeo(p.rev); } // revestimiento con vanos recortados (Shape + holes)
      else if (p.orient){ geo = this._orientGeo(p); } // pieza DIAGONAL (fleje): caja con base propia
      else {
        const box = pieceBoxEngine(p); center = box.center; // en mm, ejes del motor
        geo = new THREE.BoxGeometry(Math.max(box.size[0]*MM, 0.001), Math.max(box.size[1]*MM, 0.001), Math.max(box.size[2]*MM, 0.001));
      }
      const mat = new THREE.MeshStandardMaterial({ color: TIPO_COLOR[p.tipo] ?? 0x888888, metalness: 0.25, roughness: 0.65, side: p.rev ? THREE.DoubleSide : THREE.FrontSide });
      const mesh = new THREE.Mesh(geo, mat);
      if (center) mesh.position.set(center[0]*MM, center[1]*MM, center[2]*MM); // el grupo hace el Y-up
      mesh.userData = { pieza: p, capa: p.capa || null };
      if (p.capa) mesh.visible = false; // las capas (placa/revestimientos) arrancan APAGADAS
      this.group.add(mesh);
    });
    this.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.group); // ya en mundo Y-up, con la elevación aplicada
    this._box = box.isEmpty() ? null : box;
    if (this._box) this._frame(this._box);
  }

  // Geometría de un revestimiento con vanos recortados: rectángulo del muro (u×v) + un hueco por vano,
  // extruido el espesor. Se orienta con la base (eu,ev,en) y se posiciona en `origin` (coords del motor).
  _revGeo(rev){
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(rev.u, 0); shape.lineTo(rev.u, rev.v); shape.lineTo(0, rev.v); shape.lineTo(0, 0);
    (rev.holes || []).forEach(h => {
      const path = new THREE.Path();
      path.moveTo(h.u0, h.v0); path.lineTo(h.u1, h.v0); path.lineTo(h.u1, h.v1); path.lineTo(h.u0, h.v1); path.lineTo(h.u0, h.v0);
      shape.holes.push(path);
    });
    const geo = new THREE.ExtrudeGeometry(shape, { depth: rev.esp, bevelEnabled: false });
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...rev.eu), new THREE.Vector3(...rev.ev), new THREE.Vector3(...rev.en));
    m.setPosition(rev.origin[0], rev.origin[1], rev.origin[2]);
    geo.applyMatrix4(m);        // local (u,v,esp) → coords del motor (mm)
    geo.scale(MM, MM, MM);      // mm → m, como el resto del grupo
    return geo;
  }

  // Geometría de una pieza DIAGONAL (fleje de arriostramiento). El motor no la describe con un `axis`
  // ortogonal sino con su base real { c, u(largo), v(ancho), n(espesor) }: se arma la caja en ejes
  // locales (largo × ancho × espesor) y se lleva a coords del motor con esa base. La conversión a
  // Y-up sigue siendo única (el grupo raíz rotado −90° X), como el resto de las piezas.
  _orientGeo(p){
    const o = p.orient;
    const geo = new THREE.BoxGeometry(Math.max(p.largo, 0.001), Math.max(o.w, 0.001), Math.max(o.t, 0.001));
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...o.u), new THREE.Vector3(...o.v), new THREE.Vector3(...o.n));
    m.setPosition(o.c[0], o.c[1], o.c[2]);
    geo.applyMatrix4(m);   // local → coords del motor (mm)
    geo.scale(MM, MM, MM); // mm → m
    return geo;
  }

  // Muestra/oculta una capa (placa-piso / rev-ext / rev-int / placa-cielo) sin reconstruir nada.
  setLayerVisible(capa, visible){
    this.group.children.forEach(m => { if (m.userData && m.userData.capa === capa) m.visible = !!visible; });
  }

  // Cambia la vista sin reconstruir la geometría (para el selector de vistas del resultado).
  setView(vista){
    if (!VIEW_DIR[vista]) return;
    this._vista = vista;
    this._ensureCamera(ORTHO_VIEWS.has(vista));
    if (this._box) this._frame(this._box);
  }

  // Encuadra la estructura completa. "frontal": de frente (muro). "iso": isométrica (piso/planta),
  // ajustando por la esfera contenedora (un piso es casi plano: no sirve encuadrar por su alto).
  _frame(box){
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const aspect = (this.container.clientWidth || 1) / (this.container.clientHeight || 1);
    const vfov = (this.camera.fov || 55) * Math.PI / 180;
    const dir = new THREE.Vector3(...(VIEW_DIR[this._vista] || VIEW_DIR.frontal)).normalize();
    this.controls.target.copy(center);
    if (this.camera.isOrthographicCamera){
      const r = this._fitR = size.length() / 2 * 1.15;          // radio de encuadre (ortográfica: planta/abajo)
      this.camera.left = -r * aspect; this.camera.right = r * aspect; this.camera.top = r; this.camera.bottom = -r;
      this.camera.near = 0.01; this.camera.far = r * 20;
      this.camera.position.copy(center).addScaledVector(dir, r * 6);
    } else if (this._vista === "iso-abajo" || this._vista === "iso"){
      // encuadre por la esfera contenedora (cielorraso casi plano · ambiente completo cúbico).
      const dist = (size.length() / 2 / Math.sin(vfov / 2)) * 1.1;
      this.camera.position.copy(center).addScaledVector(dir, dist);
      this.camera.near = Math.max(dist / 200, 0.01); this.camera.far = dist * 20;
    } else {
      const distH = (size.y / 2) / Math.tan(vfov / 2);
      const distW = (size.x / 2) / (Math.tan(vfov / 2) * aspect);
      const dist = Math.max(distH, distW) * 1.28 + size.z; // casi de frente (muro)
      this.camera.position.copy(center).addScaledVector(dir, dist);
      this.camera.near = Math.max(dist / 200, 0.01); this.camera.far = dist * 20;
    }
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  _onTap(e){
    if (!this._down) return;
    const moved = Math.hypot(e.clientX - this._down.x, e.clientY - this._down.y);
    const dt = performance.now() - this._down.t;
    this._down = null;
    if (moved > 8 || dt > 500) return;             // fue orbit/pan, no un tap
    const rect = this.renderer.domElement.getBoundingClientRect();
    this._pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this._pointer, this.camera);
    // recursive=true por robustez; resolvemos a la malla que lleva la pieza (todas se registran igual,
    // sin importar el tipo). Con piezas superpuestas/coplanares (cenefas de borde, viga doble), cada
    // tap sucesivo cicla a la de atrás para poder seleccionarlas todas.
    const meshes = this.ray.intersectObjects(this.group.children, true)
      .map(h => h.object).filter(o => o.visible && o.userData && o.userData.pieza);
    if (!meshes.length){ this.clearSelection(); return; }
    let target = meshes[0];
    if (this.selected && meshes.length > 1){
      const i = meshes.indexOf(this.selected);
      if (i !== -1) target = meshes[(i + 1) % meshes.length];
    }
    this.select(target);
  }

  // Resaltado SUTIL: un emissive teal (el de la marca) en vez de blanco fuerte, que lavaba el color
  // del perfil y hacía perder de vista cuál era la pieza elegida.
  select(mesh){
    this.clearSelection();
    this.selected = mesh;
    mesh.material.emissive = new THREE.Color(0x1bb6a4);
    mesh.material.emissiveIntensity = 0.28;
    this.onSelect(mesh.userData.pieza);
  }
  clearSelection(){
    if (this.selected){ this.selected.material.emissive = new THREE.Color(0x000000); this.selected.material.emissiveIntensity = 0; }
    this.selected = null;
    this.onSelect(null);
  }

  // Render sincrónico + captura (requiere preserveDrawingBuffer). JPEG: el decoder PNG de jsPDF
  // suele romper con los PNG de Three.js; JPEG (fondo opaco) es robusto. Para la imagen del PDF.
  toDataURL(type = "image/jpeg", q = 0.92){ this.renderer.render(this.scene, this.camera); return this.renderer.domElement.toDataURL(type, q); }

  dispose(){
    window.removeEventListener("resize", this._resize);
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
