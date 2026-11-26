import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';

const app = document.querySelector('#app');
const state = {
  mode: 'buyer', tab: 'explore', selected: new Set(), owned: [],
  plots: {}, blocks: {}, blockColors: {}, paletteName: 'meadow', biome: 'meadow', blockType: 'grass',
  camera: null, controls: null, renderer: null, scene: null, raycaster: new THREE.Raycaster(),
  pointer: new THREE.Vector2(), groundMeshes: [], voxelMeshes: [], previewUrl: '', grassTiles: null, grassBaseColors: [], lastGrassUpdate: 0
};
const SIZE = 6, PLOT = 10, ROAD = 5, STEP = PLOT + ROAD;
const BLOCKS = {
  grass: { color: 0x8eaa83, label: 'Grass' }, soil: { color: 0x92745b, label: 'Soil' },
  stone: { color: 0x929492, label: 'Stone' }, sand: { color: 0xd4c49a, label: 'Sand' },
  wood: { color: 0x9a7653, label: 'Wood' }, white: { color: 0xe8e7e1, label: 'White' },
  dark: { color: 0x424644, label: 'Dark' }, leaf: { color: 0x547b5d, label: 'Leaves' }
};
const PALETTES = {
  meadow: { label: 'Meadow', colors: { grass:'#8ee35b', soil:'#a96f45', stone:'#9aa3a8', sand:'#f1d77a', wood:'#95613d', white:'#f4f1df', dark:'#424b50', leaf:'#45ad55' } },
  candy: { label: 'Candy', colors: { grass:'#8be0a0', soil:'#c98b73', stone:'#a6b9d7', sand:'#ffe09b', wood:'#a66e83', white:'#fff4e8', dark:'#55516b', leaf:'#65c9b2' } },
  ocean: { label: 'Ocean', colors: { grass:'#55c6a4', soil:'#a77c63', stone:'#8ca9bd', sand:'#f2d69b', wood:'#89644f', white:'#e8f5f4', dark:'#344e62', leaf:'#299b83' } },
  sunset: { label: 'Sunset', colors: { grass:'#b5d957', soil:'#b87550', stone:'#aaa0a0', sand:'#f5c56e', wood:'#8f5946', white:'#fff0d5', dark:'#55424a', leaf:'#83ae4d' } },
  monochrome: { label: 'Soft', colors: { grass:'#9fc7a1', soil:'#a58b78', stone:'#aeb2b0', sand:'#ded0a8', wood:'#8b7664', white:'#e8e8e2', dark:'#555956', leaf:'#789c79' } }
};
const BIOMES = { meadow: 0x8ee35b, autumn: 0xb88b60, snow: 0xd9dedc, desert: 0xcdb77f };
const key = (x,z) => x + ',' + z;
const plotId = (x,z) => String.fromCharCode(65 + z) + (x + 1);
const readStore = () => { try { return JSON.parse(localStorage.getItem('bitofland-demo') || '{}'); } catch { return {}; } };
const saved = readStore();
Object.assign(state, { owned: saved.owned || [], plots: saved.plots || {}, blocks: saved.blocks || {}, blockColors: saved.blockColors || { ...PALETTES.meadow.colors }, paletteName: saved.paletteName || 'meadow' });
const persist = () => localStorage.setItem('bitofland-demo', JSON.stringify({ owned: state.owned, plots: state.plots, blocks: state.blocks, blockColors: state.blockColors, paletteName: state.paletteName }));
const blockColor = type => state.blockColors[type] || PALETTES.meadow.colors[type];
function updatePlacedBlockColors() {
  state.voxelMeshes.forEach(mesh => mesh.material.color.set(state.blockColors[mesh.userData.type] || blockColor('grass')));
}
const isOwned = id => state.owned.includes(id);
const isAvailable = id => state.plots[id]?.status !== 'unavailable' && !isOwned(id);
const plotCoords = id => ({ x: id.charCodeAt(0)-65, z: Number(id.slice(1))-1 });

app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#" aria-label="bit of land home"><span class="brand-mark">b.</span><span>bit of land</span></a>
    <nav class="main-nav">
      <button data-tab="explore" class="nav-link active">Explore</button>
      <button data-tab="build" class="nav-link">Build</button>
      <button data-tab="myland" class="nav-link">My land <span class="count" id="owned-count">0</span></button>
    </nav>
    <div class="top-actions">
      <span class="mode-label">MODE</span>
      <select id="mode-select" aria-label="Choose mode"><option value="buyer">Buyer</option><option value="admin">Admin</option></select>
      <button class="icon-button" id="help-btn" title="About this prototype">?</button>
    </div>
  </header>
  <main>
    <section class="intro">
      <div><p class="eyebrow" id="eyebrow">A SHARED WORLD, MADE BY YOU</p><h1 id="page-title">Find your little piece<br/>of somewhere.</h1><p class="subhead" id="page-subtitle">Explore the map, choose a plot, and make it your own.</p></div>
      <div class="world-stats"><div><strong id="available-count">36</strong><span>plots to discover</span></div><div><strong>10 × 10</strong><span>blocks per plot</span></div></div>
    </section>
    <section class="workspace">
      <div class="world-panel">
        <div class="panel-toolbar"><div><span class="live-dot"></span><span id="map-caption">THE WORLD · STARTER MAP</span></div><div class="toolbar-actions"><button id="reset-camera" class="small-button">Reset view ↗</button></div></div>
        <div id="world-canvas" class="world-canvas"><div class="loading">Preparing your world…</div></div>
        <div class="map-legend"><span><i class="legend-dot available"></i>Available</span><span><i class="legend-dot owned"></i>Owned</span><span><i class="legend-dot selected"></i>Selected</span><span><i class="legend-dot road"></i>Shared grass · not buildable</span></div>
      </div>
      <aside class="side-panel" id="side-panel"></aside>
    </section>
    <section class="below-content" id="below-content"></section>
  </main>
  <footer><span>bit of land</span><span>A LITTLE SPACE. A WORLD OF POSSIBILITIES.</span><span>PROTOTYPE 0.1</span></footer>
  <div class="toast" id="toast" role="status"></div>
  <dialog id="modal"><div class="modal-inner"><button class="modal-close" id="modal-close">×</button><div id="modal-content"></div></div></dialog>
`;

const canvasHost = document.querySelector('#world-canvas');
const SKY_COLOR = 0x83cfff;
const scene = new THREE.Scene(); scene.background = new THREE.Color(SKY_COLOR); scene.fog = new THREE.Fog(SKY_COLOR, 150, 300); state.scene = scene;
const camera = new THREE.OrthographicCamera(-75, 75, 75, -75, 0.1, 800);
camera.position.set(125, 112, 145);
camera.lookAt(42.5, 0, 42.5);
state.camera = camera;
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(42.5, 0, 42.5);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.enableRotate = true;
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.enableZoom = true;
controls.minZoom = 0.55;
controls.maxZoom = 3.5;
controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
controls.touches.ONE = THREE.TOUCH.ROTATE;
controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
state.controls = controls;
controls.update();
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setSize(canvasHost.clientWidth, canvasHost.clientHeight); canvasHost.innerHTML=''; canvasHost.appendChild(renderer.domElement); state.renderer = renderer;
scene.add(new THREE.HemisphereLight(0xffffff, 0x85877f, 2.0));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(45,90,35); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); scene.add(sun);
// A single floating island slab; no external floor or grid.
const islandBase = new THREE.Mesh(
  new THREE.BoxGeometry(SIZE * STEP - ROAD, 1, SIZE * STEP - ROAD),
  new THREE.MeshStandardMaterial({ color: 0x9b6845, roughness: 1 })
);
islandBase.position.set(42.5, -0.5, 42.5);
islandBase.receiveShadow = true;
islandBase.castShadow = true;
scene.add(islandBase);
// Narrower earth-and-rock layers give the terrain a tapered floating-island silhouette.
const islandLayers = [
  { w: 76, h: 1.35, d: 76, y: -1.55, color: 0x86583e },
  { w: 62, h: 1.55, d: 62, y: -2.95, color: 0x6f6256 },
  { w: 43, h: 1.25, d: 43, y: -4.25, color: 0x5b5b57 }
];
for (const layer of islandLayers) {
  const rock = new THREE.Mesh(
    new THREE.BoxGeometry(layer.w, layer.h, layer.d),
    new THREE.MeshStandardMaterial({ color: layer.color, roughness: 1 })
  );
  rock.position.set(42.5, layer.y, 42.5);
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);
}
const plotGroup = new THREE.Group(); scene.add(plotGroup); const buildGroup = new THREE.Group(); scene.add(buildGroup);
const plotMeshes = [];
function makeWorld() {
  while(plotGroup.children.length) plotGroup.remove(plotGroup.children[0]);
  while(buildGroup.children.length) buildGroup.remove(buildGroup.children[0]);
  plotMeshes.length=0; state.groundMeshes=[]; state.voxelMeshes=[]; state.grassTiles=null; state.grassBaseColors=[];
  // One small grass cube per surface cell. The fixed palette creates a natural,
  // tile-by-tile pattern without textures or gradients.
  const grassTones = [0x76d64b, 0x83df52, 0x91e45c, 0x6fca43, 0x9be866];
  const tileGeo = new THREE.BoxGeometry(0.99, 0.08, 0.99);
  const tileMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const tileCount = (SIZE * STEP - ROAD) ** 2;
  const grassTiles = new THREE.InstancedMesh(tileGeo, tileMat, tileCount);
  state.grassTiles = grassTiles;
  const grassBaseColors = [];
  const dummy = new THREE.Object3D();
  let index = 0;
  for (let z = 0; z < SIZE * STEP - ROAD; z++) {
    for (let x = 0; x < SIZE * STEP - ROAD; x++) {
      dummy.position.set(x + 0.5, 0.04, z + 0.5);
      dummy.updateMatrix();
      grassTiles.setMatrixAt(index, dummy.matrix);
      // Deterministic variation: each grass cube has one flat, fixed green.
      const seed = (x * 73856093) ^ (z * 19349663);
      const tone = grassTones[Math.abs(seed) % grassTones.length];
      const tileColor = new THREE.Color(tone);
      grassBaseColors.push(tileColor.clone());
      grassTiles.setColorAt(index, tileColor);
      index++;
    }
  }
  grassTiles.instanceMatrix.needsUpdate = true;
  if (grassTiles.instanceColor) grassTiles.instanceColor.needsUpdate = true;
  state.grassBaseColors = grassBaseColors;
  grassTiles.receiveShadow = true;
  plotGroup.add(grassTiles);

  // Only the 10x10 plot hit areas are selectable. The 5-wide grass strips
  // between them remain visible but have no hit area, so they cannot be bought
  // or built on unless the adjacent plots are both owned (bonus rule later).
  const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, colorWrite: false, depthWrite: false });
  for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) {
    const id = plotId(x, z);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(PLOT, 0.12, PLOT), hitMaterial);
    hit.position.set(x * STEP + PLOT / 2, 0.08, z * STEP + PLOT / 2);
    hit.userData = { plotId: id };
    plotGroup.add(hit);
    plotMeshes.push(hit);

    const highlight = new THREE.Mesh(
      new THREE.PlaneGeometry(PLOT, PLOT),
      new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
    );
    highlight.rotation.x = -Math.PI / 2;
    highlight.position.set(x * STEP + PLOT / 2, 0.086, z * STEP + PLOT / 2);
    highlight.userData = { plotId: id, highlight: true };
    plotGroup.add(highlight);
    hit.userData.highlight = highlight;
  }
  for (const [id, items] of Object.entries(state.blocks)) {
    for (const item of items) addVoxel(id, item.x, item.y, item.z, item.type, false);
  }
  refreshSelection();
}
function addVoxel(id,x,y,z,type,save=true) {
  const {x:px,z:pz}=plotCoords(id); const material=new THREE.MeshStandardMaterial({color:blockColor(type) || 0x8ee35b});
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(0.96,0.96,0.96),material); mesh.position.set(px*STEP+x+0.5,y+0.5,pz*STEP+z+0.5); mesh.castShadow=true; mesh.receiveShadow=true; mesh.userData={plotId:id,local:{x,y,z},type};
  buildGroup.add(mesh); state.voxelMeshes.push(mesh);
  if(save) { state.blocks[id] ||= []; state.blocks[id].push({x,y,z,type}); persist(); }
}
function removeVoxel(mesh) {
  const {plotId:id,local}=mesh.userData; const items=state.blocks[id]||[]; const i=items.findIndex(v=>v.x===local.x&&v.y===local.y&&v.z===local.z);
  if(i>=0) items.splice(i,1); buildGroup.remove(mesh); state.voxelMeshes=state.voxelMeshes.filter(v=>v!==mesh); persist();
}
function refreshSelection() {
  plotMeshes.forEach(m => {
    const selected = state.selected.has(m.userData.plotId);
    m.userData.highlight.material.opacity = selected ? 0.42 : 0;
  });
}
function resize() {
  const w = canvasHost.clientWidth, h = canvasHost.clientHeight;
  const viewHeight = 150;
  const aspect = w / h;
  camera.left = -(viewHeight * aspect) / 2;
  camera.right = (viewHeight * aspect) / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();
let pointerStart = null;
let pointerMoved = false;
renderer.domElement.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  pointerStart = { x: e.clientX, y: e.clientY };
  pointerMoved = false;
});
renderer.domElement.addEventListener('pointermove', e => {
  if (!pointerStart) return;
  if (Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) > 6) pointerMoved = true;
});
renderer.domElement.addEventListener('pointerup', e => {
  if (e.button !== 0) return;
  const wasMoved = pointerMoved;
  pointerStart = null;
  pointerMoved = false;
  if (wasMoved) return;
  const rect = renderer.domElement.getBoundingClientRect();
  state.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  state.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  state.raycaster.setFromCamera(state.pointer, camera);
  if(state.tab==='build' && state.mode==='buyer') {
    const hits=state.raycaster.intersectObjects([...plotMeshes,...state.voxelMeshes],false); if(!hits.length)return; const hit=hits[0]; const id=hit.object.userData.plotId; if(!isOwned(id)){toast('Choose one of your plots to build.');return;}
    if(e.shiftKey && hit.object.userData.local){removeVoxel(hit.object);return;}
    const point=hit.point; const {x:px,z:pz}=plotCoords(id); const lx=Math.floor(point.x-px*STEP),lz=Math.floor(point.z-pz*STEP); if(lx<0||lx>=10||lz<0||lz>=10)return;
    const y=hit.object.userData.local?hit.object.userData.local.y+1:0; addVoxel(id,lx,y,lz,state.blockType); toast('Block placed.');
    return;
  }
  const hits=state.raycaster.intersectObjects(plotMeshes,false); if(!hits.length)return; const id=hits[0].object.userData.plotId;
  if(state.mode==='admin'){openPlotAdmin(id);return;}
  if(state.tab==='explore' && isAvailable(id)){state.selected.has(id)?state.selected.delete(id):state.selected.add(id);refreshSelection();renderSide();}
  else if(isOwned(id)){state.selected=new Set([id]);refreshSelection();renderSide();}
});
function animate(now = 0){
  requestAnimationFrame(animate);
  controls.update();
  // Slowly breathe the individual grass tiles through tiny brightness changes.
  // Each tile keeps its own green tone; the movement is subtle rather than noisy.
  if (state.grassTiles && now - state.lastGrassUpdate > 180) {
    const t = now * 0.00042;
    for (let i = 0; i < state.grassBaseColors.length; i++) {
      const wave = Math.sin(t + i * 0.071) * 0.035;
      const color = state.grassBaseColors[i].clone().multiplyScalar(1 + wave);
      state.grassTiles.setColorAt(i, color);
    }
    if (state.grassTiles.instanceColor) state.grassTiles.instanceColor.needsUpdate = true;
    state.lastGrassUpdate = now;
  }
  renderer.render(scene,camera);
}
animate(); makeWorld();

function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2600);}
function setTab(tab){state.tab=tab;document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));renderPage();}
document.querySelectorAll('.nav-link').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
document.querySelector('#mode-select').addEventListener('change',e=>{state.mode=e.target.value;state.selected.clear();refreshSelection();renderPage();toast(state.mode==='admin'?'Admin demo mode enabled.':'Buyer demo mode enabled.');});
document.querySelector('#reset-camera').addEventListener('click', () => {
  controls.target.set(42.5, 0, 42.5);
  camera.position.set(125, 112, 145);
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  controls.update();
});

document.querySelector('#help-btn').addEventListener('click',()=>showModal('<p class="eyebrow">ABOUT THE PROTOTYPE</p><h2>A world made by many.</h2><p>This is an interactive frontend prototype. Purchases are simulated, and your demo data stays in this browser. Admin mode is not protected and must never be treated as real authorization.</p><p>Each plot measures 10 × 10 blocks. Shared grass strips are 5 blocks wide and cannot be selected. Building has no configured height cap in this prototype.</p>'));
function updateStats(){document.querySelector('#owned-count').textContent=state.owned.length;let free=0;for(let z=0;z<SIZE;z++)for(let x=0;x<SIZE;x++)if(isAvailable(plotId(x,z)))free++;document.querySelector('#available-count').textContent=free;}
function renderPage(){
  updateStats(); const title=document.querySelector('#page-title'), sub=document.querySelector('#page-subtitle'), eyebrow=document.querySelector('#eyebrow');
  if(state.tab==='explore'){title.innerHTML='Find your little piece<br/>of somewhere.';sub.textContent='Explore the map, choose a plot, and make it your own.';eyebrow.textContent='A SHARED WORLD, MADE BY YOU';}
  if(state.tab==='build'){title.innerHTML='Make something<br/>that feels like you.';sub.textContent='Place blocks, shape your space, and keep building upward.';eyebrow.textContent='YOUR SPACE, YOUR RULES';}
  if(state.tab==='myland'){title.innerHTML='A little land.<br/>A lot of possibility.';sub.textContent='Your plots, your creations, all in one place.';eyebrow.textContent='YOUR CORNER OF THE WORLD';}
  document.querySelector('#map-caption').textContent=state.mode==='admin'?'ADMIN VIEW · MAP EDITOR':'THE WORLD · STARTER MAP';
  renderSide(); renderBelow();
}
function renderSide(){
 const panel=document.querySelector('#side-panel');
 if(state.mode==='admin'){panel.innerHTML=`<p class="eyebrow">WORLD SETTINGS</p><h2>Admin studio</h2><p class="muted">Edit the shared map and test the experience.</p><div class="field"><label>Terrain / biome</label><select id="biome-select"><option value="meadow">Meadow</option><option value="autumn">Autumn</option><option value="snow">Snow</option><option value="desert">Desert</option></select></div><div class="field"><label>Selected plot</label><strong>${state.selected.size?Array.from(state.selected).join(', '):'Click a plot on the map'}</strong></div><button class="primary-button" id="admin-reset">Reset demo world</button><div class="note">Admin mode is a visual demo only. Production admin permissions must be enforced by a backend.</div>`;
  document.querySelector('#biome-select').value=state.biome;document.querySelector('#biome-select').onchange=e=>{state.biome=e.target.value;makeWorld();renderSide();};
  document.querySelector('#admin-reset').onclick=()=>{if(!confirm('Reset all demo plots and blocks in this browser?'))return;state.owned=[];state.plots={};state.blocks={};state.selected.clear();persist();makeWorld();renderPage();toast('Demo world reset.');};
  return;
 }
 if(state.tab==='explore'){
  const ids=Array.from(state.selected);panel.innerHTML=`<p class="eyebrow">MAKE IT YOURS</p><h2>${ids.length?ids.length+' plot'+(ids.length>1?'s':'')+' selected':'Choose a plot'}</h2><p class="muted">${ids.length?'Selected plots are grouped into one simulated checkout.':'Each plot is 10 × 10 blocks. Grass strips between plots are 5 blocks wide and cannot be selected.'}</p><div class="selection-list">${ids.length?ids.map(id=>'<div class="selection-row"><span>'+id+'</span><span>10 × 10 blocks</span><button data-remove="'+id+'">×</button></div>').join(''):'<div class="empty-state">Select any available plot on the map to see it here.</div>'}</div><div class="price-line"><span>Plots</span><strong>${ids.length}</strong></div><div class="price-line"><span>Demo total</span><strong>$${ids.length.toFixed(2)}</strong></div><p class="tiny muted">Adjacent plots selected together include the shared inner grass strips in this demo.</p><button class="primary-button" id="checkout" ${ids.length?'':'disabled'}>Continue to checkout <span>↗</span></button><button class="text-button" id="clear-selection">Clear selection</button>`;
  panel.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{state.selected.delete(b.dataset.remove);refreshSelection();renderSide();});
  panel.querySelector('#clear-selection').onclick=()=>{state.selected.clear();refreshSelection();renderSide();};
  panel.querySelector('#checkout').onclick=openCheckout;
 } else if(state.tab==='build'){
  const owned=state.owned;panel.innerHTML=`<p class="eyebrow">BUILD MODE</p><h2>Pick a canvas.</h2><p class="muted">Choose one of your plots, then click its surface to place blocks. Hold Shift and click a placed block to remove it. Right-drag pans the view.</p><div class="field"><label>Your plot</label><select id="build-plot">${owned.length?owned.map(id=>'<option>'+id+'</option>').join(''):'<option value="">No plots yet</option>'}</select></div><div class="field"><label>Choose a block</label><div class="block-palette">${Object.entries(BLOCKS).map(([k,v])=>'<button class="block-choice '+(state.blockType===k?'chosen':'')+'" data-block="'+k+'" title="'+v.label+'"><i style="background:'+blockColor(k)+'"></i><span>'+v.label+'</span></button>').join('')}</div></div><div class="field"><label>Preset color palettes</label><div class="preset-palettes">${Object.entries(PALETTES).map(([k,p])=>'<button class="preset-choice '+(state.paletteName===k?'chosen':'')+'" data-palette="'+k+'"><span class="preset-swatches">'+Object.values(p.colors).slice(0,5).map(c=>'<i style="background:'+c+'"></i>').join('')+'</span><span>'+p.label+'</span></button>').join('')}</div></div><div class="field color-editor"><label for="block-color">Custom color · '+BLOCKS[state.blockType].label+'</label><div class="color-picker-row"><input id="block-color" type="color" value="'+blockColor(state.blockType)+'"/><span>'+blockColor(state.blockType).toUpperCase()+'</span></div><p class="tiny muted">Choose any color using the standard color picker. It changes only the selected block type.</p></div><div class="note">No fixed building-height limit is configured. Keep an eye on performance when creating very tall structures.</div>`;
  const select=panel.querySelector('#build-plot');if(owned.length){select.value=state.selected.size?Array.from(state.selected)[0]:owned[0];select.onchange=()=>{state.selected=new Set([select.value]);refreshSelection();};}
  panel.querySelectorAll('[data-block]').forEach(b=>b.onclick=()=>{state.blockType=b.dataset.block;renderSide();});
  panel.querySelectorAll('[data-palette]').forEach(b=>b.onclick=()=>{const name=b.dataset.palette;state.paletteName=name;state.blockColors={...PALETTES[name].colors};updatePlacedBlockColors();persist();renderSide();toast(PALETTES[name].label+' palette applied.');});
  panel.querySelector('#block-color').oninput=e=>{state.blockColors[state.blockType]=e.target.value;state.paletteName='custom';panel.querySelector('.color-picker-row span').textContent=e.target.value.toUpperCase();panel.querySelectorAll('[data-block]').forEach(btn=>{if(btn.dataset.block===state.blockType)btn.querySelector('i').style.background=e.target.value;});state.voxelMeshes.forEach(mesh=>{if(mesh.userData.type===state.blockType)mesh.material.color.set(e.target.value);});persist();};
 } else {
  panel.innerHTML=`<p class="eyebrow">YOUR LAND</p><h2>${state.owned.length?state.owned.length+' little spaces':'Your story starts here.'}</h2><p class="muted">Your public plot cards will live here. Build something worth a visit.</p><div class="empty-state">${state.owned.length?'Choose a plot card below to preview and share it.':'You have not claimed a plot yet. Explore the world to find one.'}</div><button class="primary-button" id="go-explore">${state.owned.length?'Explore your world':'Find a plot'} <span>↗</span></button>`;
  panel.querySelector('#go-explore').onclick=()=>setTab('explore');
 }
}
function renderBelow(){
 const el=document.querySelector('#below-content');
 if(state.tab==='myland' && state.owned.length){el.innerHTML='<div class="section-heading"><div><p class="eyebrow">COLLECTION</p><h2>Your plots</h2></div><span>'+state.owned.length+' owned</span></div><div class="plot-cards">'+state.owned.map(id=>'<article class="plot-card"><div class="card-image" id="card-image-'+id+'"><span>BIT OF LAND</span><b>'+id+'</b></div><div class="card-body"><div><strong>Plot '+id+'</strong><small>10 × 10 blocks · Public</small></div><button data-preview="'+id+'" class="outline-button">View & share ↗</button></div></article>').join('')+'</div>';el.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>{state.selected=new Set([b.dataset.preview]);refreshSelection();setTab('build');openShareCard(b.dataset.preview);});}
 else {el.innerHTML='<div class="manifesto"><span>01 / EXPLORE</span><p>A world that grows one small place at a time.</p><span>02 / BUILD</span><p>Start with a patch of land. See where your imagination takes it.</p><span>03 / SHARE</span><p>Every creation becomes part of a bigger picture.</p></div>';}
}
function openPlotAdmin(id){
 state.selected=new Set([id]);refreshSelection();const status=state.plots[id]?.status||'available';
 showModal('<p class="eyebrow">ADMIN · PLOT '+id+'</p><h2>Plot settings</h2><p>Change the availability of this 10 × 10 plot.</p><div class="field"><label>Status</label><select id="plot-status"><option value="available">Available</option><option value="unavailable">Unavailable</option></select></div><button class="primary-button" id="save-plot">Save plot</button>');
 document.querySelector('#plot-status').value=status;document.querySelector('#save-plot').onclick=()=>{state.plots[id]={status:document.querySelector('#plot-status').value};persist();makeWorld();closeModal();renderPage();toast('Plot '+id+' updated.');};
}
function openCheckout(){
 const ids=Array.from(state.selected);if(!ids.length)return;
 showModal('<p class="eyebrow">SECURE YOUR SPACE · DEMO</p><h2>One small step.<br/>A place of your own.</h2><p>You are claiming '+ids.join(', ')+'. Each plot is 10 × 10 blocks. Adjacent inner grass strips are included at no extra cost.</p><div class="checkout-summary"><span>'+ids.length+' × plot</span><strong>$'+ids.length.toFixed(2)+'</strong></div><p class="tiny muted">This is a simulated checkout. No payment details are requested and no money will be charged.</p><div class="field"><label>Your display name</label><input id="buyer-name" placeholder="What should we call you?" maxlength="32"/></div><button class="primary-button" id="pay-demo">Confirm demo purchase <span>↗</span></button>');
 document.querySelector('#pay-demo').onclick=()=>{const name=document.querySelector('#buyer-name').value.trim()||'Guest builder';if(ids.some(id=>!isAvailable(id))){toast('One of these plots is no longer available.');closeModal();return;}state.owned.push(...ids);state.owned=[...new Set(state.owned)];state.selected.clear();state.buyerName=name;persist();makeWorld();closeModal();renderPage();toast('Your land is ready. Welcome to bit of land.');setTab('myland');};
}
function openShareCard(id){
 const url=location.origin+'/land/'+id;const data=renderer.domElement.toDataURL('image/png');
 showModal('<p class="eyebrow">YOUR PUBLIC LAND CARD</p><h2>Plot '+id+'</h2><div class="share-preview"><img src="'+data+'" alt="Current world view"/><div><strong>bit of land</strong><span>Plot '+id+' · built by you</span></div></div><div class="field"><label>Public link</label><div class="copy-row"><input readonly value="'+url+'" id="share-url"/><button id="copy-url">Copy</button></div></div><p class="tiny muted">The preview captures the current world view. A dedicated public plot page and automatic server-side image updates will be connected in a later stage.</p>');
 document.querySelector('#copy-url').onclick=()=>{navigator.clipboard?.writeText(url).then(()=>toast('Link copied.')).catch(()=>toast('Copy the link from the field.'));};
}
function showModal(html){document.querySelector('#modal-content').innerHTML=html;document.querySelector('#modal').showModal();}
function closeModal(){document.querySelector('#modal').close();}
document.querySelector('#modal-close').onclick=closeModal;document.querySelector('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal();});
renderPage();