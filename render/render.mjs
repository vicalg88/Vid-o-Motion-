// ---------------------------------------------------------------------------
// Rendu déterministe : serveur local + Chromium headless (WebGL SwiftShader)
// + ffmpeg. Chaque image est rendue, relue (readPixels) et envoyée en binaire.
//
//   node render/render.mjs --stills 0,90,300            -> PNG de contrôle
//   node render/render.mjs --from 0 --to 599 --workers 3 -> segments vidéo
//   node render/render.mjs --assemble                     -> MP4 final (+ audio)
// ---------------------------------------------------------------------------
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let pw;
try {
  pw = require('playwright');
} catch {
  pw = require('/opt/node22/lib/node_modules/playwright');
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf('--' + k);
  if (i < 0) return d;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const W = +arg('w', 1920);
const H = +arg('h', 1080);
const Q = +arg('q', 1);
const FPS = 60;
const TOTAL = 600;
const OUTDIR = path.join(ROOT, 'output');
const SEGDIR = path.resolve(arg('segdir', path.join(OUTDIR, 'segments')));
const STILLDIR = path.resolve(arg('stilldir', path.join(OUTDIR, 'stills')));
fs.mkdirSync(SEGDIR, { recursive: true });
fs.mkdirSync(STILLDIR, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.ttf': 'font/ttf', '.png': 'image/png' };

function run(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'], ...opts });
    p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`${cmd} exit ${c}`))));
  });
}

// ------------------------------------------------------------------ assemblage final
async function assemble() {
  const segs = fs.readdirSync(SEGDIR).filter((f) => f.endsWith('.mkv')).sort();
  if (!segs.length) throw new Error('aucun segment');
  const list = path.join(SEGDIR, 'list.txt');
  fs.writeFileSync(list, segs.map((s) => `file '${path.join(SEGDIR, s)}'`).join('\n'));
  const audio = path.resolve(arg('audio', path.join(OUTDIR, 'audio.wav')));
  const out = path.resolve(arg('out', path.join(OUTDIR, 'exprnc-motion.mp4')));
  const bitrate = String(arg('bitrate', '18M'));
  const common = [
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-tune', 'grain',
    '-b:v', bitrate, '-maxrate', String(Math.round(parseFloat(bitrate) * 1.5)) + 'M', '-bufsize', String(Math.round(parseFloat(bitrate) * 2)) + 'M',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-r', String(FPS), '-passlogfile', path.join(SEGDIR, 'x264pass'),
  ];
  const input = ['-y', '-hide_banner', '-loglevel', 'warning', '-f', 'concat', '-safe', '0', '-i', list];
  // passe 1 (analyse)
  await run('ffmpeg', [...input, ...common, '-pass', '1', '-an', '-f', 'mp4', '/dev/null']);
  // passe 2 (+ audio)
  const args = [...input];
  if (fs.existsSync(audio)) args.push('-i', audio);
  args.push(...common, '-pass', '2', '-movflags', '+faststart');
  if (fs.existsSync(audio)) args.push('-c:a', 'aac', '-b:a', '256k', '-shortest');
  args.push(out);
  await run('ffmpeg', args);
  console.log('vidéo écrite :', out);
}

if (arg('assemble', false)) {
  await assemble();
  process.exit(0);
}

// ------------------------------------------------------------------ plan de rendu
let frames = [];
const stills = arg('stills', null);
if (stills) frames = String(stills).split(',').map((s) => (s.includes('s') ? Math.round(parseFloat(s) * FPS) : +s));
else {
  const from = +arg('from', 0);
  const to = +arg('to', TOTAL - 1);
  for (let i = from; i <= to; i++) frames.push(i);
}
const WORKERS = stills ? Math.min(+arg('workers', 1), frames.length) : +arg('workers', 1);

// répartition en blocs contigus
const chunks = [];
const per = Math.ceil(frames.length / WORKERS);
for (let w = 0; w < WORKERS; w++) chunks.push(frames.slice(w * per, (w + 1) * per));

// ------------------------------------------------------------------ puits d'images
const sinks = new Map(); // frame -> handler(buffer)

function makeVideoSink(chunk) {
  const name = path.join(SEGDIR, `seg_${String(chunk[0]).padStart(4, '0')}.mkv`);
  const ff = spawn(
    'ffmpeg',
    ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-framerate', String(FPS), '-i', '-', '-vf', 'vflip', '-c:v', 'ffv1', '-level', '3', '-pix_fmt', 'bgr0', name],
    { stdio: ['pipe', 'inherit', 'inherit'] }
  );
  const done = new Promise((res, rej) => ff.on('exit', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
  return {
    write: (buf) => new Promise((res) => (ff.stdin.write(buf) ? res() : ff.stdin.once('drain', res))),
    close: async () => {
      ff.stdin.end();
      await done;
    },
  };
}

async function writeStill(i, buf) {
  const name = path.join(STILLDIR, `f${String(i).padStart(4, '0')}.png`);
  await new Promise((res, rej) => {
    const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', '-', '-vf', 'vflip', '-frames:v', '1', name], { stdio: ['pipe', 'inherit', 'inherit'] });
    ff.on('exit', (c) => (c === 0 ? res() : rej(new Error('ffmpeg still ' + c))));
    ff.stdin.end(buf);
  });
}

// ------------------------------------------------------------------ serveur
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/frame') {
    const i = +url.searchParams.get('i');
    const parts = [];
    req.on('data', (d) => parts.push(d));
    req.on('end', async () => {
      try {
        const buf = Buffer.concat(parts);
        const h = sinks.get(i);
        if (h) await h(buf);
        res.writeHead(200);
        res.end('ok');
      } catch (e) {
        console.error(e);
        res.writeHead(500);
        res.end(String(e));
      }
    });
    return;
  }
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

// ------------------------------------------------------------------ workers
const t0 = Date.now();
let doneCount = 0;
const total = frames.length;

async function worker(chunk, wi) {
  if (!chunk.length) return;
  const browser = await pw.chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: Math.min(W, 1920), height: Math.min(H, 1080) } });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`[w${wi}] ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => console.log(`[w${wi}] pageerror: ${e.message}`));
  await page.goto(`http://127.0.0.1:${PORT}/src/index.html?w=${W}&h=${H}&q=${Q}`);
  await page.waitForFunction(() => window.EXPRNC && (window.EXPRNC.ready || window.EXPRNC.error), null, { timeout: 180000 });
  const err = await page.evaluate(() => window.EXPRNC.error);
  if (err) throw new Error(err);
  const sink = stills ? null : makeVideoSink(chunk);
  for (const i of chunk) {
    sinks.set(i, stills ? (buf) => writeStill(i, buf) : (buf) => sink.write(buf));
    const r = await page.evaluate((i) => window.EXPRNC.renderFrame(i), i);
    sinks.delete(i);
    doneCount++;
    const el = (Date.now() - t0) / 1000;
    const eta = (el / doneCount) * (total - doneCount);
    process.stdout.write(`[w${wi}] frame ${i} (${(i / FPS).toFixed(2)}s) ${r.n} ss ${r.ms.toFixed(0)}ms | ${doneCount}/${total} | écoulé ${el.toFixed(0)}s, reste ~${eta.toFixed(0)}s\n`);
  }
  if (sink) await sink.close();
  await browser.close();
}

try {
  await Promise.all(chunks.map((c, i) => worker(c, i)));
} finally {
  server.close();
}
console.log(`terminé en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
