const APP_VERSION = window.APP_VERSION || "1.2.0";

// --- DOM ---
const canvas = document.getElementById("simCanvas");
const ctx = canvas.getContext("2d");
const logs = document.getElementById("logs");
const debugLogs = document.getElementById("debugLogs");
const statePre = document.getElementById("state");
const statsPre = document.getElementById("statsPre");
const minimap = document.getElementById("minimap");
const mctx = minimap.getContext("2d");

// i18n
const langSelect = document.getElementById("langSelect");
let currentLang = detectDefaultLang();
langSelect.value = currentLang;
applyI18n(currentLang);
langSelect.addEventListener("change", () => { currentLang = langSelect.value; applyI18n(currentLang); });

// Buttons
const focusServerBtn = document.getElementById("focusServerBtn");
const measureToggleBtn = document.getElementById("measureToggleBtn");
const measurePanel = document.getElementById("measurePanel");
const measureResult = document.getElementById("measureResult");
const measureClearBtn = document.getElementById("measureClearBtn");

// Panels
const obCtxHint = document.getElementById("obCtxHint");
const lblRadius = document.getElementById("lblRadius");
const lblLoss = document.getElementById("lblAbsorption");
const obsRadiusInput = document.getElementById("obsRadius");
const obsRadiusNum   = document.getElementById("obsRadiusNum");
const obsLossInput   = document.getElementById("obsAbsorption");
const obsLossNum     = document.getElementById("obsAbsorptionNum");
const obsMaterial    = document.getElementById("obsMaterial");
const selObsMaterial = document.getElementById("selObsMaterial");

const noSelection = document.getElementById("noSelection");
const selHivePanel = document.getElementById("selHivePanel");
const selHiveId = document.getElementById("selHiveId");
const txPower = document.getElementById("txPower");
const txPowerNum = document.getElementById("txPowerNum");

const deleteBtn = document.getElementById("deleteBtn");
const resetBtn = document.getElementById("resetBtn");
const resetStatsBtn = document.getElementById("resetStatsBtn");
const copyShareUrlBtn = document.getElementById("copyShareUrlBtn");
const loadFromUrlBtn = document.getElementById("loadFromUrlBtn");

// LoRa params — European defaults
const sfInput = document.getElementById("sfInput");
const bwInput = document.getElementById("bwInput");
const crInput = document.getElementById("crInput");
const mppInput = document.getElementById("mppInput");
const realisticChk = document.getElementById("realisticChk");
const freqInput = document.getElementById("freqInput");
const txDbmInput = document.getElementById("txDbmInput");

// Import/Export
const accHeader = document.getElementById("accHeader");
const accBody = document.getElementById("accBody");
const exportBtn = document.getElementById("exportBtn");
const exportToZoneBtn = document.getElementById("exportToZoneBtn");
const copyExportBtn = document.getElementById("copyExportBtn");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");
const exportArea = document.getElementById("exportArea");
const importArea = document.getElementById("importArea");
const importFromZoneBtn = document.getElementById("importFromZoneBtn");
const clearImportBtn = document.getElementById("clearImportBtn");

// Geo
const geoHeader = document.getElementById("geoHeader");
const geoBody = document.getElementById("geoBody");
const geoLat = document.getElementById("geoLat");
const geoLon = document.getElementById("geoLon");
const geoMPP = document.getElementById("geoMPP");
const geoOptimize = document.getElementById("geoOptimize");
const geoTolerance = document.getElementById("geoTolerance");
const geoProgress = document.getElementById("geoProgress");
const geoProgressText = document.getElementById("geoProgressText");
const geoJsonArea = document.getElementById("geoJsonArea");
const loadGeoBtn = document.getElementById("loadGeoBtn");

// Palette drag
document.querySelector('.rucherItem').addEventListener('dragstart', startDrag);
document.querySelector('.obstacleItem').addEventListener('dragstart', startDrag);

// --- Model ---
let hives = [];
let obstacles = []; // {id,x,y,radius,loss} for circles OR {id,type:'polygon',points:[{x,y}...],loss,bounds:{minX,minY,maxX,maxY}} for polygons
const server = { x: 450, y: 280, id: "Central Server", txPowerDbm: 14 };

// --- Performance Optimization ---
let spatialIndex = new SpatialIndex();
let geoWorker = null;
let path2DCache = new Map(); // Cache for Path2D objects

// Visual engine
let waveSpeed = 3;
let attenuation = 0.005;
let baseRange = 340;       // used only when realistic visual OFF
let baseRxThresh = 0.08;   // used only when realistic visual OFF

// Wave acceleration constants
const WAVE_DURATION_MS = 10000; // 10 seconds to reach max radius
const WAVE_ACCELERATION_FACTOR = 3.5; // Controls the acceleration curve (higher = slower start)
let lora = { sf: 7, bw: 125, cr: 5 };  // European defaults
let maxRetrans = 2;

// Radio/scale
let metersPerPixel = 2; // Demo default value
let fMHz = 868;
let txDbmDefault = 10;  // More realistic power for battery devices
let realistic = true;   // enabled by default

const SECTORS = 72;
const SECTOR_RAD = (2*Math.PI)/SECTORS;

// --- Material system for realistic obstacle attenuation ---
const MATERIALS = {
  'brick': { alpha: 0.35, color: '#964B00', name: '🧱 Brick', loss_db: 1.5 },
  'concrete': { alpha: 1.15, color: '#505050', name: '� Concrete', loss_db: 5.0 },
  'forest': { alpha: 0.15, color: '#007800', name: '🌲 Forest', loss_db: 0.65 },
  'field': { alpha: 0.03, color: '#B4FF78', name: '🌾 Field', loss_db: 0.13 },
  'water': { alpha: 3.0, color: '#0064FF', name: '💧 Water', loss_db: 13.0 },
  'rock': { alpha: 1.8, color: '#787878', name: '🪨 Rock', loss_db: 7.8 },
  'urban_mix': { alpha: 0.25, color: '#C8C8C8', name: '🏘️ Urban', loss_db: 1.1 },
  'metal': { alpha: 2.5, color: '#9696B4', name: '� Metal', loss_db: 10.8 },
  'wood': { alpha: 0.05, color: '#8B4513', name: '🌳 Wood', loss_db: 0.2 },
  'sand': { alpha: 0.08, color: '#F4A460', name: '🏖️ Sand', loss_db: 0.35 },
  'default': { alpha: 0.1, color: '#C8C8C8', name: '❓ Default', loss_db: 0.43 }
};

function getMaterialAlpha(material) {
  return MATERIALS[material]?.alpha || 0.6; // Default alpha if material not found (brick)
}

function getMaterialColor(material) {
  return MATERIALS[material]?.color || '#C8C8C8'; // Default color if material not found
}

// --- GeoJSON to Material Mapping ---
function mapGeoFeatureToMaterial(props) {
  const materialMap = [
    { key: "building", match: /industrial|warehouse|bunker/, material: "concrete", k: 1.15 },
    { key: "building", match: /yes|house|residential|commercial/, material: "brick", k: 0.35 },
    { key: "landuse", match: /forest|wood|scrub/, material: "forest", k: 0.15 },
    { key: "landuse", match: /grass|meadow|pasture|farmland/, material: "field", k: 0.03 },
    { key: "natural", match: /water|wetland|river|lake/, material: "water", k: 3.0 },
    { key: "natural", match: /rock|mountain/, material: "rock", k: 1.8 },
    { key: "landuse", match: /urban|residential/, material: "urban_mix", k: 0.25 },
    { key: "landuse", match: /military/, material: "metal", k: 2.5 },
    { key: "landuse", match: /cemetery|park/, material: "wood", k: 0.05 },
    { key: "natural", match: /sand|beach/, material: "sand", k: 0.08 },
  ];
  
  for (const m of materialMap) {
    if (props[m.key] && m.match.test(props[m.key])) {
      return { material: m.material, k: m.k };
    }
  }
  return { material: "default", k: 0.1 };
}

let waves = [];
let seqCounter = 1;
let obsCounter = 1;

const camera = { x: 0, y: 0, scale: 1 };
const minScale = 0.02, maxScale = 3; // allow bigger zoom-out for large realistic ranges

let selected = null;
let currentDrag = null;
let panning = false;
let spaceDown = false;
let lastMouse = {x:0,y:0};

const serverSeen = new Set();

const stats = {
  dataSent: 0, dataDelivered: 0, originAcked: 0,
  relaysData: 0, relaysAck: 0,
  ttlDrops: 0, shadowDrops: 0, dupIgnored: 0,
  deliveries: 0, totalHops: 0, latencySumMs: 0
};
const emittedAt = new Map();

let stateDirty = true;
let statsDirty = true;

// Measure tool
let measureMode = false;
let measurePts = []; // [{x,y,label}], world coords

// --- Utils ---
function log(msg){ logs.textContent += msg + "\n"; logs.scrollTop = logs.scrollHeight; }
function debug(msg){ debugLogs.textContent += msg + "\n"; debugLogs.scrollTop = debugLogs.scrollHeight; }
function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
const keyOS = (o,s) => `${o}#${s}`;
function clamp(v,lo,hi){ return Math.max(lo, Math.min(hi, v)); }
function isNum(n){ return typeof n==='number' && Number.isFinite(n); }
function angle(ax,ay,bx,by){ return Math.atan2(by - ay, bx - ax); }
function norm(a){ let t=a%(2*Math.PI); if(t<0)t+=2*Math.PI; return t; }
function angleToSector(th){ const t=norm(th); return Math.floor(t/SECTOR_RAD)%SECTORS; }
function sectorRange(a0,a1){
  a0=norm(a0); a1=norm(a1); const out=[];
  if(a1>=a0){ const i0=angleToSector(a0),i1=angleToSector(a1); for(let i=i0;i!==((i1+1)%SECTORS); i=(i+1)%SECTORS) out.push(i); }
  else { const i0=angleToSector(a0),i1=angleToSector(a1); for(let i=i0;i<SECTORS;i++) out.push(i); for(let i=0;i!==((i1+1)%SECTORS); i=(i+1)%SECTORS) out.push(i); }
  return out;
}
function loraRangeFactor(){ const sf = clamp(lora.sf,7,12); const sfF=1+(sf-7)*0.24; const bw=+lora.bw; const bwF=(bw===500)?0.9:(bw===250?1.0:1.2); const cr=clamp(+lora.cr,5,8); const crF=1+(cr-5)*0.05; return sfF*bwF*crF; }
function getRange(){ return clamp(baseRange*loraRangeFactor(),80,4000); }
function getRxThresh(){ return clamp(baseRxThresh/loraRangeFactor(),0.01,0.2); }
function w2s(wx,wy){ return {x:(wx-camera.x)*camera.scale, y:(wy-camera.y)*camera.scale}; }
function s2w(sx,sy){ return {x:sx/camera.scale + camera.x, y: sy/camera.scale + camera.y}; }
function resolveNode(id){ if (id===server.id) return server; return hives.find(h=>h.id===id) || null; }

// --- Polygon utilities ---
function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    if (((points[i].y > y) !== (points[j].y > y)) &&
        (x < (points[j].x - points[i].x) * (y - points[i].y) / (points[j].y - points[i].y) + points[i].x)) {
      inside = !inside;
    }
  }
  return inside;
}

function getPolygonBounds(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function polygonContainsPoint(obstacle, x, y) {
  if (obstacle.type !== 'polygon') return false;
  return pointInPolygon(x, y, obstacle.points);
}

function obstacleContainsPoint(obstacle, x, y) {
  if (obstacle.type === 'polygon') {
    return polygonContainsPoint(obstacle, x, y);
  } else {
    // Circular obstacle
    const dx = x - obstacle.x;
    const dy = y - obstacle.y;
    return (dx * dx + dy * dy) <= (obstacle.radius * obstacle.radius);
  }
}

// --- Performance Optimization Functions ---
function addObstaclesBatch(batch) {
  for (const item of batch) {
    if (item.type === 'point') {
      const { x, y, properties } = item;
      if ((properties.name || '').toLowerCase() === 'server') {
        server.x = x;
        server.y = y;
      } else {
        const nh = {
          x, y,
          id: `Hive ${hives.length + 1}`,
          txPower: 1,
          seenData: new Set(),
          seenAck: new Set(),
          ackPulses: [],
          txPowerDbm: txDbmDefault
        };
        hives.push(nh);
        spatialIndex.add(nh);
      }
    } else if (item.type === 'polygon') {
      const { points, properties, material, k } = item;
      
      if (points.length >= 3) {
        const bounds = getPolygonBounds(points);
        const absorption = properties.absorption ? clamp(+properties.absorption, 0.00001, 5) : k;
        const loss = properties.loss ? clamp(+properties.loss, 0, 0.95) : absorption * 0.1;
        
        const no = {
          id: obsCounter++,
          type: 'polygon',
          points,
          loss,
          absorption,
          bounds,
          material,
          k
        };
        
        obstacles.push(no);
        spatialIndex.add(no);
        
        debug(`Added polygon: material=${material}, α=${absorption.toFixed(3)}, vertices=${points.length}`);
      }
    }
  }
  stateDirty = true;
}

function createPath2D(obstacle) {
  if (obstacle.type === 'polygon') {
    const path = new Path2D();
    const points = obstacle.points;
    if (points.length > 0) {
      const first = w2s(points[0].x, points[0].y);
      path.moveTo(first.x, first.y);
      for (let i = 1; i < points.length; i++) {
        const p = w2s(points[i].x, points[i].y);
        path.lineTo(p.x, p.y);
      }
      path.closePath();
    }
    return path;
  } else {
    // Circular obstacle
    const path = new Path2D();
    const s = w2s(obstacle.x, obstacle.y);
    const r = obstacle.radius * camera.scale;
    path.arc(s.x, s.y, r, 0, Math.PI * 2);
    return path;
  }
}

function getViewport() {
  return {
    minX: camera.x,
    minY: camera.y,
    maxX: camera.x + canvas.width / camera.scale,
    maxY: camera.y + canvas.height / camera.scale
  };
}

// --- Realistic radio helpers ---
function loraSensitivityDbm(sf, bw){
  // More realistic LoRa sensitivity values (worse than theoretical)
  // Accounts for real-world conditions, noise floor, implementation losses
  const table = {7:-118, 8:-121, 9:-124, 10:-127, 11:-129.5, 12:-132};
  let s = table[sf] ?? -125;
  if (bw==250) s += 3; else if (bw==500) s += 6;
  return s;
}
function fsplDb(d_m, f_MHz){
  return 32.44 + 20*Math.log10(f_MHz) + 20*Math.log10(Math.max(0.001,d_m/1000));
}
// Compute LOS range (meters) without obstacles, from TX, f, SF/BW
function calcRealisticRangeMeters(sf, bw, txDbm, freqMHz=868){
  const sens = loraSensitivityDbm(sf, bw);
  const rhs = txDbm - sens;
  const A = 32.44 + 20*Math.log10(freqMHz);
  const log10_dkm = (rhs - A) / 20;
  const d_km = Math.pow(10, log10_dkm);
  return Math.max(1, d_km*1000);
}

// Camera bounds & fit
function getWorldBounds(includeViewport=false){
  let minX=server.x,minY=server.y,maxX=server.x,maxY=server.y;
  for (const h of hives){ minX=Math.min(minX,h.x); minY=Math.min(minY,h.y); maxX=Math.max(maxX,h.x); maxY=Math.max(maxY,h.y); }
  for (const o of obstacles){ 
    if (o.type === 'polygon') {
      minX=Math.min(minX,o.bounds.minX); minY=Math.min(minY,o.bounds.minY); 
      maxX=Math.max(maxX,o.bounds.maxX); maxY=Math.max(maxY,o.bounds.maxY);
    } else {
      minX=Math.min(minX,o.x-o.radius); minY=Math.min(minY,o.y-o.radius); 
      maxX=Math.max(maxX,o.x+o.radius); maxY=Math.max(maxY,o.y+o.radius);
    }
  }
  if (includeViewport){
    const vmin={x:camera.x,y:camera.y}, vmax={x:camera.x+canvas.width/camera.scale,y:camera.y+canvas.height/camera.scale};
    minX=Math.min(minX,vmin.x); minY=Math.min(minY,vmin.y); maxX=Math.max(maxX,vmax.x); maxY=Math.max(maxY,vmax.y);
  }
  return {minX,minY,maxX,maxY};
}
function fitCameraToBounds(bounds, paddingPx=60){
  const width = bounds.maxX - bounds.minX || 1;
  const height = bounds.maxY - bounds.minY || 1;
  const sx = (canvas.width - 2*paddingPx) / width;
  const sy = (canvas.height - 2*paddingPx) / height;
  let newScale = Math.max(0.02, Math.min(maxScale, Math.min(sx, sy)));
  newScale = Math.max(newScale, minScale);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  camera.scale = newScale;
  camera.x = cx - (canvas.width / (2*camera.scale));
  camera.y = cy - (canvas.height / (2*camera.scale));
  stateDirty = true;
}
function focusServer(mode='fit', radiusPx=600){
  if (mode==='fit'){
    fitCameraToBounds({minX:server.x-radiusPx, minY:server.y-radiusPx, maxX:server.x+radiusPx, maxY:server.y+radiusPx});
  } else {
    camera.x = server.x - (canvas.width/2)/camera.scale;
    camera.y = server.y - (canvas.height/2)/camera.scale;
    stateDirty=true;
  }
}
focusServerBtn.addEventListener('click', ()=> focusServer('fit', 600));

// --- Data & waves ---
function createData(h){
  const seq=seqCounter++;
  const d={seq,id:h.id,timestamp:Date.now(),temperature:(20+Math.random()*5).toFixed(1),hops:0};
  emittedAt.set(keyOS(h.id,seq), performance.now());
  stats.dataSent++; statsDirty=true; return d;
}
function computeVisualMaxRadiusPx(source){
  if (!realistic) return getRange(); // legacy visual
  const rangeM = calcRealisticRangeMeters(lora.sf, lora.bw, source?.txPowerDbm ?? txDbmDefault, fMHz);
  const px = rangeM / Math.max(0.0001, metersPerPixel);
  return clamp(px, 10, 200000); // safety clamp
}
function emitWave(source, type="DATA", data=null, origin=null, ttl=maxRetrans){
  const startAlpha = (source && typeof source.txPower==='number') ? clamp(source.txPower,0.2,2) : 1;
  const maxR = computeVisualMaxRadiusPx(source);
  const startTime = performance.now();
  const w = { 
    x:source.x, y:source.y, r:0, alpha:startAlpha, type, 
    data:data||createData(source), origin:origin||source.id, emitterId:source.id, 
    hit:{}, ttl, alphaSectors:new Array(SECTORS).fill(1), obstacleApplied:new Set(), 
    maxRadius:maxR, startTime, lastUpdateTime:startTime 
  };
  waves.push(w);
  log(`${source.id} emits ${type} seq:${data?data.seq:''} TTL=${ttl} visualRange≈${(w.maxRadius*metersPerPixel)|0} m`);
}

// --- Update ---
function updateWaves(){
  const defaultRange = getRange();
  const currentTime = performance.now();
  waves = waves.filter(o => {
    const cap = o.maxRadius ?? getRange();
    const elapsed = currentTime - o.startTime;
    const progress = elapsed / WAVE_DURATION_MS;
    
    // Remove waves that have exceeded their lifespan or are completely attenuated
    const isAlive = (realistic ? (progress < 1.1) : (o.alpha > 0)) && (o.ttl >= 0);
    return isAlive;
  });
  for (const o of waves){
    const cap = o.maxRadius ?? defaultRange;
    const currentTime = performance.now();
    
    // Calculate progressive acceleration (0 to 1 over 10 seconds)
    const elapsed = currentTime - o.startTime;
    const progress = Math.min(1, elapsed / WAVE_DURATION_MS);
    
    // Acceleration function with extremely gentle start
    let easedProgress;
    if (progress < 0.2) { // First 2 seconds: extremely slow growth
      easedProgress = progress * 0.05; // Ultra gentle at the beginning
    } else if (progress < 0.6) {
      // Gradual acceleration phase
      const adjustedProgress = (progress - 0.2) / 0.4;
      easedProgress = 0.01 + 0.39 * Math.pow(adjustedProgress, 4);
    } else {
      // Final phase: smooth completion
      const adjustedProgress = (progress - 0.6) / 0.4;
      easedProgress = 0.4 + 0.6 * (1 - Math.pow(1 - adjustedProgress, 1.2));
    }
    
    // New radius based on progress
    o.r = Math.min(cap, cap * easedProgress);
    
    if (realistic) {
      // Distance-based fade (remains > 0 until cap)
      o.alpha = Math.max(0.05, 1 - (o.r / cap));
    } else {
      // In non-realistic mode, keep the old attenuation logic
      const deltaTime = currentTime - (o.lastUpdateTime || currentTime);
      o.alpha = Math.max(0, o.alpha - attenuation * (deltaTime / 16.67)); // normalized for 60fps
    }
    
    o.lastUpdateTime = currentTime;


    // obstacles → sector attenuation (optimized with spatial index)
    const waveRadius = o.r;
    const waveBounds = {
      minX: o.x - waveRadius,
      minY: o.y - waveRadius,
      maxX: o.x + waveRadius,
      maxY: o.y + waveRadius
    };
    const nearbyObstacles = spatialIndex.query(waveBounds);
    
    for (const ob of nearbyObstacles){
      if (o.obstacleApplied.has(ob.id)) continue;
      
      if (ob.type === 'polygon') {
        // Polygon obstacle: check if wave intersects with polygon
        const waveCenter = {x: o.x, y: o.y};
        const waveBounds = {
          minX: o.x - o.r, minY: o.y - o.r,
          maxX: o.x + o.r, maxY: o.y + o.r
        };
        
        // Quick bounds check
        if (waveBounds.maxX < ob.bounds.minX || waveBounds.minX > ob.bounds.maxX ||
            waveBounds.maxY < ob.bounds.minY || waveBounds.minY > ob.bounds.maxY) {
          continue;
        }
        
        // Check if wave circle intersects polygon
        let intersects = false;
        
        // Check if wave center is inside polygon
        if (polygonContainsPoint(ob, o.x, o.y)) {
          intersects = true;
        } else {
          // Check if circle intersects any polygon edge
          for (let i = 0; i < ob.points.length; i++) {
            const p1 = ob.points[i];
            const p2 = ob.points[(i + 1) % ob.points.length];
            
            // Distance from circle center to line segment
            const A = o.x - p1.x;
            const B = o.y - p1.y;
            const C = p2.x - p1.x;
            const D = p2.y - p1.y;
            
            const dot = A * C + B * D;
            const lenSq = C * C + D * D;
            let param = -1;
            if (lenSq !== 0) param = dot / lenSq;
            
            let xx, yy;
            if (param < 0) {
              xx = p1.x;
              yy = p1.y;
            } else if (param > 1) {
              xx = p2.x;
              yy = p2.y;
            } else {
              xx = p1.x + param * C;
              yy = p1.y + param * D;
            }
            
            const dx = o.x - xx;
            const dy = o.y - yy;
            const distSq = dx * dx + dy * dy;
            
            if (distSq <= o.r * o.r) {
              intersects = true;
              break;
            }
          }
        }
        
        if (intersects) {
          // Realistic material-based exponential attenuation for polygon
          const k = ob.k || ob.absorption || getMaterialAlpha(ob.material || 'brick');
          
          // Calculate approximate distance inside obstacle (rough estimate using bounds)
          const bounds = ob.bounds;
          const d_inside = Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.5; // Approximate thickness
          const d_meters = d_inside * metersPerPixel; // Convert to meters
          
          // Apply exponential attenuation: sectorAlpha *= exp(-k * d_meters)
          const attenuation_factor = Math.exp(-k * d_meters);
          
          for (let i = 0; i < SECTORS; i++) {
            o.alphaSectors[i] *= attenuation_factor;
          }
          o.obstacleApplied.add(ob.id);
        }
      } else {
        // Circular obstacle with realistic material-based attenuation
        const d = dist(o,ob); if (d<=1e-6) continue;
        if (o.r >= d - ob.radius){
          const th = angle(o.x,o.y,ob.x,ob.y);
          const sinArg = Math.min(1, Math.max(-1, ob.radius / d));
          const half = Math.asin(sinArg);
          
          // Material-based exponential attenuation
          const k = ob.k || ob.absorption || getMaterialAlpha(ob.material || 'brick');
          const d_inside = ob.radius * 2; // Diameter as rough estimate of distance through obstacle
          const d_meters = d_inside * metersPerPixel; // Convert to meters
          const attenuation_factor = Math.exp(-k * d_meters);
          
          for (const i of sectorRange(th-half, th+half)) o.alphaSectors[i] *= attenuation_factor;
          o.obstacleApplied.add(ob.id);
        }
      }
    }

    const rxT = getRxThresh();
    function canRxVisual(target){
      const th=angle(o.x,o.y,target.x,target.y); const s=angleToSector(th); const eff=o.alpha*o.alphaSectors[s];
      return eff>=rxT;
    }
    function canRxRealistic(target){
      const source = resolveNode(o.emitterId) || {txPowerDbm: txDbmDefault, x:o.x, y:o.y};
      const th=angle(o.x,o.y,target.x,target.y); const s=angleToSector(th);
      const sectorEff = o.alphaSectors[s]; // 0..1
      const d_px = Math.hypot(target.x - o.x, target.y - o.y);
      const d_m = Math.max(1e-3, d_px * metersPerPixel);
      const pl = fsplDb(d_m, fMHz);
      // Obstacle attenuation: if sectorEff is very low (high loss), add significant penalty
      const obstDb = sectorEff < 0.1 ? 60 : -10 * Math.log10(Math.max(1e-6, sectorEff));
      const txDbm = isNum(source.txPowerDbm)? source.txPowerDbm : txDbmDefault;
      const rx = txDbm - pl - obstDb;
      const sens = loraSensitivityDbm(lora.sf, lora.bw);
      return rx >= sens;
    }
    const canRx = realistic ? canRxRealistic : canRxVisual;

    // server receive
    if (o.type==='DATA' && dist(o,server)<o.r && !o.hit[server.id]){
      if (canRx(server)){
        o.hit[server.id]=true;
        const k=keyOS(o.origin,o.data.seq);
        if (!serverSeen.has(k)){
          serverSeen.add(k); stats.dataDelivered++; statsDirty=true;
          log(`${server.id} received DATA seq:${o.data.seq} from ${o.origin}`);
          const hopsUsed = (o.data && typeof o.data.hops==='number')? o.data.hops : (maxRetrans - o.ttl);
          emitWave(server,'ACK',o.data,o.origin,Math.max(1,hopsUsed));
        } else { stats.dupIgnored++; statsDirty=true; }
      } else { o.hit[server.id]=true; stats.shadowDrops++; statsDirty=true; }
    }

    // hives
    for (const h of hives){
      if (dist(o,h)<o.r && !o.hit[h.id]){
        if (o.emitterId && h.id===o.emitterId){ o.hit[h.id]=true; continue; }
        if (!canRx(h)){ o.hit[h.id]=true; stats.shadowDrops++; statsDirty=true; continue; }

        o.hit[h.id]=true;
        h.seenData ||= new Set(); h.seenAck ||= new Set(); h.ackPulses ||= [];

        if (o.type==='DATA' && h.id!==o.origin){
          const dk=keyOS(o.origin,o.data.seq);
          if (!h.seenData.has(dk)){
            h.seenData.add(dk);
            if (o.ttl>0){
              stats.relaysData++; statsDirty=true;
              const nd={...o.data, hops:(o.data?.hops??0)+1};
              emitWave(h,'DATA',nd,o.origin,o.ttl-1);
            } else stats.ttlDrops++, statsDirty=true;
          } else stats.dupIgnored++, statsDirty=true;
        }

        if (o.type==='ACK'){
          const ak=keyOS(o.origin,o.data.seq);
          if (h.id===o.origin){
            // This ACK is for the original sender - consume it, don't relay
            if (!h.seenAck.has(ak)){
              h.seenAck.add(ak);
              h.ackPulses.push({seq:o.data.seq,t:performance.now()});
              const t0 = emittedAt.get(ak); if (t0){ stats.latencySumMs += (performance.now()-t0); emittedAt.delete(ak); }
              stats.deliveries++; stats.totalHops += (o.data?.hops??0); stats.originAcked++; statsDirty=true;
              log(`${h.id} received its ACK seq:${o.data.seq} from ${server.id}.`);
            }
          } else if (o.ttl>0){
            // This ACK is for someone else - relay it if we haven't seen it before
            if (!h.seenAck.has(ak)){
              h.seenAck.add(ak);
              stats.relaysAck++; statsDirty=true;
              emitWave(h,'ACK',o.data,o.origin,o.ttl-1);
            }
          }
        }
      }
    }
  }
}

// --- Rendering ---
function drawGrid(){
  ctx.strokeStyle='rgba(0,0,0,0.05)'; ctx.lineWidth=1;
  const stepWorld=100, stepScreen=stepWorld*camera.scale;
  if (stepScreen<25) return;
  const startX=Math.floor(camera.x/stepWorld)*stepWorld;
  const startY=Math.floor(camera.y/stepWorld)*stepWorld;
  const endX=camera.x + canvas.width/camera.scale;
  const endY=camera.y + canvas.height/camera.scale;
  for (let x=startX;x<=endX;x+=stepWorld){ const s=w2s(x,0); ctx.beginPath(); ctx.moveTo(s.x,0); ctx.lineTo(s.x,canvas.height); ctx.stroke(); }
  for (let y=startY;y<=endY;y+=stepWorld){ const s=w2s(0,y); ctx.beginPath(); ctx.moveTo(0,s.y); ctx.lineTo(canvas.width,s.y); ctx.stroke(); }
}
function drawStatic(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawGrid();

  // measurement line
  if (measurePts.length){
    ctx.strokeStyle='rgba(0,0,0,0.6)'; ctx.lineWidth=2*camera.scale;
    ctx.beginPath(); const a=w2s(measurePts[0].x,measurePts[0].y); ctx.moveTo(a.x,a.y);
    const b = measurePts[1] ? w2s(measurePts[1].x,measurePts[1].y) : null;
    const m = b || w2s(lastMouseWorld.x,lastMouseWorld.y);
    ctx.lineTo(m.x,m.y); ctx.stroke();
    if (measurePts.length===2){
      const mid = {x:(measurePts[0].x+measurePts[1].x)/2, y:(measurePts[0].y+measurePts[1].y)/2};
      const ms=w2s(mid.x,mid.y);
      ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.font=`${12*camera.scale}px sans-serif`;
      ctx.fillText(measureResult.textContent || '', ms.x+6, ms.y-6);
    }
  }

  // obstacles (optimized rendering with spatial culling)
  const viewport = getViewport();
  const visibleObstacles = spatialIndex.query(viewport);
  
  for (const ob of visibleObstacles){
    // Skip tiny obstacles when zoomed out (LOD)
    const screenSize = ob.type === 'polygon' ? 
      Math.min((ob.bounds.maxX - ob.bounds.minX), (ob.bounds.maxY - ob.bounds.minY)) * camera.scale :
      ob.radius * 2 * camera.scale;
    
    if (screenSize < 2) continue; // Skip if smaller than 2px
    
    // Use material-based colors and transparency
    const material = ob.material || 'concrete';
    const materialColor = getMaterialColor(material);
    const materialAlpha = getMaterialAlpha(material);
    
    // Convert hex color to RGB for rgba formatting
    const hexToRgb = (hex) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : {r: 102, g: 102, b: 102}; // Default gray
    };
    
    const rgb = hexToRgb(materialColor);
    const alpha = Math.max(0.3, Math.min(0.8, 0.4 + materialAlpha * 0.1)); // Base transparency
    const strokeAlpha = Math.max(0.5, Math.min(1.0, alpha + 0.2));
    
    if (ob.type === 'polygon') {
      // Draw polygon obstacle with cached path for performance
      ctx.beginPath();
      const firstPoint = w2s(ob.points[0].x, ob.points[0].y);
      ctx.moveTo(firstPoint.x, firstPoint.y);
      for (let i = 1; i < ob.points.length; i++) {
        const point = w2s(ob.points[i].x, ob.points[i].y);
        ctx.lineTo(point.x, point.y);
      }
      ctx.closePath();
      ctx.fillStyle=`rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
      ctx.fill();
      ctx.lineWidth=Math.max(1,1*camera.scale);
      ctx.strokeStyle=`rgba(${Math.max(0,rgb.r-40)},${Math.max(0,rgb.g-40)},${Math.max(0,rgb.b-40)},${strokeAlpha})`;
      ctx.stroke();
      
      if (selected && selected.type==='obstacle' && selected.ref===ob){
        ctx.lineWidth=Math.max(1,3*camera.scale);
        ctx.strokeStyle='rgba(0,120,255,0.9)'; ctx.stroke();
      }
      
      // Label with material name (only if obstacle is large enough)
      if (screenSize > 30) {
        const centerX = (ob.bounds.minX + ob.bounds.maxX) / 2;
        const centerY = (ob.bounds.minY + ob.bounds.maxY) / 2;
        const labelPos = w2s(centerX, centerY);
        ctx.fillStyle='#000'; ctx.font=`${12*camera.scale}px sans-serif`; 
        ctx.fillText(`Obs ${ob.id} (${MATERIALS[material]?.name || material})`, labelPos.x-50*camera.scale, labelPos.y-6*camera.scale);
      }
    } else {
      // Draw circular obstacle
      const s=w2s(ob.x,ob.y); const r=ob.radius*camera.scale;
      ctx.beginPath(); ctx.arc(s.x,s.y,r,0,Math.PI*2);
      ctx.fillStyle=`rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
      ctx.fill();
      ctx.lineWidth=Math.max(1,1*camera.scale);
      ctx.strokeStyle=`rgba(${Math.max(0,rgb.r-40)},${Math.max(0,rgb.g-40)},${Math.max(0,rgb.b-40)},${strokeAlpha})`;
      ctx.stroke();
      if (selected && selected.type==='obstacle' && selected.ref===ob){
        ctx.beginPath(); ctx.arc(s.x,s.y,r+4,0,Math.PI*2);
        ctx.strokeStyle='rgba(0,120,255,0.9)'; ctx.lineWidth=Math.max(1,2*camera.scale); ctx.stroke();
      }
      
      // Label (only if obstacle is large enough)
      if (screenSize > 30) {
        ctx.fillStyle='#000'; ctx.font=`${12*camera.scale}px sans-serif`; 
        ctx.fillText(`Obs ${ob.id} (${MATERIALS[material]?.name || material})`, s.x-r, s.y-r-6);
      }
    }
  }

  // ACK halos
  const now=performance.now(), pulseDuration=2000;
  for (const h of hives){
    if (!h.ackPulses) continue;
    h.ackPulses = h.ackPulses.filter(p=>(now-p.t)<pulseDuration);
    for (const p of h.ackPulses){
      const k=Math.min(1,(now-p.t)/pulseDuration); const s=w2s(h.x,h.y);
      ctx.beginPath(); ctx.arc(s.x,s.y,(14+10*k)*camera.scale,0,Math.PI*2);
      ctx.strokeStyle=`rgba(0,200,0,${1-k})`; ctx.lineWidth=4*camera.scale; ctx.stroke();
    }
  }

  // hives
  for (const h of hives){
    const s=w2s(h.x,h.y);
    ctx.fillStyle='green'; ctx.beginPath(); ctx.arc(s.x,s.y,10*camera.scale,0,Math.PI*2); ctx.fill();
    if (selected && selected.type==='hive' && selected.ref===h){
      ctx.beginPath(); ctx.arc(s.x,s.y,14*camera.scale,0,Math.PI*2);
      ctx.strokeStyle='rgba(0,120,255,0.9)'; ctx.lineWidth=2*camera.scale; ctx.stroke();
    }
    ctx.fillStyle='#000'; ctx.font=`${12*camera.scale}px sans-serif`; ctx.fillText(`${h.id} (TX ${h.txPower?.toFixed?.(1) ?? 1})`, s.x-42*camera.scale, s.y-15*camera.scale);
  }

  // server
  const ss=w2s(server.x,server.y);
  ctx.fillStyle='red'; ctx.beginPath(); ctx.arc(ss.x,ss.y,12*camera.scale,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#000'; ctx.font=`${12*camera.scale}px sans-serif`; ctx.fillText(server.id, ss.x-40*camera.scale, ss.y-15*camera.scale);
}
function drawWaves(){
  for (const o of waves){
    const cap = o.maxRadius ?? getRange();
    for (let i=0;i<SECTORS;i++){
      const a0=i*(2*Math.PI/SECTORS), a1=a0+(2*Math.PI/SECTORS);
      const eff=o.alpha*o.alphaSectors[i]; if (eff<=0) continue;
      const s=w2s(o.x,o.y);
      ctx.beginPath(); ctx.arc(s.x,s.y,Math.min(o.r,cap)*camera.scale,a0,a1);
      ctx.strokeStyle=(o.type==='DATA'?`rgba(0,150,255,${eff})`:`rgba(255,165,0,${eff})`);
      ctx.lineWidth=2*camera.scale; ctx.stroke();
    }
  }
}
function renderState(){
  if(!stateDirty) return;
  const out=[];
  out.push(`[App] LoRaHiveSim v${APP_VERSION}`);
  out.push(`[Camera] x=${camera.x.toFixed(1)} y=${camera.y.toFixed(1)} scale=${camera.scale.toFixed(2)}`);
  out.push(`[LoRa] SF=${lora.sf}, BW=${lora.bw}kHz, CR=4/${lora.cr}`);
  const rangeM = calcRealisticRangeMeters(lora.sf, lora.bw, txDbmDefault, fMHz);
  out.push(`  Realistic LOS range ≈ ${rangeM.toFixed(0)} m  (visual when enabled)`);
  out.push(`[Radio] realistic=${realistic} f=${fMHz}MHz, tx=${txDbmDefault} dBm, m/p=${metersPerPixel}`);
  out.push(`[Obstacles] ${obstacles.length}`);
  for (const o of obstacles) {
    if (o.type === 'polygon') {
      const centerX = (o.bounds.minX + o.bounds.maxX) / 2;
      const centerY = (o.bounds.minY + o.bounds.maxY) / 2;
      out.push(`  Obs ${o.id}: polygon (${o.points.length} pts), center:(${centerX.toFixed(0)}, ${centerY.toFixed(0)}), loss=${o.loss.toFixed(2)}`);
    } else {
      out.push(`  Obs ${o.id}: (x:${o.x.toFixed(0)}, y:${o.y.toFixed(0)}), R=${o.radius}, loss=${o.loss.toFixed(2)}`);
    }
  }
  out.push(`[Server] ${server.id}  seen:${serverSeen.size}`);
  for (const h of hives) out.push(`[Hive] ${h.id} (TX ${h.txPower?.toFixed?.(1) ?? 1})`);
  statePre.textContent = out.join("\n"); stateDirty=false;
}
function renderStats(){
  if(!statsDirty) return;
  const success = stats.dataSent ? (stats.originAcked / stats.dataSent * 100).toFixed(1) : '—';
  const avgHops = stats.deliveries ? (stats.totalHops / stats.deliveries).toFixed(2) : '—';
  const avgLat = stats.deliveries ? (stats.latencySumMs / stats.deliveries).toFixed(0) + ' ms' : '—';
  statsPre.textContent =
`DATA sent:       ${stats.dataSent}
To server:       ${stats.dataDelivered}
ACK to origin:   ${stats.originAcked} (success: ${success}%)
Relayed DATA:    ${stats.relaysData}
Relayed ACK:     ${stats.relaysAck}
TTL drops:       ${stats.ttlDrops}
Shadow drops:    ${stats.shadowDrops}
Dup ignored:     ${stats.dupIgnored}
Avg hops:        ${avgHops}
Avg latency:     ${avgLat}`;
  statsDirty=false;
}
function loop(){ drawStatic(); updateWaves(); drawWaves(); renderState(); renderStats(); drawMinimap(); requestAnimationFrame(loop); }
loop();

// --- Minimap ---
function drawMinimap(){
  const w=minimap.width,h=minimap.height; mctx.clearRect(0,0,w,h);
  const b=getWorldBounds(); const sx=w/(b.maxX-b.minX||1), sy=h/(b.maxY-b.minY||1); const ms=Math.min(sx,sy);
  const offX=(w-(b.maxX-b.minX)*ms)/2, offY=(h-(b.maxY-b.minY)*ms)/2;
  function mmx(wx){ return offX + (wx - b.minX)*ms; } function mmy(wy){ return offY + (wy - b.minY)*ms; }
  for (const o of obstacles){ 
    if (o.type === 'polygon') {
      mctx.beginPath();
      const firstPoint = {x: mmx(o.points[0].x), y: mmy(o.points[0].y)};
      mctx.moveTo(firstPoint.x, firstPoint.y);
      for (let i = 1; i < o.points.length; i++) {
        mctx.lineTo(mmx(o.points[i].x), mmy(o.points[i].y));
      }
      mctx.closePath();
      mctx.fillStyle='rgba(50,50,50,0.6)'; mctx.fill(); 
      mctx.strokeStyle='rgba(30,30,30,0.8)'; mctx.stroke();
    } else {
      mctx.beginPath(); mctx.arc(mmx(o.x),mmy(o.y),Math.max(2,o.radius*ms),0,Math.PI*2); 
      mctx.fillStyle='rgba(50,50,50,0.6)'; mctx.fill(); 
      mctx.strokeStyle='rgba(30,30,30,0.8)'; mctx.stroke();
    }
  }
  for (const h of hives){ mctx.beginPath(); mctx.arc(mmx(h.x),mmy(h.y),3,0,Math.PI*2); mctx.fillStyle='#2e8b57'; mctx.fill(); }
  mctx.beginPath(); mctx.arc(mmx(server.x),mmy(server.y),4,0,Math.PI*2); mctx.fillStyle='#d33'; mctx.fill();
  const vx=mmx(camera.x), vy=mmy(camera.y); const vw=(canvas.width/camera.scale)*ms, vh=(canvas.height/camera.scale)*ms;
  mctx.strokeStyle='#007bff'; mctx.lineWidth=2; mctx.strokeRect(vx,vy,vw,vh);
  minimap._map={b,ms,offX,offY,mmx,mmy};
}
let miniDragging=false;
minimap.addEventListener('mousedown', e=>{ miniDragging=true; panViaMinimap(e); });
minimap.addEventListener('mousemove', e=>{ if(miniDragging) panViaMinimap(e); });
window.addEventListener('mouseup', ()=>{ miniDragging=false; });
function panViaMinimap(e){
  const mm=minimap._map; if(!mm) return; const rect=minimap.getBoundingClientRect();
  const sx=e.clientX-rect.left, sy=e.clientY-rect.top;
  const wx=(sx-mm.offX)/mm.ms + mm.b.minX; const wy=(sy-mm.offY)/mm.ms + mm.b.minY;
  camera.x = wx - (canvas.width/2)/camera.scale; camera.y = wy - (canvas.height/2)/camera.scale;
}

// --- Interactions ---
canvas.addEventListener('contextmenu', e=> e.preventDefault());
window.addEventListener('keydown', e=>{ 
  if(e.code==='Space'){ spaceDown=true; document.body.style.cursor='grab'; }
  if(e.key==='Escape' && measureMode){ measurePts.length=0; measureResult.textContent=''; }
});
window.addEventListener('keyup', e=>{ if(e.code==='Space'){ spaceDown=false; document.body.style.cursor=''; } });

let downInfo = null;
let lastMouseWorld = {x:0,y:0};

canvas.addEventListener('mousedown', e=>{
  const rect=canvas.getBoundingClientRect(); const s={x:e.clientX-rect.left, y:e.clientY-rect.top}; const m=s2w(s.x,s.y);
  lastMouseWorld = m;
  if (spaceDown || e.button===1 || e.button===2){ panning=true; lastMouse=s; downInfo=null; return; }

  if (measureMode){
    const snap = findSnapPoint(m);
    measurePts.push(snap || {x:m.x, y:m.y, label:'pt'});
    if (measurePts.length>2) measurePts.shift();
    updateMeasureResult();
    return;
  }

  for (let i=obstacles.length-1;i>=0;i--){
    const ob=obstacles[i];
    if (obstacleContainsPoint(ob, m.x, m.y)) {
      setSelected({type:'obstacle', ref:ob});
      if (ob.type === 'polygon') {
        // For polygons, calculate center for drag offset
        const centerX = (ob.bounds.minX + ob.bounds.maxX) / 2;
        const centerY = (ob.bounds.minY + ob.bounds.maxY) / 2;
        currentDrag={type:'obstacle', ref:ob, dx:centerX-m.x, dy:centerY-m.y, isPolygon:true};
      } else {
        currentDrag={type:'obstacle', ref:ob, dx:ob.x-m.x, dy:ob.y-m.y};
      }
      downInfo=null; 
      return;
    }
  }
  for (const h of hives){
    if (Math.hypot(m.x-h.x,m.y-h.y)<15){
      setSelected({type:'hive', ref:h}); currentDrag={type:'hive', ref:h, dx:h.x-m.x, dy:h.y-m.y};
      downInfo = { type:'hive', ref:h, start:m, time:performance.now() };
      return;
    }
  }
  setSelected(null); downInfo = { type:'empty', start:m, time:performance.now() };
});
canvas.addEventListener('mousemove', e=>{
  const rect=canvas.getBoundingClientRect(); const s={x:e.clientX-rect.left, y:e.clientY-rect.top}; const m=s2w(s.x,s.y);
  lastMouseWorld = m;
  if (panning){ const dx=(s.x-lastMouse.x)/camera.scale; const dy=(s.y-lastMouse.y)/camera.scale; camera.x -= dx; camera.y -= dy; lastMouse=s; return; }
  if (!currentDrag) return;
  if (currentDrag.type==='obstacle'){ 
    if (currentDrag.isPolygon) {
      // Move polygon obstacle: translate all points
      const newCenterX = m.x + currentDrag.dx;
      const newCenterY = m.y + currentDrag.dy;
      const oldCenterX = (currentDrag.ref.bounds.minX + currentDrag.ref.bounds.maxX) / 2;
      const oldCenterY = (currentDrag.ref.bounds.minY + currentDrag.ref.bounds.maxY) / 2;
      const deltaX = newCenterX - oldCenterX;
      const deltaY = newCenterY - oldCenterY;
      
      for (const point of currentDrag.ref.points) {
        point.x += deltaX;
        point.y += deltaY;
      }
      currentDrag.ref.bounds = getPolygonBounds(currentDrag.ref.points);
    } else {
      currentDrag.ref.x = m.x + currentDrag.dx; 
      currentDrag.ref.y = m.y + currentDrag.dy;
    }
    stateDirty=true; 
  }
  else if (currentDrag.type==='hive'){ currentDrag.ref.x = m.x + currentDrag.dx; currentDrag.ref.y = m.y + currentDrag.dy; }
});
window.addEventListener('mouseup', e=>{
  panning=false;
  const rect=canvas.getBoundingClientRect(); const sEnd={x:e.clientX-rect.left, y:e.clientY-rect.top}; const mEnd=s2w(sEnd.x,sEnd.y);
  let clickedHive=false;
  if (downInfo && downInfo.type==='hive'){
    const moved = Math.hypot(mEnd.x - downInfo.start.x, mEnd.y - downInfo.start.y) > 5;
    const dt = performance.now() - downInfo.time;
    clickedHive = (!moved && dt < 300);
  }
  if (currentDrag){ currentDrag=null; }
  if (clickedHive){
    const h = downInfo.ref;
    emitWave(h, 'DATA');
    logs.textContent = `${h.id} ${currentLang==='fr' ? 'envoie ses données.' : 'sends its data.'}`;
  }
  downInfo=null;
});
canvas.addEventListener('wheel', e=>{
  const rect=canvas.getBoundingClientRect(); const s={x:e.clientX-rect.left, y:e.clientY-rect.top}; const m=s2w(s.x,s.y);
  if (selected && selected.type==='obstacle'){
    const ob=selected.ref; const d=Math.hypot(m.x-ob.x,m.y-ob.y);
    if (d <= ob.radius + 20){
      e.preventDefault();
      if (e.shiftKey){ const delta=(e.deltaY<0?0.01:-0.01); applyObstacleLoss(delta,true); }
      else { const delta=(e.deltaY<0?2:-2); applyObstacleRadius(delta,true); }
      return;
    }
  }
  e.preventDefault();
  const factor=(e.deltaY<0)?1.1:0.9; const old=camera.scale; const neu=clamp(old*factor,minScale,maxScale); if (neu===old) return;
  const mWorld=s2w(s.x,s.y); camera.x = mWorld.x - (s.x/neu); camera.y = mWorld.y - (s.y/neu); camera.scale=neu;
}, {passive:false});

// Palette drop
function startDrag(e){ const type=e.target.getAttribute('data-type'); e.dataTransfer.setData('text/plain', type); }
canvas.addEventListener('dragover', e=>{ e.preventDefault(); });
canvas.addEventListener('drop', e=>{
  e.preventDefault(); const rect=canvas.getBoundingClientRect(); const s={x:e.clientX-rect.left, y:e.clientY-rect.top}; const m=s2w(s.x,s.y);
  const type=e.dataTransfer.getData('text/plain');
  if (type==='hive'){ const nh={x:m.x,y:m.y,id:`Hive ${hives.length+1}`,txPower:1,seenData:new Set(),seenAck:new Set(),ackPulses:[], txPowerDbm: txDbmDefault}; hives.push(nh); spatialIndex.add(nh); setSelected({type:'hive', ref:nh}); stateDirty=true; }
  else if (type==='obstacle'){ 
    const r=clamp(Number(obsRadiusInput.value)||40,5,240); 
    const absorption=clamp(Number(obsLossInput.value)||0.35,0.00001,5); 
    const material = obsMaterial?.value || 'brick'; // Get selected material
    const no={id:obsCounter++,x:m.x,y:m.y,radius:r,loss:absorption*0.1,absorption,material,k:absorption}; 
    obstacles.push(no); 
    spatialIndex.add(no);
    setSelected({type:'obstacle', ref:no}); stateDirty=true; 
  }
});

// Selection & panels
function setSelected(sel){
  selected = sel;
  if (deleteBtn) deleteBtn.disabled = !selected;
  if (!selected || selected.type!=='obstacle'){
    obCtxHint.textContent = STRINGS[currentLang].obstacleContextHint;
    lblRadius.textContent = STRINGS[currentLang].radiusDefault;
    lblLoss.textContent = STRINGS[currentLang].absorptionDefault || "Absorption coeff. (default)";
  } else {
    obCtxHint.textContent = `${STRINGS[currentLang].obstacleContextHint.split(' →')[0]} — editing obstacle ID ${selected.ref.id}`;
    lblRadius.textContent = STRINGS[currentLang].radiusSelected;
    lblLoss.textContent = STRINGS[currentLang].absorptionSelected || "Absorption coeff. (selected)";
    obsRadiusInput.value = obsRadiusNum.value = selected.ref.radius;
    obsLossInput.value   = obsLossNum.value   = selected.ref.absorption || selected.ref.k || selected.ref.loss || 0.35;
    // Set material dropdowns if obstacle has a material
    if (obsMaterial && selected.ref.material) {
      obsMaterial.value = selected.ref.material;
    }
    if (selObsMaterial && selected.ref.material) {
      selObsMaterial.value = selected.ref.material;
    }
    // Also update selection panel material dropdown
    if (selObsMaterial && selected.ref.material) {
      selObsMaterial.value = selected.ref.material;
    }
  }
  if (!selected || selected.type!=='hive'){ selHivePanel.style.display='none'; noSelection.style.display=''; }
  else { noSelection.style.display='none'; selHivePanel.style.display=''; selHiveId.textContent=selected.ref.id; txPower.value=txPowerNum.value=selected.ref.txPower ?? 1; }
}
// Obstacle merged apply
function syncPair(r,n,apply){ function fr(){ const v=Number(r.value); n.value=v; apply(v);} function fn(){ const v=Number(n.value); r.value=v; apply(v);} r.addEventListener('input',fr); n.addEventListener('input',fn); }
function applyObstacleRadius(v,delta=false){ if (selected && selected.type==='obstacle'){ let nv=delta?selected.ref.radius+v:v; selected.ref.radius=clamp(nv,5,240); obsRadiusInput.value=obsRadiusNum.value=selected.ref.radius; stateDirty=true; } else { let nv=delta?(Number(obsRadiusInput.value)||40)+v:v; nv=clamp(nv,5,240); obsRadiusInput.value=obsRadiusNum.value=nv; } }
function applyObstacleLoss(v,delta=false){ 
  if (selected && selected.type==='obstacle'){ 
    let nv=delta?selected.ref.absorption+v:v; 
    selected.ref.absorption=clamp(nv,0.00001,5); 
    obsLossInput.value=obsLossNum.value=selected.ref.absorption; 
    stateDirty=true; 
  } else { 
    let nv=delta?(Number(obsLossInput.value)||0.35)+v:v; 
    nv=clamp(nv,0.00001,5); 
    obsLossInput.value=obsLossNum.value=nv; 
  } 
}
function applyObstacleMaterial(material){ 
  // Update the absorption coefficient based on material
  const alpha = getMaterialAlpha(material);
  obsLossInput.value = obsLossNum.value = alpha;
  
  if (selected && selected.type==='obstacle'){ 
    selected.ref.material=material; 
    selected.ref.absorption=alpha;
    stateDirty=true; 
  } 
}
syncPair(obsRadiusInput,obsRadiusNum, v=>applyObstacleRadius(v,false));
syncPair(obsLossInput,obsLossNum, v=>applyObstacleLoss(v,false));
syncPair(txPower,txPowerNum, v=>{ if(selected?.type==='hive'){ selected.ref.txPower=clamp(v,0.2,2); statsDirty=true; } });

// Material selection event listener with automatic absorption update
if (obsMaterial) {
  obsMaterial.addEventListener('change', () => {
    const material = obsMaterial.value;
    applyObstacleMaterial(material);
    
    // Auto-update absorption coefficient based on material
    const alpha = getMaterialAlpha(material);
    obsLossInput.value = obsLossNum.value = alpha;
    
    // Apply to selected obstacle if any
    if (selected && selected.type === 'obstacle') {
      selected.ref.absorption = alpha;
      selected.ref.k = alpha;
      stateDirty = true;
    }
  });
}

// Selection panel material dropdown event listener
if (selObsMaterial) {
  selObsMaterial.addEventListener('change', () => {
    const material = selObsMaterial.value;
    if (selected && selected.type === 'obstacle') {
      selected.ref.material = material;
      selected.ref.absorption = getMaterialAlpha(material);
      selected.ref.k = selected.ref.absorption;
      stateDirty = true;
    }
  });
}

// Initialize absorption coefficient based on default material
if (obsMaterial && obsLossInput && obsLossNum) {
  const defaultMaterial = obsMaterial.value || 'brick';
  const defaultAlpha = getMaterialAlpha(defaultMaterial);
  obsLossInput.value = obsLossNum.value = defaultAlpha;
}

// Selection panel material change listener
if (selObsMaterial) {
  selObsMaterial.addEventListener('change', () => {
    if (selected && selected.type === 'obstacle') {
      const material = selObsMaterial.value;
      const alpha = getMaterialAlpha(material);
      selected.ref.material = material;
      selected.ref.absorption = alpha;
      stateDirty = true;
    }
  });
}

// Measure tool helpers
function findSnapPoint(m){
  for (const h of hives){
    if (Math.hypot(m.x-h.x,m.y-h.y)<15) return {x:h.x,y:h.y,label:h.id};
  }
  if (Math.hypot(m.x-server.x,m.y-server.y)<18) return {x:server.x,y:server.y,label:server.id};
  return null;
}
function updateMeasureResult(){
  if (measurePts.length<2){
    measureResult.textContent = '';
    return;
  }
  const [a,b] = measurePts;
  const d_px = Math.hypot(a.x-b.x, a.y-b.y);
  const d_m = d_px * metersPerPixel;
  const txt = `${d_px.toFixed(1)} px  —  ${d_m.toFixed(1)} m  @ ${metersPerPixel} m/px`;
  measureResult.textContent = txt;
}

// Delete & reset
function deleteSelection(){ if(!selected)return; if(selected.type==='obstacle'){ obstacles=obstacles.filter(o=>o!==selected.ref); spatialIndex.remove(selected.ref); path2DCache.delete(selected.ref.id);} else if(selected.type==='hive'){ hives=hives.filter(h=>h!==selected.ref); spatialIndex.remove(selected.ref);} setSelected(null); stateDirty=true; }
if (deleteBtn) deleteBtn.addEventListener('click', deleteSelection);
window.addEventListener('keydown', e=>{ if((e.key==='Delete'||e.key==='Backspace')&&selected){ e.preventDefault(); deleteSelection(); } });
function resetStats(){ for (const k in stats) stats[k]=0; emittedAt.clear(); statsDirty=true; }
resetStatsBtn.addEventListener('click', resetStats);
function resetBoard(){ hives=[]; obstacles=[]; waves=[]; spatialIndex.clear(); path2DCache.clear(); serverSeen.clear(); emittedAt.clear(); seqCounter=1; obsCounter=1; setSelected(null); logs.textContent=''; debugLogs.textContent=''; camera.x=0; camera.y=0; camera.scale=1; resetStats(); stateDirty=true; }
if (resetBtn) resetBtn.addEventListener('click', resetBoard);

// Export / Import / URL share
function serializeState(){
  return {
    version:6,
    meta:{exportedAt:new Date().toISOString(), note:"LoRaHiveSim export", appVersion:APP_VERSION},
    server,
    settings:{waveSpeed,attenuation,baseRange,baseRxThresh,maxRetrans,sectors:SECTORS,lora,seqCounter,metersPerPixel,fMHz,txDbmDefault,realistic},
    camera,
    hives:hives.map(h=>({id:h.id,x:h.x,y:h.y,txPower:h.txPower??1,txPowerDbm:h.txPowerDbm??txDbmDefault,seenData:[...(h.seenData||[])],seenAck:[...(h.seenAck||[])]})),
    obstacles:obstacles.map(o=>({id:o.id,x:o.x,y:o.y,radius:o.radius,loss:o.loss})),
    serverSeen:[...serverSeen]
  };
}
function downloadJSON(filename,obj){ const blob=new Blob([JSON.stringify(obj,null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
function updateExportArea(){ exportArea.value = JSON.stringify(serializeState(), null, 2); }
exportBtn.addEventListener('click', ()=>{ const d=serializeState(); downloadJSON('lorahivesim.json', d); exportArea.value=JSON.stringify(d,null,2); });
exportToZoneBtn.addEventListener('click', updateExportArea);
copyExportBtn.addEventListener('click', async ()=>{ if(!exportArea.value) updateExportArea(); try{ await navigator.clipboard.writeText(exportArea.value);}catch(e){ debug('Clipboard error: '+e.message);} });
importBtn.addEventListener('click', ()=> importFile.click());
importFile.addEventListener('change', async (e)=>{ const f=e.target.files&&e.target.files[0]; if(!f)return; try{ const txt=await f.text(); const obj=JSON.parse(txt); loadState(obj, {fit:true}); updateExportArea(); }catch(err){ debug('Import error: '+err.message);} finally{ importFile.value=''; } });
importFromZoneBtn.addEventListener('click', ()=>{ try{ const txt=importArea.value.trim(); if(!txt) throw new Error('Empty'); const obj=JSON.parse(txt); loadState(obj, {fit:true}); updateExportArea(); }catch(err){ debug('Import error: '+err.message);} });
clearImportBtn.addEventListener('click', ()=>{ importArea.value=''; });

function loadState(obj, opts){
  if (!obj || typeof obj!=='object') throw new Error('Invalid object');
  const s=obj.settings||{};
  if (obj.server && isNum(obj.server.x)&&isNum(obj.server.y)){ server.x=obj.server.x; server.y=obj.server.y; }
  if (obj.server && typeof obj.server.id==='string') server.id=obj.server.id;
  if (isNum(obj.server?.txPowerDbm)) server.txPowerDbm = clamp(obj.server.txPowerDbm,0,30);
  if (isNum(s.waveSpeed)) waveSpeed=clamp(s.waveSpeed,0.5,20);
  if (isNum(s.attenuation)) attenuation=clamp(s.attenuation,0.0005,0.05);
  if (isNum(s.baseRange)) baseRange=clamp(s.baseRange,80,4000);
  if (isNum(s.baseRxThresh)) baseRxThresh=clamp(s.baseRxThresh,0.005,0.3);
  if (isNum(s.maxRetrans)) maxRetrans=clamp(s.maxRetrans,0,10);
  if (s.lora){ if(isNum(s.lora.sf)) lora.sf=clamp(s.lora.sf,7,12); if(isNum(+s.lora.bw)) lora.bw=(+s.lora.bw===125||+s.lora.bw===250||+s.lora.bw===500)?+s.lora.bw:125; if(isNum(+s.lora.cr)) lora.cr=clamp(+s.lora.cr,5,8); }
  if (isNum(s.seqCounter)) seqCounter=Math.max(1,Math.floor(s.seqCounter));
  if (obj.camera && isNum(obj.camera.x)&&isNum(obj.camera.y)&&isNum(obj.camera.scale)){ camera.x=obj.camera.x; camera.y=obj.camera.y; camera.scale=clamp(obj.camera.scale,minScale,maxScale); }
  if (isNum(s.metersPerPixel)) metersPerPixel = clamp(s.metersPerPixel, 0.001, 10000);
  if (isNum(s.fMHz)) fMHz = clamp(s.fMHz, 100, 10000);
  if (isNum(s.txDbmDefault)) txDbmDefault = clamp(s.txDbmDefault, 0, 30);
  realistic = !!s.realistic; realisticChk.checked = realistic;
  mppInput.value = metersPerPixel; freqInput.value = fMHz; txDbmInput.value = txDbmDefault;

  hives=(obj.hives||[]).map(h=>{ const x=isNum(h.x)?h.x:0,y=isNum(h.y)?h.y:0; const id=(typeof h.id==='string'&&h.id.trim())?h.id:`Hive ${Math.random().toFixed(4)}`; const txPower=isNum(h.txPower)?clamp(h.txPower,0.2,2):1; const seenData=new Set(Array.isArray(h.seenData)?h.seenData.filter(s=>typeof s==='string'):[]); const seenAck=new Set(Array.isArray(h.seenAck)?h.seenAck.filter(s=>typeof s==='string'):[]); const txPowerDbm=isNum(h.txPowerDbm)?clamp(h.txPowerDbm,0,30):txDbmDefault; return {x,y,id,txPower,txPowerDbm,seenData,seenAck,ackPulses:[]}; });
  obstacles=(obj.obstacles||[]).map(o=>{ const id=Number.isInteger(o.id)?o.id:null; const x=isNum(o.x)?o.x:0, y=isNum(o.y)?o.y:0; const radius=isNum(o.radius)?clamp(o.radius,5,240):40; const loss=isNum(o.loss)?clamp(o.loss,0,0.95):0.5; return {id,x,y,radius,loss}; });
  const maxId = obstacles.reduce((m,o)=>Math.max(m,Number.isInteger(o.id)?o.id:0),0); obsCounter=maxId+1; for (const o of obstacles){ if(!Number.isInteger(o.id)) o.id=obsCounter++; }

  serverSeen.clear();
  if (Array.isArray(obj.serverSeen)) for (const k of obj.serverSeen) if (typeof k==='string') serverSeen.add(k);
  waves=[]; setSelected(null); stateDirty=true; statsDirty=true;

  if (opts && opts.fit){ try{ fitCameraToBounds(getWorldBounds()); }catch(e){} }
  focusServer('fit', 600);
}

// URL share
function encodeToUrl(){ const b64=btoa(unescape(encodeURIComponent(JSON.stringify(serializeState())))); return `${location.origin}${location.pathname}#data=${b64}`; }
async function copyShareUrl(){ try{ const url=encodeToUrl(); history.replaceState(null,'',url); await navigator.clipboard.writeText(url);}catch(e){ debug('URL copy error: '+e.message); } }
function loadFromUrl(){ try{ const h=location.hash; if(!h||!h.startsWith('#data=')) return; const json=decodeURIComponent(escape(atob(h.slice(6)))); loadState(JSON.parse(json), {fit:true}); updateExportArea(); }catch(e){ debug('URL load error: '+e.message); } }
copyShareUrlBtn.addEventListener('click', copyShareUrl);
loadFromUrlBtn.addEventListener('click', loadFromUrl);
if (location.hash && location.hash.startsWith('#data=')) loadFromUrl();

// Accordions
accHeader.addEventListener('click', ()=>{ const isOpen=accBody.classList.contains('open'); accBody.classList.toggle('open', !isOpen); accHeader.classList.toggle('open', !isOpen); });
geoHeader.addEventListener('click', ()=>{ const isOpen=geoBody.classList.contains('open'); geoBody.classList.toggle('open', !isOpen); geoHeader.classList.toggle('open', !isOpen); });

// LoRa bindings
sfInput.value=lora.sf; bwInput.value=lora.bw; crInput.value=lora.cr; mppInput.value=metersPerPixel;
realisticChk.checked = realistic;
sfInput.addEventListener('input', ()=>{ lora.sf=clamp(+sfInput.value,7,12); stateDirty=true; statsDirty=true; });
bwInput.addEventListener('change', ()=>{ lora.bw=(+bwInput.value===125||+bwInput.value===250||+bwInput.value===500)?+bwInput.value:125; stateDirty=true; statsDirty=true; });
crInput.addEventListener('change', ()=>{ lora.cr=clamp(+crInput.value,5,8); stateDirty=true; statsDirty=true; });
mppInput.addEventListener('input', ()=>{ metersPerPixel = clamp(+mppInput.value,0.001,10000); geoMPP.value = metersPerPixel; stateDirty=true; });
realisticChk.addEventListener('change', ()=>{ realistic = realisticChk.checked; stateDirty=true; });
freqInput.addEventListener('input', ()=>{ fMHz = clamp(+freqInput.value,100,10000); stateDirty=true; });
txDbmInput.addEventListener('input', ()=>{ txDbmDefault = clamp(+txDbmInput.value,0,30); server.txPowerDbm = txDbmDefault; for (const h of hives){ if (!isNum(h.txPowerDbm)) h.txPowerDbm=txDbmDefault; } stateDirty=true; });

// Geo import
function llToXY(lat, lon, originLat, originLon, mpp){
  const R=6378137; const dLat=(lat-originLat)*Math.PI/180; const dLon=(lon-originLon)*Math.PI/180;
  const x=R*dLon*Math.cos(originLat*Math.PI/180); const y=R*dLat;
  return { x: x/mpp, y: -y/mpp };
}
loadGeoBtn.addEventListener('click', ()=>{
  try{
    const originLat = parseFloat(geoLat.value);
    const originLon = parseFloat(geoLon.value);
    const mpp = parseFloat(geoMPP.value);
    const optimize = geoOptimize?.checked || false;
    const tolerance = parseFloat(geoTolerance?.value || 1);
    
    metersPerPixel = mpp; 
    mppInput.value = metersPerPixel;

    const text = geoJsonArea.value;
    const textSize = new Blob([text]).size;
    
    // Use Web Worker for large files or if optimization is enabled
    if (optimize && textSize > 50000) { // > 50KB
      importGeoJSONAsync(text, {
        originLat,
        originLon,
        metersPerPixel: mpp,
        simplifyTolerance: tolerance / 111000, // Convert meters to degrees (approx)
        minAreaDeg2: 5e-8,
        batchSize: 1000
      });
    } else {
      // Fallback to synchronous import for small files
      importGeoJSONSync(text, originLat, originLon, mpp);
    }
  }catch(e){ debug('Geo import error: '+e.message); }
});

function importGeoJSONAsync(text, options) {
  // Initialize worker if needed
  if (!geoWorker) {
    try {
      geoWorker = new Worker('geo-import-worker.js');
      geoWorker.onmessage = handleWorkerMessage;
      geoWorker.onerror = (error) => {
        debug('Worker error: ' + error.message);
        geoProgress.style.display = 'none';
      };
    } catch (e) {
      debug('Worker creation failed, falling back to sync import: ' + e.message);
      importGeoJSONSync(text, options.originLat, options.originLon, options.metersPerPixel);
      return;
    }
  }
  
  // Show progress and start worker
  geoProgress.style.display = 'block';
  geoProgressText.textContent = 'Parsing GeoJSON...';
  loadGeoBtn.disabled = true;
  
  // Clear existing data
  obstacles = [];
  spatialIndex.clear();
  path2DCache.clear();
  
  geoWorker.postMessage({
    type: 'parse',
    payload: { text, options }
  });
}

function handleWorkerMessage(e) {
  const { type, payload } = e.data;
  
  if (type === 'batch') {
    addObstaclesBatch(payload);
  } else if (type === 'progress') {
    geoProgressText.textContent = `${payload.processed} / ${payload.total} features processed`;
  } else if (type === 'done') {
    geoProgress.style.display = 'none';
    loadGeoBtn.disabled = false;
    log(`GeoJSON import complete: ${payload.count} features processed from ${payload.features} total`);
    
    // Fit view to imported data
    try {
      fitCameraToBounds(getWorldBounds());
      focusServer('fit', 600);
    } catch (e) {
      debug('Auto-fit error: ' + e.message);
    }
  } else if (type === 'error') {
    geoProgress.style.display = 'none';
    loadGeoBtn.disabled = false;
    debug('Worker import error: ' + payload);
  }
}

function importGeoJSONSync(text, originLat, originLon, mpp) {
  // Original synchronous implementation (simplified)
  const obj = JSON.parse(text);
  if (!obj || obj.type!=='FeatureCollection') throw new Error('Must be a FeatureCollection');

  let bminX=Infinity,bminY=Infinity,bmaxX=-Infinity,bmaxY=-Infinity;

  for (const f of obj.features || []){
    const g=f.geometry||{}, p=f.properties||{};
    if (g.type==='Point'){
      const [lon,lat]=g.coordinates;
      const xy=llToXY(lat,lon,originLat,originLon,mpp);
      bminX=Math.min(bminX,xy.x); bminY=Math.min(bminY,xy.y); bmaxX=Math.max(bmaxX,xy.x); bmaxY=Math.max(bmaxY,xy.y);
      if ((p.name||'').toLowerCase()==='server'){ server.x=xy.x; server.y=xy.y; }
      else { const nh={x:xy.x,y:xy.y,id:`Hive ${hives.length+1}`,txPower:1,seenData:new Set(),seenAck:new Set(),ackPulses:[], txPowerDbm: txDbmDefault}; hives.push(nh); spatialIndex.add(nh); }
    } else if (g.type==='Polygon' || g.type==='MultiPolygon'){
      const polygons = g.type==='Polygon' ? [g.coordinates] : g.coordinates;
      
      for (const polygonCoords of polygons) {
        const points = [];
        for (const [lon,lat] of polygonCoords[0]) {
          const xy = llToXY(lat, lon, originLat, originLon, mpp);
          points.push({x: xy.x, y: xy.y});
        }
        
        if (points.length >= 3) {
          const bounds = getPolygonBounds(points);
          bminX=Math.min(bminX,bounds.minX); bminY=Math.min(bminY,bounds.minY); 
          bmaxX=Math.max(bmaxX,bounds.maxX); bmaxY=Math.max(bmaxY,bounds.maxY);
          
          const { material, k } = p.material ? 
            { material: p.material, k: getMaterialAlpha(p.material) } : 
            mapGeoFeatureToMaterial(p);
          
          const absorption = p.absorption ? clamp(+p.absorption, 0.00001, 5) : k;
          const loss = p.loss ? clamp(+p.loss, 0, 0.95) : absorption * 0.1;
          
          const no={id:obsCounter++, type:'polygon', points, loss, absorption, bounds, material, k}; 
          obstacles.push(no);
          spatialIndex.add(no);
        }
      }
    }
  }
  
  stateDirty=true;
  if (Number.isFinite(bminX) && Number.isFinite(bminY) && Number.isFinite(bmaxX) && Number.isFinite(bmaxY)){
    fitCameraToBounds({minX:bminX,minY:bminY,maxX:bmaxX,maxY:bmaxY});
  } else {
    fitCameraToBounds(getWorldBounds());
  }
  focusServer('fit', 600);
}

// Measure UI
measureToggleBtn.addEventListener('click', ()=>{
  measureMode = !measureMode;
  measurePanel.style.display = measureMode ? '' : 'none';
  if (!measureMode){ measurePts.length=0; measureResult.textContent=''; }
});
measureClearBtn.addEventListener('click', ()=>{ measurePts.length=0; measureResult.textContent=''; });
