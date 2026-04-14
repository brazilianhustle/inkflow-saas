import { useState, useEffect, useRef } from 'react';

// ── Pixel art cyberpunk office — self-contained React + Canvas ──────────────
// Tile size 16px, scaled 2x. Grid 20x14. All art procedural (no assets).

const TILE = 16;
const SCALE = 2;
const COLS = 20;
const ROWS = 14;
const W = COLS * TILE;
const H = ROWS * TILE;

// ── Palette (cyberpunk: deep blues/purples + neon accents) ──
const C = {
  floorDark:  '#0a0a14',
  floorMid:   '#121228',
  floorHi:    '#1a1a38',
  floorGrate: '#05050c',
  puddle:     '#1b1b4a',
  puddleHi:   '#2d2d7a',
  oil:        '#080816',
  wallDark:   '#2a1f2f',
  wallMid:    '#3a2a42',
  wallHi:     '#4a3a55',
  wallCrack:  '#140c18',
  rust:       '#7a3a1a',
  pipe:       '#3a3a48',
  pipeHi:     '#5a5a72',
  neonCyan:   '#00f0ff',
  neonMag:    '#ff2abf',
  neonPurp:   '#b84dff',
  neonGreen:  '#3aff7a',
  neonPink:   '#ff6bb5',
  red:        '#ff3344',
  white:      '#e8e8f0',
  skin1:      '#f0c89a',
  skin2:      '#d6a478',
  skinShad:   '#a87850',
  hairRed:    '#e05a1a',
  hairRedHi:  '#ff8840',
  hairDark:   '#2a1a10',
  hairBrown:  '#3a241a',
  suit:       '#18181e',
  suitHi:     '#28282e',
  tieRed:     '#b01822',
  shirtWhite: '#e0e0e8',
  shirtShad:  '#b0b0c0',
  gold:       '#ffcc30',
  goldHi:     '#fff060',
  purpHood:   '#7a2ac0',
  purpHoodHi: '#9a4ae0',
  black:      '#08080c',
  shoeBrown:  '#4a2818',
  shadow:     'rgba(0,0,0,0.45)',
};

// ── Utility drawing ──
function px(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}
function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// ── Deterministic pseudo-random for per-tile variation ──
function hash(x, y, salt = 0) {
  let n = x * 374761393 + y * 668265263 + salt * 2147483647;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

// ── Tile renderers ──
function drawFloor(ctx, tx, ty) {
  const x = tx * TILE, y = ty * TILE;
  // base grating
  rect(ctx, x, y, TILE, TILE, C.floorMid);
  // grating lines
  for (let i = 0; i < TILE; i += 4) {
    rect(ctx, x, y + i, TILE, 1, C.floorDark);
  }
  for (let i = 0; i < TILE; i += 8) {
    rect(ctx, x + i, y, 1, TILE, C.floorGrate);
  }
  // highlights
  const h = hash(tx, ty, 1);
  if (h > 0.7) {
    // stain / crack
    const cx = x + Math.floor(h * 12) + 2;
    const cy = y + Math.floor(hash(tx, ty, 2) * 12) + 2;
    px(ctx, cx, cy, C.floorHi);
    px(ctx, cx + 1, cy, C.floorHi);
    if (h > 0.85) px(ctx, cx, cy + 1, C.oil);
  } else if (h > 0.45 && h < 0.55) {
    // tiny puddle
    rect(ctx, x + 4, y + 8, 6, 3, C.puddle);
    rect(ctx, x + 5, y + 9, 4, 1, C.puddleHi);
  }
}

function drawWall(ctx, tx, ty, variant) {
  const x = tx * TILE, y = ty * TILE;
  rect(ctx, x, y, TILE, TILE, C.wallMid);
  // brick-ish horizontal lines
  rect(ctx, x, y + 5, TILE, 1, C.wallDark);
  rect(ctx, x, y + 11, TILE, 1, C.wallDark);
  // verticals offset
  const off = (ty % 2) * 4;
  rect(ctx, x + (off + 3) % TILE, y, 1, 5, C.wallDark);
  rect(ctx, x + (off + 11) % TILE, y + 6, 1, 5, C.wallDark);
  // highlights on top edge
  rect(ctx, x, y, TILE, 1, C.wallHi);
  // cracks variant
  const h = hash(tx, ty, 3);
  if (h > 0.7) {
    rect(ctx, x + 2, y + 2, 1, 3, C.wallCrack);
    px(ctx, x + 3, y + 5, C.wallCrack);
  }
  // graffiti tag
  if (variant === 'tag1') {
    // "H" pink
    rect(ctx, x + 3, y + 6, 1, 5, C.neonPink);
    rect(ctx, x + 7, y + 6, 1, 5, C.neonPink);
    rect(ctx, x + 4, y + 8, 3, 1, C.neonPink);
    // dot
    px(ctx, x + 10, y + 7, C.neonCyan);
    px(ctx, x + 12, y + 10, C.neonGreen);
  } else if (variant === 'tag2') {
    // abstract purple swirl
    rect(ctx, x + 4, y + 4, 6, 1, C.neonPurp);
    rect(ctx, x + 4, y + 4, 1, 4, C.neonPurp);
    rect(ctx, x + 9, y + 5, 1, 3, C.neonPurp);
    rect(ctx, x + 5, y + 8, 5, 1, C.neonPurp);
    px(ctx, x + 11, y + 6, C.neonMag);
  } else if (variant === 'pipe') {
    // vertical rusted pipe
    rect(ctx, x + 6, y, 4, TILE, C.pipe);
    rect(ctx, x + 7, y, 1, TILE, C.pipeHi);
    rect(ctx, x + 6, y + 7, 4, 2, C.rust);
    rect(ctx, x + 6, y + 12, 4, 1, C.rust);
  } else if (variant === 'wires') {
    // exposed wire with sparks handled separately
    rect(ctx, x + 4, y + 2, 1, 10, C.black);
    rect(ctx, x + 8, y + 3, 1, 9, C.red);
    rect(ctx, x + 11, y + 2, 1, 11, C.neonGreen);
  }
}

function drawWindow(ctx, tx, ty, phase) {
  const x = tx * TILE, y = ty * TILE;
  rect(ctx, x, y, TILE, TILE, C.black);
  // distant skyline
  const sky = [C.neonPurp, C.neonMag, C.neonCyan, C.neonPink];
  for (let i = 0; i < 4; i++) {
    const bh = 4 + ((tx * 3 + i) % 5);
    const bx = x + i * 4;
    rect(ctx, bx, y + TILE - bh - 2, 3, bh, '#1a0a2a');
    // windows on buildings
    const lit = ((tx + i + Math.floor(phase * 4)) % 3) === 0;
    px(ctx, bx + 1, y + TILE - bh, lit ? sky[i] : '#3a1a4a');
    px(ctx, bx + 1, y + TILE - bh + 2, sky[(i + 1) % 4]);
  }
  // window frame
  rect(ctx, x, y, TILE, 1, C.pipe);
  rect(ctx, x, y + TILE - 1, TILE, 1, C.pipe);
  rect(ctx, x, y + TILE / 2, TILE, 1, C.pipeHi);
}

function drawDesk(ctx, tx, ty, screenPhase) {
  const x = tx * TILE, y = ty * TILE;
  // desk top (spans 2 tiles wide usually — caller places)
  rect(ctx, x, y + 6, TILE, 6, '#2a1a3a');
  rect(ctx, x, y + 6, TILE, 1, '#4a2a5a');
  rect(ctx, x, y + 11, TILE, 1, C.black);
  // legs
  rect(ctx, x + 1, y + 12, 2, 4, C.pipe);
  rect(ctx, x + TILE - 3, y + 12, 2, 4, C.pipe);
  // monitor
  rect(ctx, x + 3, y, 10, 7, C.black);
  rect(ctx, x + 4, y + 1, 8, 5, screenPhase > 0.5 ? C.neonCyan : C.neonMag);
  // screen lines
  rect(ctx, x + 5, y + 2, 6, 1, C.black);
  rect(ctx, x + 5, y + 4, 4, 1, C.black);
  // stand
  rect(ctx, x + 7, y + 7, 2, 2, C.pipe);
  // keyboard
  rect(ctx, x + 2, y + 9, 12, 2, C.wallDark);
  rect(ctx, x + 3, y + 9, 10, 1, C.pipeHi);
  // energy drink can
  px(ctx, x + 14, y + 7, C.neonGreen);
  px(ctx, x + 14, y + 8, C.red);
  px(ctx, x + 14, y + 9, C.red);
}

function drawRobotArm(ctx, tx, ty, phase) {
  const x = tx * TILE, y = ty * TILE;
  // base
  rect(ctx, x + 4, y + 12, 8, 4, C.pipe);
  rect(ctx, x + 5, y + 13, 6, 1, C.pipeHi);
  // arm segment rotating
  const a = Math.sin(phase * Math.PI * 2) * 2;
  rect(ctx, x + 7, y + 4 + a, 2, 9, C.wallHi);
  rect(ctx, x + 7 - 2, y + 2 + a, 6, 3, C.pipe);
  rect(ctx, x + 7 - 1, y + 2 + a, 4, 1, C.pipeHi);
  // claw led
  px(ctx, x + 8, y + 3 + a, C.neonGreen);
}

function drawServer(ctx, tx, ty, blink) {
  const x = tx * TILE, y = ty * TILE;
  rect(ctx, x + 2, y + 2, 12, 14, '#1a1a22');
  rect(ctx, x + 2, y + 2, 12, 1, C.pipeHi);
  // rack slots
  for (let i = 0; i < 4; i++) {
    rect(ctx, x + 3, y + 4 + i * 3, 10, 2, '#2a2a36');
    const on = ((blink * 4 + i) | 0) % 2;
    px(ctx, x + 4 + i, y + 5, on ? C.neonGreen : C.neonCyan);
    px(ctx, x + 10, y + 5 + i * 3, C.neonMag);
  }
}

function drawCouch(ctx, tx, ty) {
  const x = tx * TILE, y = ty * TILE;
  rect(ctx, x, y + 4, TILE * 2, 8, '#6a1a4a');
  rect(ctx, x, y + 4, TILE * 2, 2, '#8a2a6a');
  rect(ctx, x, y + 2, 4, 6, '#6a1a4a');
  rect(ctx, x + TILE * 2 - 4, y + 2, 4, 6, '#6a1a4a');
  // rips
  rect(ctx, x + 10, y + 7, 3, 1, C.black);
  rect(ctx, x + 20, y + 9, 2, 1, C.black);
  // cushion seams
  rect(ctx, x + TILE, y + 5, 1, 6, '#4a0a3a');
}

function drawFridge(ctx, tx, ty) {
  const x = tx * TILE, y = ty * TILE;
  rect(ctx, x + 1, y, TILE - 2, TILE * 2, '#d8d8e0');
  rect(ctx, x + 1, y, TILE - 2, 1, '#f0f0f8');
  rect(ctx, x + 1, y + TILE, TILE - 2, 1, '#a0a0b0');
  // stickers
  rect(ctx, x + 3, y + 3, 4, 3, C.neonMag);
  rect(ctx, x + 9, y + 5, 4, 3, C.neonCyan);
  rect(ctx, x + 4, y + 11, 5, 3, C.neonGreen);
  // handle
  rect(ctx, x + TILE - 4, y + 6, 1, 4, C.pipe);
}

function drawNeonSign(ctx, tx, ty, phase) {
  const x = tx * TILE, y = ty * TILE;
  rect(ctx, x, y + 4, TILE, 8, C.black);
  const flick = (Math.sin(phase * 8) + 1) * 0.5;
  const on = flick > 0.3;
  const col = on ? C.neonMag : '#3a1a2a';
  // "OPEN" letters (stylized)
  rect(ctx, x + 2, y + 6, 2, 4, col);
  rect(ctx, x + 2, y + 6, 3, 1, col);
  rect(ctx, x + 2, y + 9, 3, 1, col);
  rect(ctx, x + 6, y + 6, 2, 4, flick > 0.5 ? col : '#2a0a1a');
  rect(ctx, x + 6, y + 6, 3, 1, col);
  rect(ctx, x + 10, y + 6, 1, 4, col);
  rect(ctx, x + 10, y + 6, 3, 1, col);
  rect(ctx, x + 12, y + 6, 1, 2, col);
  rect(ctx, x + 13, y + 6, 1, 4, col);
}

function drawSpeaker(ctx, tx, ty, phase) {
  const x = tx * TILE, y = ty * TILE;
  rect(ctx, x + 3, y + 4, 10, 12, '#1a1a1a');
  rect(ctx, x + 3, y + 4, 10, 1, '#3a3a3a');
  // cones
  const pulse = (Math.sin(phase * 10) + 1) * 0.5;
  rect(ctx, x + 5, y + 6, 6, 4, '#2a2a2a');
  rect(ctx, x + 6, y + 7, 4, 2, pulse > 0.5 ? C.neonPurp : '#4a2a5a');
  rect(ctx, x + 5, y + 11, 6, 4, '#2a2a2a');
  rect(ctx, x + 6, y + 12, 4, 2, pulse > 0.5 ? C.neonCyan : '#2a3a4a');
}

// ── Character sprites (drawn per-frame) ──
// Each character: 10px wide x 18px tall, 4-frame walk cycle
function drawCharacter(ctx, char, time) {
  const { x, y, dir, moving, type } = char;
  const frame = moving ? Math.floor(time * 6) % 4 : 0;
  const bob = moving ? [0, -1, 0, -1][frame] : 0;
  const legA = moving ? [0, 1, 0, -1][frame] : 0;
  const legB = moving ? [0, -1, 0, 1][frame] : 0;
  const armA = moving ? [0, 1, 0, -1][frame] : 0;

  const px0 = Math.round(x);
  const py0 = Math.round(y) + bob;

  // shadow
  ctx.fillStyle = C.shadow;
  ctx.beginPath();
  ctx.ellipse(px0 + 5, py0 + 19, 5, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (type === 'ceo')   drawCEO(ctx, px0, py0, dir, legA, legB, armA, time);
  if (type === 'closer') drawCloser(ctx, px0, py0, dir, legA, legB, armA, time);
  if (type === 'trap')  drawTrap(ctx, px0, py0, dir, legA, legB, armA, time);
}

// facing: 0=down, 1=right, 2=up, 3=left
function drawCEO(ctx, x, y, dir, la, lb, aa, t) {
  const faceRight = dir === 1;
  const faceLeft  = dir === 3;
  const faceUp    = dir === 2;
  // legs
  rect(ctx, x + 3, y + 14 + la, 2, 4, C.suit);
  rect(ctx, x + 6, y + 14 + lb, 2, 4, C.suit);
  // shoes
  rect(ctx, x + 3, y + 17, 2, 1, C.black);
  rect(ctx, x + 6, y + 17, 2, 1, C.black);
  // suit body
  rect(ctx, x + 2, y + 8, 7, 7, C.suit);
  rect(ctx, x + 2, y + 8, 7, 1, C.suitHi);
  // lapels (V neck shape)
  rect(ctx, x + 4, y + 8, 1, 3, C.suitHi);
  rect(ctx, x + 6, y + 8, 1, 3, C.suitHi);
  // red tie
  rect(ctx, x + 5, y + 8, 1, 5, C.tieRed);
  rect(ctx, x + 5, y + 13, 1, 1, '#700c14');
  // arms
  rect(ctx, x + 1, y + 9 + aa, 1, 4, C.suit);
  rect(ctx, x + 9, y + 9 - aa, 1, 4, C.suit);
  // hand holding tablet (right hand in front)
  rect(ctx, x + 9, y + 12 - aa, 3, 2, C.neonCyan);
  px(ctx, x + 10, y + 13 - aa, C.white);
  // head/face
  rect(ctx, x + 3, y + 3, 5, 5, C.skin1);
  rect(ctx, x + 3, y + 7, 5, 1, C.skinShad);
  // vibrant red hair — volumoso
  rect(ctx, x + 2, y + 1, 7, 3, C.hairRed);
  rect(ctx, x + 3, y, 5, 1, C.hairRed);
  rect(ctx, x + 2, y + 4, 1, 2, C.hairRed);
  rect(ctx, x + 8, y + 4, 1, 2, C.hairRed);
  // hair highlights
  px(ctx, x + 4, y + 1, C.hairRedHi);
  px(ctx, x + 6, y, C.hairRedHi);
  px(ctx, x + 7, y + 2, C.hairRedHi);
  // sunglasses (reflect neon)
  if (!faceUp) {
    rect(ctx, x + 3, y + 5, 5, 1, C.black);
    rect(ctx, x + 3, y + 4, 2, 1, C.black);
    rect(ctx, x + 6, y + 4, 2, 1, C.black);
    // reflection
    px(ctx, x + 4, y + 5, ((t * 2) % 1) > 0.5 ? C.neonCyan : C.neonMag);
    px(ctx, x + 7, y + 5, C.neonPurp);
  }
}

function drawCloser(ctx, x, y, dir, la, lb, aa, t) {
  // legs (black slim)
  rect(ctx, x + 3, y + 14 + la, 2, 4, C.black);
  rect(ctx, x + 6, y + 14 + lb, 2, 4, C.black);
  // brown shoes
  rect(ctx, x + 3, y + 17, 2, 1, C.shoeBrown);
  rect(ctx, x + 6, y + 17, 2, 1, C.shoeBrown);
  // white shirt
  rect(ctx, x + 2, y + 8, 7, 7, C.shirtWhite);
  rect(ctx, x + 2, y + 8, 7, 1, C.shirtShad);
  // open collar V (skin showing)
  rect(ctx, x + 5, y + 8, 1, 3, C.skin1);
  px(ctx, x + 4, y + 9, C.skin1);
  px(ctx, x + 6, y + 9, C.skin1);
  // shirt buttons
  px(ctx, x + 5, y + 11, C.shirtShad);
  px(ctx, x + 5, y + 13, C.shirtShad);
  // arms
  rect(ctx, x + 1, y + 9 + aa, 1, 4, C.shirtWhite);
  rect(ctx, x + 9, y + 9 - aa, 1, 4, C.shirtWhite);
  // gold watch on left wrist
  const watchPulse = (Math.sin(t * 4) + 1) * 0.5 > 0.5;
  px(ctx, x + 1, y + 13 + aa, watchPulse ? C.goldHi : C.gold);
  px(ctx, x + 0, y + 13 + aa, C.gold);
  // head
  rect(ctx, x + 3, y + 3, 5, 5, C.skin2);
  rect(ctx, x + 3, y + 7, 5, 1, C.skinShad);
  // slicked back dark hair
  rect(ctx, x + 3, y + 2, 5, 2, C.hairBrown);
  rect(ctx, x + 2, y + 3, 1, 2, C.hairBrown);
  rect(ctx, x + 8, y + 3, 1, 2, C.hairBrown);
  px(ctx, x + 5, y + 2, '#5a3a2a');
  // aviator sunglasses
  if (dir !== 2) {
    rect(ctx, x + 3, y + 4, 2, 2, C.black);
    rect(ctx, x + 6, y + 4, 2, 2, C.black);
    px(ctx, x + 5, y + 5, C.black);
    px(ctx, x + 4, y + 4, C.neonCyan);
    px(ctx, x + 7, y + 4, C.neonPurp);
  }
}

function drawTrap(ctx, x, y, dir, la, lb, aa, t) {
  // baggy black pants
  rect(ctx, x + 2, y + 14 + la, 3, 4, C.black);
  rect(ctx, x + 6, y + 14 + lb, 3, 4, C.black);
  // sneakers with color detail
  rect(ctx, x + 2, y + 17, 3, 1, C.white);
  px(ctx, x + 2, y + 17, C.neonMag);
  rect(ctx, x + 6, y + 17, 3, 1, C.white);
  px(ctx, x + 8, y + 17, C.neonMag);
  // purple oversized hoodie
  rect(ctx, x + 1, y + 8, 9, 7, C.purpHood);
  rect(ctx, x + 1, y + 8, 9, 1, C.purpHoodHi);
  // hoodie pouch/kangaroo
  rect(ctx, x + 3, y + 12, 5, 2, '#5a1aa0');
  // arms
  rect(ctx, x + 0, y + 9 + aa, 2, 4, C.purpHood);
  rect(ctx, x + 9, y + 9 - aa, 2, 4, C.purpHood);
  // hands
  px(ctx, x + 0, y + 13 + aa, C.skin2);
  px(ctx, x + 10, y + 13 - aa, C.skin2);
  // head
  rect(ctx, x + 3, y + 3, 5, 5, C.skin2);
  rect(ctx, x + 3, y + 7, 5, 1, C.skinShad);
  // hood up partially — shows buzz cut
  rect(ctx, x + 3, y + 2, 5, 1, C.hairDark);
  // headphones around neck
  rect(ctx, x + 2, y + 7, 1, 2, C.black);
  rect(ctx, x + 8, y + 7, 1, 2, C.black);
  px(ctx, x + 2, y + 7, C.neonMag);
  px(ctx, x + 8, y + 7, C.neonCyan);
  // round sunglasses
  if (dir !== 2) {
    rect(ctx, x + 3, y + 4, 2, 2, C.black);
    rect(ctx, x + 6, y + 4, 2, 2, C.black);
    px(ctx, x + 4, y + 5, C.neonPurp);
    px(ctx, x + 7, y + 5, C.neonGreen);
  }
}

// ── Map layout — hand-crafted for good composition ──
// w = wall, f = floor, W = window, D = desk-top-left, d = desk-top-right,
// C = couch (2 wide), F = fridge, S = server, R = robot arm, N = neon sign,
// P = pipe wall, T = tag1 wall, t = tag2 wall, X = wires wall, K = speaker
const MAP = [
  'wwWWWWWWWWwwwwwwwwww',
  'wffffffffwffffffffPw',
  'wffffffffwffffffffPw',
  'TffffffffwffffffffRw',
  'wffffffffwffffffffRw',
  'wDdffDdffffffffDdffw',
  'wffffffffffffffffffw',
  'wffffffffffffffffffw',
  'tffffffCCffffffffSfw',
  'wffffffffffffffffSfw',
  'XffffffffffFfffffSfw',
  'wffffffffffFfffffffw',
  'wfffKfffffffffffffNw',
  'wwwwwwwwwwwwwwwwwwww',
];

// ── Main component ──
export default function CyberpunkOffice() {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const [panel, setPanel] = useState({
    victor: { mood: '😎', energy: 100, task: 'Strategy' },
    drake:  { mood: '🔥', energy: 85,  task: 'Closing' },
    zion:   { mood: '🎵', energy: 92,  task: 'Vibing' },
  });
  const [log, setLog] = useState([
    { tab: 'Local', who: 'System', txt: 'Welcome to the grid.', c: 'text-cyan-400' },
    { tab: 'Local', who: 'Victor', txt: 'Deploy incoming.',     c: 'text-red-300' },
    { tab: 'Local', who: 'Drake',  txt: 'Closed the whale. 💰',  c: 'text-yellow-300' },
    { tab: 'Local', who: 'Zion',   txt: 'yo this beat 🎧',       c: 'text-purple-300' },
  ]);
  const [activeTab, setActiveTab] = useState('Local');

  // init characters + particles
  useEffect(() => {
    stateRef.current = {
      time: 0,
      chars: [
        { type: 'ceo',    name: 'Victor', x: 60,  y: 90,  dir: 1, moving: true,
          path: [[60,90],[200,90],[200,150],[80,150],[60,90]], pi: 0, bubble: null },
        { type: 'closer', name: 'Drake',  x: 250, y: 140, dir: 0, moving: true,
          path: [[250,140],[250,200],[120,200],[120,140],[250,140]], pi: 0, bubble: null },
        { type: 'trap',   name: 'Zion',   x: 180, y: 110, dir: 3, moving: true,
          path: [[180,110],[60,110],[60,190],[180,190],[220,130],[180,110]], pi: 0, bubble: null },
      ],
      sparks: [],
      dust: Array.from({ length: 14 }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.08,
        vy: -0.02 - Math.random() * 0.03,
        life: Math.random(),
      })),
    };
  }, []);

  // animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    let raf;
    let last = performance.now();

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const S = stateRef.current;
      if (!S) { raf = requestAnimationFrame(frame); return; }
      S.time += dt;
      update(S, dt);
      render(ctx, S);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // periodically emit speech bubbles + energy drain
  useEffect(() => {
    const id = setInterval(() => {
      const S = stateRef.current; if (!S) return;
      const tasks = ['💻','🚀','📞','☕','🎵','🎮','💰','🤝'];
      const msgs = [
        { t:'💻', s:'Codando' }, { t:'🚀', s:'Deploy' },
        { t:'📞', s:'Fechando' }, { t:'☕', s:'Café' },
        { t:'🎵', s:'Som alto' }, { t:'🎮', s:'Gaming' },
        { t:'💰', s:'$$$' }, { t:'🤝', s:'Meeting' },
      ];
      const idx = Math.floor(Math.random() * S.chars.length);
      const m = msgs[Math.floor(Math.random() * msgs.length)];
      S.chars[idx].bubble = { txt: m.t, until: S.time + 2.5 };
      const names = ['victor','drake','zion'];
      const n = names[idx];
      setPanel((p) => ({
        ...p,
        [n]: { ...p[n], task: m.s, energy: Math.max(10, p[n].energy - Math.floor(Math.random() * 5)) },
      }));
      setLog((l) => {
        const nxt = [
          ...l,
          { tab:'Local', who: S.chars[idx].name, txt: `${m.t} ${m.s}`,
            c: idx === 0 ? 'text-red-300' : idx === 1 ? 'text-yellow-300' : 'text-purple-300' },
        ].slice(-20);
        return nxt;
      });
    }, 2600);
    return () => clearInterval(id);
  }, []);

  function assignTask(charIdx, emoji, label) {
    const S = stateRef.current; if (!S) return;
    S.chars[charIdx].bubble = { txt: emoji, until: S.time + 3 };
    const names = ['victor','drake','zion'];
    const n = names[charIdx];
    setPanel((p) => ({
      ...p,
      [n]: { ...p[n], task: label, energy: Math.min(100, p[n].energy + 8) },
    }));
    setLog((l) => [...l, {
      tab: 'Local', who: 'You', txt: `→ ${S.chars[charIdx].name}: ${emoji} ${label}`,
      c: 'text-cyan-300',
    }].slice(-20));
  }

  return (
    <div className="w-full min-h-screen bg-black text-gray-100 p-4 flex flex-col items-center font-mono">
      <div className="w-full max-w-4xl">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-bold">
            <span className="text-fuchsia-400">NEO</span>
            <span className="text-cyan-400">.OFFICE</span>
            <span className="text-gray-500"> // cyberpunk sim</span>
          </h1>
          <div className="text-xs text-gray-400">3 agents online · sector 7</div>
        </div>
        <div className="relative border border-fuchsia-900 rounded bg-black overflow-hidden shadow-[0_0_40px_rgba(255,42,191,0.25)]">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            style={{
              width: '100%',
              aspectRatio: `${W}/${H}`,
              imageRendering: 'pixelated',
              display: 'block',
            }}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/30" />
        </div>

        {/* Character cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <CharCard
            name="Victor" role="CEO" color="red" accent="bg-red-500"
            data={panel.victor}
            onTask={(emoji, label) => assignTask(0, emoji, label)}
          />
          <CharCard
            name="Drake" role="Closer" color="yellow" accent="bg-yellow-400"
            data={panel.drake}
            onTask={(emoji, label) => assignTask(1, emoji, label)}
          />
          <CharCard
            name="Zion" role="Trapstar" color="purple" accent="bg-purple-500"
            data={panel.zion}
            onTask={(emoji, label) => assignTask(2, emoji, label)}
          />
        </div>

        {/* Chat log */}
        <div className="mt-4 border border-gray-800 rounded bg-gray-950">
          <div className="flex border-b border-gray-800">
            {['Local','Global','Trade'].map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-3 py-1 text-xs border-r border-gray-800 ${
                  activeTab === t
                    ? 'bg-fuchsia-900/40 text-fuchsia-200'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                [{t}]
              </button>
            ))}
            <div className="flex-1" />
            <div className="px-3 py-1 text-xs text-gray-600">chat</div>
          </div>
          <div className="h-40 overflow-y-auto p-2 text-xs space-y-0.5">
            {log
              .filter((l) => activeTab === 'Local' ? l.tab === 'Local' : activeTab === 'Global' ? l.tab !== 'Trade' : l.tab === 'Trade')
              .map((l, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-gray-600">[{activeTab}]</span>
                  <span className={l.c + ' font-bold'}>{l.who}:</span>
                  <span className="text-gray-300">{l.txt}</span>
                </div>
              ))}
            {activeTab !== 'Local' && (
              <div className="text-gray-600 italic">No messages in {activeTab} channel...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CharCard({ name, role, accent, data, onTask }) {
  const tasks = [
    ['💻','Codando'],['🚀','Deploy'],['📞','Deal'],
    ['☕','Café'],['🎵','Som'],['🎮','Gaming'],
    ['💰','$$$'],['🤝','Meeting'],
  ];
  return (
    <div className="border border-gray-800 rounded bg-gray-950 p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="font-bold text-sm">{name}</div>
          <div className="text-xs text-gray-500">{role}</div>
        </div>
        <div className="text-2xl">{data.mood}</div>
      </div>
      <div className="mb-2">
        <div className="flex justify-between text-xs text-gray-400 mb-0.5">
          <span>Energy</span><span>{data.energy}%</span>
        </div>
        <div className="h-2 bg-gray-900 rounded overflow-hidden">
          <div className={`h-full ${accent} transition-all`} style={{ width: `${data.energy}%` }} />
        </div>
      </div>
      <div className="text-xs text-gray-400 mb-2">
        Task: <span className="text-gray-200">{data.task}</span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {tasks.map(([e, l]) => (
          <button
            key={l}
            onClick={() => onTask(e, l)}
            className="text-sm py-1 bg-gray-900 hover:bg-fuchsia-900/40 border border-gray-800 rounded"
            title={l}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Update logic ──
function update(S, dt) {
  for (const c of S.chars) {
    const [tx, ty] = c.path[c.pi];
    const dx = tx - c.x, dy = ty - c.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) {
      c.pi = (c.pi + 1) % c.path.length;
      c.moving = Math.random() > 0.15;
      if (!c.moving) setTimeout(() => { c.moving = true; }, 800 + Math.random() * 1500);
    } else {
      const sp = 18 * dt;
      c.x += (dx / d) * sp;
      c.y += (dy / d) * sp;
      if (Math.abs(dx) > Math.abs(dy)) c.dir = dx > 0 ? 1 : 3;
      else c.dir = dy > 0 ? 0 : 2;
    }
    if (c.bubble && c.bubble.until < S.time) c.bubble = null;
  }

  // sparks at wires tile (col 0, row 10)
  if (Math.random() < 0.2) {
    S.sparks.push({
      x: 0 * TILE + 8, y: 10 * TILE + 6,
      vx: (Math.random() - 0.3) * 1.2,
      vy: (Math.random() - 0.8) * 1.0,
      life: 0.6,
    });
  }
  for (const s of S.sparks) {
    s.x += s.vx; s.y += s.vy;
    s.vy += 0.06;
    s.life -= dt;
  }
  S.sparks = S.sparks.filter((s) => s.life > 0);

  for (const d of S.dust) {
    d.x += d.vx; d.y += d.vy;
    d.life -= dt * 0.3;
    if (d.life < 0 || d.y < 0) {
      d.x = Math.random() * W;
      d.y = H * 0.6 + Math.random() * (H * 0.3);
      d.life = 1;
    }
  }
}

// ── Render ──
function render(ctx, S) {
  // clear
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  const t = S.time;
  const pulse = (Math.sin(t * 2) + 1) * 0.5; // 0..1 slow
  const pulseFast = (Math.sin(t * 5) + 1) * 0.5;

  // tiles
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      const ch = MAP[ty][tx];
      if (ch === 'f' || ch === 'D' || ch === 'd' || ch === 'C' || ch === 'F' || ch === 'S' || ch === 'K' || ch === 'R') {
        drawFloor(ctx, tx, ty);
      }
      if (ch === 'w') drawWall(ctx, tx, ty);
      else if (ch === 'W') drawWindow(ctx, tx, ty, t * 0.5);
      else if (ch === 'T') { drawWall(ctx, tx, ty, 'tag1'); }
      else if (ch === 't') { drawWall(ctx, tx, ty, 'tag2'); }
      else if (ch === 'P') { drawWall(ctx, tx, ty, 'pipe'); }
      else if (ch === 'X') { drawWall(ctx, tx, ty, 'wires'); }
      else if (ch === 'N') drawNeonSign(ctx, tx, ty, t);
    }
  }

  // objects that overlap floor (Y-sorted with characters)
  const objects = [];
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      const ch = MAP[ty][tx];
      if (ch === 'D') objects.push({ y: ty * TILE + 14, draw: () => drawDesk(ctx, tx, ty, pulseFast) });
      if (ch === 'C' && MAP[ty][tx - 1] !== 'C') {
        objects.push({ y: ty * TILE + 12, draw: () => drawCouch(ctx, tx, ty) });
      }
      if (ch === 'F' && MAP[ty - 1] && MAP[ty - 1][tx] !== 'F') {
        objects.push({ y: ty * TILE + TILE * 2, draw: () => drawFridge(ctx, tx, ty) });
      }
      if (ch === 'S' && MAP[ty - 1][tx] !== 'S') {
        objects.push({ y: ty * TILE + 12, draw: () => drawServer(ctx, tx, ty, t) });
      }
      if (ch === 'R') objects.push({ y: ty * TILE + 14, draw: () => drawRobotArm(ctx, tx, ty, t * 0.5) });
      if (ch === 'K') objects.push({ y: ty * TILE + 14, draw: () => drawSpeaker(ctx, tx, ty, t) });
    }
  }

  // y-sort characters + objects
  const drawables = [
    ...objects,
    ...S.chars.map((c) => ({ y: c.y + 18, draw: () => drawCharacter(ctx, c, t) })),
  ];
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

  // speech bubbles on top
  for (const c of S.chars) {
    if (c.bubble) {
      const bx = Math.round(c.x) + 4;
      const by = Math.round(c.y) - 8;
      ctx.fillStyle = '#fff';
      ctx.fillRect(bx - 6, by - 6, 14, 9);
      ctx.fillStyle = '#000';
      ctx.fillRect(bx - 5, by - 5, 12, 7);
      // tail
      ctx.fillStyle = '#fff';
      ctx.fillRect(bx - 2, by + 3, 2, 2);
      ctx.fillStyle = '#000';
      ctx.fillRect(bx - 1, by + 3, 1, 1);
      // emoji text
      ctx.save();
      ctx.font = '7px monospace';
      ctx.fillStyle = '#0ff';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.bubble.txt, bx - 4, by - 1);
      ctx.restore();
    }
  }

  // sparks
  for (const s of S.sparks) {
    ctx.fillStyle = s.life > 0.3 ? C.neonCyan : C.neonMag;
    ctx.fillRect(s.x, s.y, 1, 1);
    if (s.life > 0.4) {
      ctx.fillStyle = C.white;
      ctx.fillRect(s.x + 1, s.y, 1, 1);
    }
  }

  // floating dust
  for (const d of S.dust) {
    ctx.fillStyle = `rgba(200,180,255,${0.25 * Math.max(0, d.life)})`;
    ctx.fillRect(d.x, d.y, 1, 1);
  }

  // neon pulsing glow overlay (dynamic lighting)
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.08 + pulse * 0.05;
  const grd = ctx.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, W);
  grd.addColorStop(0, 'rgba(184,77,255,0.6)');
  grd.addColorStop(0.5, 'rgba(0,240,255,0.25)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // scanlines
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#000';
  for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
  ctx.restore();

  // vignette
  ctx.save();
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
