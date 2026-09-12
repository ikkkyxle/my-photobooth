#!/usr/bin/env node
/**
 * Camera bridge for tethered Canon EOS bodies (USB).
 *
 * WHY THIS EXISTS
 * ---------------
 * The browser's getUserMedia() can only see UVC-class video devices. Neither
 * the EOS M100 nor the EOS 3000D is a UVC device, and Canon's EOS Webcam
 * Utility does not support either body, so they can never appear in
 * navigator.mediaDevices. What they *do* speak over USB is PTP (Picture
 * Transfer Protocol) with Canon's EOS vendor extensions. libgphoto2 declares:
 *
 *     { "Canon:EOS M100", 0x04a9, 0x32d1, PTP_CAP | PTP_CAP_PREVIEW }
 *     { "Canon:EOS 4000D", 0x04a9, 0x32d9, PTP_CAP | PTP_CAP_PREVIEW
 *                                          | PTPBUG_DELETE_SENDS_EVENT }
 *
 * The EOS 3000D is the Asia-Pacific name for the same body Canon sells as the
 * EOS 4000D / Rebel T100, which is why it reports USB id 0x32d9 and why
 * libgphoto2 identifies it as "Canon EOS 4000D" even when the camera's own
 * menus say 3000D. Verified on this machine: Windows reported
 * `USB\VID_04A9&PID_32D9` with FriendlyName "Canon EOS 3000D".
 *
 * PTP_CAP         -> tethered shutter release (full resolution capture)
 * PTP_CAP_PREVIEW -> live view preview stream (JPEG frames)
 *
 * This bridge drives gphoto2 locally and re-publishes it over HTTP in two
 * shapes the browser understands natively:
 *
 *     GET  /api/stream   multipart/x-mixed-replace MJPEG  -> <img src>
 *     POST /api/capture  full resolution JPEG as data URL -> the photostrip
 *
 * The usual Linux recipe pipes gphoto2 into a v4l2loopback device so the camera
 * masquerades as a webcam. That is not possible on WSL2 (no v4l2loopback in the
 * Microsoft kernel and no /dev/video*), so we skip V4L2 entirely and let the
 * browser consume MJPEG over HTTP instead. That also makes the bridge portable
 * to a Raspberry Pi or a native Linux box without changes.
 *
 * IMPORTANT: gphoto2 claims the USB interface exclusively. Live view and
 * still capture therefore cannot run at the same time. Every capture stops the
 * preview process, takes the shot, and restarts the preview. A mutex serialises
 * this so two rapid clicks can never fight over the USB handle.
 *
 * Usage:
 *     node scripts/camera-bridge.js                 # real camera
 *     node scripts/camera-bridge.js --simulate      # no hardware needed
 *     PORT=5000 node scripts/camera-bridge.js
 */

'use strict';

const http = require('http');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = Number(process.env.CAMERA_BRIDGE_PORT || process.env.PORT || 5001);
const SIMULATE = process.argv.includes('--simulate') || process.env.CAMERA_SIMULATE === '1';

// Canon bodies this bridge is known to drive, per libgphoto2
// camlibs/ptp2/library.c. Both advertise PTP_CAP (tethered capture) and
// PTP_CAP_PREVIEW (live view), which is all the bridge needs.
//
// Note the 3000D naming: Canon sells one body under three regional names, so
// libgphoto2 reports it as "EOS 4000D" while the camera menu says "EOS 3000D".
// Both spellings are accepted so detection never fails on the label alone.
const SUPPORTED_CAMERAS = [
  { vendorId: 0x04a9, productId: 0x32d1, model: 'Canon EOS M100', aliases: ['EOS M100'] },
  {
    vendorId: 0x04a9,
    productId: 0x32d9,
    model: 'Canon EOS 3000D',
    aliases: ['EOS 4000D', 'EOS 3000D', 'Rebel T100'],
  },
];

// Kept for the startup banner and /api/status. Any supported body is accepted;
// this is only the default shown before detection runs.
const CAMERA = SUPPORTED_CAMERAS[0];

/** Match a gphoto2-reported model string against the supported list. */
function matchCamera(model) {
  if (!model) return null;
  return (
    SUPPORTED_CAMERAS.find((cam) =>
      cam.aliases.some((alias) => model.toLowerCase().includes(alias.toLowerCase()))
    ) || null
  );
}

// JPEG markers. gphoto2 --capture-movie emits concatenated JPEGs on stdout,
// so we resynchronise on SOI/EOI rather than trusting any framing.
const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);

const MJPEG_BOUNDARY = 'photoboothframe';
const MAX_BUFFER = 12 * 1024 * 1024; // guard against a desynced stream growing forever

// Live view reconnect policy. The EOS drops off the USB bus after gphoto2's
// --capture-movie ends (the "Movie capture error" path), so blindly respawning
// every second only spams gphoto2 and can never succeed. Instead: exponential
// backoff, capped, with a bounded number of automatic attempts. After that the
// bridge goes quiet and only retries on demand (a new viewer, a snapshot, or a
// capture), which is when the operator is actually back in front of the booth.
const RESTART_BASE_DELAY = 200;   // first reconnect cooldown, ms
const RESTART_MAX_DELAY = 10000;  // cap, ms
const RESTART_MAX_ATTEMPTS = 8;   // give up auto-retry after this many failures

// Directory for captured photos served via /api/photo/:id
const PHOTO_DIR = path.join(os.tmpdir(), 'photobooth-photos');
fs.mkdirSync(PHOTO_DIR, { recursive: true });

const log = (...args) => console.log(`[bridge ${new Date().toISOString()}]`, ...args);
const warn = (...args) => console.warn(`[bridge ${new Date().toISOString()}]`, ...args);
// Emits the explicit state transitions the operator (and tests) grep for.
const state = (label, ...args) => log(`[state:${label}]`, ...args);

function run(cmd, args, { timeout = 20000 } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 1 << 24 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error && typeof error.code === 'number' ? error.code : error ? 1 : 0,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        error: error ? error.message : null,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Simulated frame source, so the UI can be developed with no camera attached.
// ---------------------------------------------------------------------------

function buildSimulatedFrame(tick) {
  // A 3:2 JPEG matching the M100 sensor aspect, drawn with a moving gradient so
  // it is obvious the stream is live. Encoded via a tiny baseline JPEG writer
  // would be overkill; instead we ship a static JPEG and vary nothing but the
  // trailing comment, which decoders ignore.
  const width = 720;
  const height = 480;
  const header = Buffer.from(
    // Minimal 1x1 grey JPEG, scaled by the browser. Good enough as a placeholder.
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAwMDBkSEw8UHRofHh0a' +
      'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDs0NDT/wAALCAABAAEBAREA/8QAFAABAQAAAAAA' +
      'AAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/E' +
      'ABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJgA/9k=',
    'base64'
  );
  return { jpeg: header, width, height, tick };
}

// ---------------------------------------------------------------------------
// Live view: one long-lived gphoto2 process, fanned out to many HTTP clients.
// ---------------------------------------------------------------------------

class LiveView {
  constructor() {
    this.child = null;
    this.buffer = Buffer.alloc(0);
    this.latestFrame = null;
    this.frameCount = 0;
    this.subscribers = new Set();
    this.simulateTimer = null;
    this.stderrTail = [];
    this.wantRunning = false;
    this.lastError = null;
    this.cameraAvailable = false; // last-known camera presence
    this._retries = 0;            // consecutive reconnect failures
    this._restartTimer = null;    // pending reconnect timer
  }

  subscribe(fn) {
    this.subscribers.add(fn);
    this.start();
    if (this.latestFrame) fn(this.latestFrame);
    return () => {
      this.subscribers.delete(fn);
      if (this.subscribers.size === 0) this.stop('no subscribers left');
    };
  }

  emit(frame) {
    this.latestFrame = frame;
    this.frameCount += 1;
    for (const fn of this.subscribers) {
      try {
        fn(frame);
      } catch (err) {
        warn('subscriber threw', err.message);
      }
    }
  }

  start() {
    if (this.child || this.simulateTimer) return;
    if (captureInProgress) return; // never spawn gphoto2 while a capture owns the USB
    this.wantRunning = true;
    this.lastError = null;

    if (SIMULATE) {
      let tick = 0;
      this.cameraAvailable = true;
      this.simulateTimer = setInterval(() => {
        this.emit(buildSimulatedFrame(tick++).jpeg);
      }, 100);
      state('LIVEVIEW_START', 'simulated');
      state('CAMERA_CONNECTED', 'simulated');
      return;
    }

    // --set-config output=TFT requests the smaller TFT-sized preview from the
    // EOS instead of the full PC output. The TFT frame is typically 480×320 vs
    // 960×640, so it transfers in roughly a quarter of the time, cutting live
    // view latency significantly on WSL2/USB-IP without harming the still shot.
    // output=PC is kept as a fallback comment for future reference.
    const args = ['--set-config', 'output=TFT', '--capture-movie', '--stdout'];
    state('LIVEVIEW_START', 'gphoto2', args.join(' '));

    const child = spawn('gphoto2', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.child = child;
    this.buffer = Buffer.alloc(0);
    this.stderrTail = [];

    child.stdout.on('data', (chunk) => {
      // A real frame arrived: the camera is reachable again. Reset the
      // reconnect budget and mark the connection healthy.
      if (!this.cameraAvailable) {
        this.cameraAvailable = true;
        this._retries = 0;
        state('CAMERA_CONNECTED');
      }
      this.ingest(chunk);
    });

    child.stderr.on('data', (chunk) => {
      const text = String(chunk);
      this.stderrTail.push(text);
      if (this.stderrTail.length > 20) this.stderrTail.shift();
      if (/error|could not|busy|claim/i.test(text)) warn('gphoto2:', text.trim());
    });

    child.on('error', (err) => {
      this.lastError =
        err.code === 'ENOENT'
          ? 'gphoto2 is not installed. Run: scripts/setup-camera-wsl.sh'
          : err.message;
      warn('live view spawn failed:', this.lastError);
      this.child = null;
    });

    child.on('exit', (code, signal) => {
      state('LIVEVIEW_STOP', `code=${code} signal=${signal || '-'}`);
      this.child = null;
      this.buffer = Buffer.alloc(0);

      const stderrText = this.stderrTail.join('');
      this.stderrTail = [];
      const cameraNotFound = /no camera found/i.test(stderrText);

      if (cameraNotFound) {
        this.cameraAvailable = false;
        this.lastError = 'Camera not found';
        state(
          'CAMERA_UNAVAILABLE',
          stderrText.trim().split('\n').slice(-1)[0] || 'no camera found'
        );
      } else if (code !== 0 && !signal) {
        this.lastError = stderrText.trim().split('\n').slice(-3).join(' ');
      }

      // Only reconnect if we still want to run and the USB is free.
      if (this.wantRunning && this.subscribers.size > 0 && !captureInProgress) {
        this._scheduleReconnect(cameraNotFound);
      }
    });
  }

  _scheduleReconnect(cameraNotFound) {
    if (this._restartTimer) return; // already scheduled

    if (!cameraNotFound) {
      // Transient hiccup (e.g. the documented "Movie capture error" at the end
      // of a capture-movie run). Cool down briefly, then try once more.
      this._retries = 0;
      this._restartTimer = setTimeout(() => {
        this._restartTimer = null;
        this.start();
      }, RESTART_BASE_DELAY);
      return;
    }

    this._retries += 1;
    if (this._retries > RESTART_MAX_ATTEMPTS) {
      // Give up auto-retrying. The camera is genuinely absent; hammering it
      // cannot help. We stay quiet and resume on demand (new viewer / capture).
      this.wantRunning = false;
      state('CAMERA_UNAVAILABLE', 'auto-reconnect gave up; will retry on demand');
      return;
    }

    const delay = Math.min(
      RESTART_BASE_DELAY * 2 ** this._retries,
      RESTART_MAX_DELAY
    );
    state('CAMERA_RECONNECT', `attempt ${this._retries} in ${(delay / 1000).toFixed(1)}s`);
    this._restartTimer = setTimeout(() => {
      this._restartTimer = null;
      this.start();
    }, delay);
  }

  ingest(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;

    for (;;) {
      const start = this.buffer.indexOf(SOI);
      if (start === -1) {
        // No frame start in sight; keep only a sliver in case a marker straddles
        // the chunk boundary.
        if (this.buffer.length > 1) this.buffer = this.buffer.subarray(this.buffer.length - 1);
        return;
      }

      const end = this.buffer.indexOf(EOI, start + 2);
      if (end === -1) {
        if (start > 0) this.buffer = this.buffer.subarray(start);
        if (this.buffer.length > MAX_BUFFER) {
          warn('live view buffer overflow, resyncing');
          this.buffer = Buffer.alloc(0);
        }
        return;
      }

      this.emit(this.buffer.subarray(start, end + 2));
      this.buffer = this.buffer.subarray(end + 2);
    }
  }

  stop(reason) {
    this.wantRunning = false;

    // Cancel any pending restart timer so it does not fire after we've stopped.
    if (this._restartTimer) {
      clearTimeout(this._restartTimer);
      this._restartTimer = null;
    }

    if (this.simulateTimer) {
      clearInterval(this.simulateTimer);
      this.simulateTimer = null;
    }

    if (!this.child) return Promise.resolve();

    state('LIVEVIEW_STOP', 'requested:', reason);
    const child = this.child;
    this.child = null;

    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      child.once('exit', done);
      // SIGINT is what gphoto2 documents for ending --capture-movie cleanly;
      // it releases the USB claim instead of leaving the camera wedged.
      try {
        child.kill('SIGINT');
      } catch (_) {
        done();
      }
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch (_) {
          /* already gone */
        }
        done();
      }, 2500);
    });
  }

  get state() {
    if (this.simulateTimer) return 'simulated';
    if (this.child) return 'running';
    return 'stopped';
  }
}

const liveView = new LiveView();

// While true, live view must NOT spawn gphoto2: the capture path owns the USB
// handle exclusively. This is the single guard that keeps live view and still
// capture from ever overlapping on the camera.
let captureInProgress = false;

// ---------------------------------------------------------------------------
// Physical shutter arm/disarm state
// ---------------------------------------------------------------------------
//
// When the browser is ready for the next shot it calls POST /api/arm. The
// bridge spawns a gphoto2 --wait-event=N process that blocks until the
// physical shutter button is pressed. When gphoto2 reports
// "FILEADDED" / "CAPTURECOMPLETE" the bridge downloads the file, broadcasts
// an SSE "shutter" event to every connected browser tab, and disarms itself
// automatically. POST /api/disarm cancels the wait early.
//
// GET /api/events is a Server-Sent Events stream. The browser listens on it
// throughout the camera session and reacts to "shutter" events.

let shutterArmed = false;          // true while we are waiting for a press
let shutterProcess = null;         // running gphoto2 wait-event child
const sseClients = new Set();      // res objects subscribed to /api/events

function broadcastSSE(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch (_) { /* client gone */ }
  }
}

async function armShutter({ timeoutSecs = 30 } = {}) {
  if (shutterArmed) return { ok: true, already: true };
  if (captureInProgress) return { ok: false, error: 'capture in progress' };

  shutterArmed = true;

  if (SIMULATE) {
    setTimeout(async () => {
      if (!shutterArmed) return;
      shutterArmed = false;
      try {
        const shot = await captureStill();
        broadcastSSE('shutter', { ok: true, ...shot });
      } catch (err) {
        broadcastSSE('shutter', { ok: false, error: err.message });
      }
    }, 2000);
    return { ok: true, simulate: true };
  }

  // Stop live view so we can own the USB handle exclusively.
  captureInProgress = true;
  await liveView.stop('arm-shutter');

  const photoId = `shutter-${Date.now()}`;
  const target = path.join(PHOTO_DIR, `${photoId}.jpg`);

  state('SHUTTER_ARM', `waiting up to ${timeoutSecs}s for physical press`);

  const child = spawn(
    'gphoto2',
    [
      '--set-config', 'capturetarget=0',
      '--wait-event-and-download=' + timeoutSecs + 's',
      '--filename', target,
      '--force-overwrite',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  shutterProcess = child;
  const stderrLines = [];

  child.stderr.on('data', (chunk) => {
    const text = String(chunk);
    stderrLines.push(text);
    if (stderrLines.length > 30) stderrLines.shift();
    if (/error|could not|busy|claim/i.test(text)) warn('shutter-wait gphoto2:', text.trim());
  });

  child.stdout.on('data', () => {}); // drain

  child.on('exit', async (code, signal) => {
    shutterProcess = null;
    captureInProgress = false;
    const wasArmed = shutterArmed;
    shutterArmed = false;

    // Restart live view ASAP so the preview comes back fast.
    if (liveView.subscribers.size > 0) setTimeout(() => liveView.start(), 50);

    if (!wasArmed || signal === 'SIGKILL') {
      try { fs.unlinkSync(target); } catch (_) {}
      return;
    }

    if (fs.existsSync(target) && fs.statSync(target).size > 0) {
      const bytes = fs.statSync(target).size;
      state('SHUTTER_FIRED', `bytes=${bytes} id=${photoId}`);
      // Send URL instead of base64 — MUCH faster for multi-MB JPEGs
      broadcastSSE('shutter', {
        ok: true,
        photoUrl: `/api/photo/${photoId}`,
        bytes,
      });
      // Auto-cleanup photo after 5 minutes
      setTimeout(() => { try { fs.unlinkSync(target); } catch (_) {} }, 5 * 60 * 1000);
    } else {
      const detail = stderrLines.join('').trim().split('\n').slice(-3).join(' ');
      const timed  = code === 0 && !fs.existsSync(target);
      state('SHUTTER_TIMEOUT_OR_ERROR', detail || `code=${code}`);
      if (!timed) {
        broadcastSSE('shutter', { ok: false, error: detail || 'Shutter wait failed' });
      } else {
        broadcastSSE('shutter-timeout', {});
      }
      try { fs.unlinkSync(target); } catch (_) {}
    }
  });

  return { ok: true, armed: true, timeoutSecs };
}

function disarmShutter() {
  if (!shutterArmed && !shutterProcess) return { ok: true, wasArmed: false };
  shutterArmed = false;
  state('SHUTTER_DISARM', 'requested');
  if (shutterProcess) {
    try { shutterProcess.kill('SIGKILL'); } catch (_) { /* gone */ }
    shutterProcess = null;
  }
  captureInProgress = false;
  if (liveView.subscribers.size > 0) setTimeout(() => liveView.start(), 50);
  return { ok: true, wasArmed: true };
}

// ---------------------------------------------------------------------------
// USB serialisation: only one gphoto2 operation may touch the camera at a time.
// ---------------------------------------------------------------------------

let usbChain = Promise.resolve();
function withCamera(label, task) {
  const run = usbChain.then(
    () => task(),
    () => task()
  );
  // Keep the chain alive even when a task rejects.
  usbChain = run.then(
    () => undefined,
    () => undefined
  );
  return run.catch((err) => {
    warn(`${label} failed:`, err.message);
    throw err;
  });
}

// ---------------------------------------------------------------------------
// Detection / diagnostics
// ---------------------------------------------------------------------------

// Cache the last successful detection result so /api/status never runs
// gphoto2 --summary on every browser probe. A full re-detect only happens
// at bridge startup, when the user clicks "cek ulang", or after a capture
// error that suggests the camera state changed.
let _detectCache = null;
let _detectCacheAge = 0;
const DETECT_CACHE_TTL = 30000; // 30 s

async function detect({ force = false } = {}) {
  const now = Date.now();
  if (!force && _detectCache && (now - _detectCacheAge) < DETECT_CACHE_TTL) {
    return _detectCache;
  }
  const result = await _detectImpl();
  _detectCache = result;
  _detectCacheAge = now;
  return result;
}

async function _detectImpl() {
  if (SIMULATE) {
    return {
      simulate: true,
      gphoto2: true,
      cameraConnected: true,
      model: `${CAMERA.model} (simulated)`,
      port: 'simulated',
      hints: [],
    };
  }

  const hints = [];
  const version = await run('gphoto2', ['--version'], { timeout: 8000 });

  if (!version.ok) {
    return {
      simulate: false,
      gphoto2: false,
      cameraConnected: false,
      model: null,
      port: null,
      hints: [
        'gphoto2 is not installed or not on PATH.',
        'Run: bash scripts/setup-camera-wsl.sh',
      ],
    };
  }

  const libVersion = (version.stdout.match(/libgphoto2\s+(\d+\.\d+\.\d+)/) || [])[1] || null;
  if (libVersion) {
    const [maj, min, patch] = libVersion.split('.').map(Number);
    // EOS M capture landed in 2.5.19; older builds report the camera but fail
    // every shutter release with "Unsupported operation".
    if (maj < 2 || (maj === 2 && (min < 5 || (min === 5 && patch < 19)))) {
      hints.push(
        `libgphoto2 ${libVersion} is too old for EOS M capture. Upgrade to 2.5.19 or newer.`
      );
    }
  }

  const detected = await run('gphoto2', ['--auto-detect'], { timeout: 15000 });
  const lines = detected.stdout.split('\n').slice(2);
  let model = null;
  let port = null;

  for (const line of lines) {
    const match = line.match(/^(.*?)\s{2,}(usb:[\d,]*|ptpip:.*|disk:.*)\s*$/);
    if (match && match[1].trim()) {
      model = match[1].trim();
      port = match[2].trim();
      break;
    }
  }

  if (!model) {
    hints.push('No camera detected by gphoto2.');
    hints.push('Camera must be ON, in still-image mode (not movie mode), with an SD card in.');
    hints.push('On WSL2 the USB device must be attached first: see scripts/attach-camera.ps1');
    hints.push('On the EOS 3000D, set MENU > Wi-Fi to Disable: Wi-Fi cuts the USB path.');
  } else if (!matchCamera(model)) {
    hints.push(
      `Detected "${model}", which is not in the verified list ` +
        `(${SUPPORTED_CAMERAS.map((c) => c.model).join(', ')}). Capture may still work over PTP.`
    );
  }

  // --auto-detect only reads the USB descriptor. It can report a camera even
  // when libusb cannot open/claim the PTP interface (I/O problem, busy USB,
  // stale USB/IP session). Probe the actual PTP session before advertising the
  // DSLR to the browser; otherwise the UI shows a dead live view as connected.
  let ptpReady = false;
  let ptpError = null;
  if (model && port) {
    const summary = await run('gphoto2', ['--port', port, '--summary'], { timeout: 15000 });
    ptpReady = summary.ok;
    if (!ptpReady) {
      ptpError = (summary.stderr || summary.stdout || summary.error || '')
        .trim().split('\n').filter(Boolean).slice(-1)[0] || 'PTP session could not be opened.';
      hints.push(`Camera USB terdeteksi, tetapi sesi PTP belum siap: ${ptpError}`);
      hints.push('Tutup bridge/gphoto2 lain, lalu detach dan attach ulang USB kamera.');
    }
  }

  if (model && /gvfs|gphoto2-volume-monitor/i.test(detected.stderr)) {
    hints.push('A desktop file manager has mounted the camera; unmount it so gphoto2 can claim it.');
  }

  return {
    simulate: false,
    gphoto2: true,
    libgphoto2: libVersion,
    cameraConnected: Boolean(model && ptpReady),
    usbDetected: Boolean(model),
    ptpReady,
    ptpError,
    model,
    port,
    matched: matchCamera(model),
    hints,
  };
}

// ---------------------------------------------------------------------------
// Still capture (full sensor resolution, straight off the camera)
// ---------------------------------------------------------------------------

async function captureStill() {
  if (SIMULATE) {
    await new Promise((r) => setTimeout(r, 400));
    const frame = liveView.latestFrame || buildSimulatedFrame(0).jpeg;
    return { dataUrl: `data:image/jpeg;base64,${frame.toString('base64')}`, simulated: true };
  }

  // Claim the USB handle: stop live view and cancel any pending reconnect so a
  // stray respawn can never fight the capture for the camera.
  captureInProgress = true;
  await liveView.stop('capture requested');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'photobooth-'));
  const target = path.join(dir, 'shot.jpg');

  try {
    state('CAPTURE_START');

    // Primary path: --capture-image-and-download. Verified on this exact body
    // (EOS 3000D/4000D) with a full-resolution result. RAM capture (target=0)
    // keeps the SD card clean and avoids racing the camera's own numbering.
    let result = await run(
      'gphoto2',
      [
        '--capture-image-and-download',
        '--filename', target,
        '--force-overwrite',
        '--set-config', 'capturetarget=0',
      ],
      { timeout: 45000 }
    );

    // Fallback: some EOS bodies reject capture-image-and-download with
    // "PTP Device Busy" / "Full-Press failed". The remote-release path drives
    // the shutter button directly (Immediate) and then waits for the resulting
    // "object added" event to download it in the same session.
    if (!fs.existsSync(target)) {
      const detail = (result.stderr || result.stdout || result.error || '').trim();
      if (/busy|full.?press failed|io problem|device busy/i.test(detail)) {
        warn('capture-image-and-download rejected, retrying via eosremoterelease');
        result = await run(
          'gphoto2',
          [
            '--set-config', 'capturetarget=0',
            '--set-config', 'eosremoterelease=Immediate',
            '--wait-event-and-download=15s',
            '--filename', target,
            '--force-overwrite',
          ],
          { timeout: 45000 }
        );
      }
    }

    if (!fs.existsSync(target)) {
      const detail = (result.stderr || result.stdout || result.error || '').trim();
      let message = detail.split('\n').filter(Boolean).slice(-3).join(' ') || 'capture failed';

      if (/perhaps no focus|out of focus/i.test(detail)) {
        message = 'Camera could not autofocus. Give it more distance to the subject, or focus manually.';
      } else if (/could not claim|access denied|insufficient permissions/i.test(detail)) {
        message = 'USB device is not accessible by this user. Run: bash scripts/fix-camera-permissions.sh';
      } else if (/unsupported operation|generic capture|busy/i.test(detail)) {
        message = 'Camera rejected the capture. Make sure it is in still-image (M/P/A) mode, not movie mode.';
      } else if (/no camera/i.test(detail)) {
        message = 'Camera not found. Check the USB cable and that the camera is powered on.';
      }

      throw new Error(message);
    }

    const jpeg = fs.readFileSync(target);
    state('CAPTURE_SUCCESS', `bytes=${jpeg.length}`);
    return { dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}`, bytes: jpeg.length };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    captureInProgress = false;
    // Bring live view back so the operator sees the scene again.
    if (liveView.subscribers.size > 0) setTimeout(() => liveView.start(), 50);
  }
}

// ---------------------------------------------------------------------------
// HTTP surface
// ---------------------------------------------------------------------------

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(payload);
}

function streamMjpeg(req, res) {
  res.writeHead(200, {
    'Content-Type': `multipart/x-mixed-replace; boundary=${MJPEG_BOUNDARY}`,
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    Connection: 'close',
    'Access-Control-Allow-Origin': '*',
  });

  let writable = true;
  res.on('drain', () => {
    writable = true;
  });

  const unsubscribe = liveView.subscribe((frame) => {
    // Drop frames instead of queueing them; a stalled client must never make
    // the whole preview lag behind reality.
    if (!writable) return;
    writable = res.write(
      `--${MJPEG_BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`
    );
    writable = res.write(frame) && writable;
    writable = res.write('\r\n') && writable;
  });

  const cleanup = () => {
    unsubscribe();
    try {
      res.end();
    } catch (_) {
      /* already closed */
    }
  };

  req.on('close', cleanup);
  req.on('error', cleanup);
  res.on('error', cleanup);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  try {
    if (url.pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        simulate: SIMULATE,
        liveView: liveView.state,
        cameraAvailable: liveView.cameraAvailable,
        frames: liveView.frameCount,
        viewers: liveView.subscribers.size,
        lastError: liveView.lastError,
      });
    }

    if (url.pathname === '/api/status') {
      const force = url.searchParams.get('force') === '1';
      const info = await withCamera('status', () => detect({ force }));
      // Invalidate cache if PTP probe just failed so next probe retries properly
      if (!info.ptpReady) _detectCache = null;
      return sendJson(res, 200, {
        ...info,
        liveView: liveView.state,
        cameraAvailable: liveView.cameraAvailable,
        frames: liveView.frameCount,
        lastError: liveView.lastError,
        expected: SUPPORTED_CAMERAS,
      });
    }

    if (url.pathname === '/api/stream') {
      return streamMjpeg(req, res);
    }

    if (url.pathname === '/api/snapshot') {
      // Single JPEG from the preview stream. Handy for smoke tests.
      const frame = liveView.latestFrame;
      if (!frame) {
        liveView.start();
        return sendJson(res, 503, { error: 'no preview frame yet' });
      }
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Content-Length': frame.length,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      });
      return res.end(frame);
    }

    if (url.pathname === '/api/capture' && req.method === 'POST') {
      const shot = await withCamera('capture', captureStill);
      return sendJson(res, 200, { ok: true, ...shot });
    }

    // Serve captured photos by ID — avoids base64 overhead in SSE.
    const photoMatch = url.pathname.match(/^\/api\/photo\/([a-zA-Z0-9_-]+)$/);
    if (photoMatch && req.method === 'GET') {
      const photoFile = path.join(PHOTO_DIR, `${photoMatch[1]}.jpg`);
      if (!fs.existsSync(photoFile)) {
        return sendJson(res, 404, { error: 'photo not found' });
      }
      const stat = fs.statSync(photoFile);
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Content-Length': stat.size,
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      });
      fs.createReadStream(photoFile).pipe(res);
      return;
    }

    // SSE stream — browser subscribes here to receive shutter/shutter-timeout events.
    if (url.pathname === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(': connected\n\n');
      sseClients.add(res);
      const cleanup = () => sseClients.delete(res);
      req.on('close', cleanup);
      req.on('error', cleanup);
      // Keep-alive every 20s so proxies don't close the connection.
      const ping = setInterval(() => {
        try { res.write(': ping\n\n'); } catch (_) { cleanup(); clearInterval(ping); }
      }, 20000);
      req.on('close', () => clearInterval(ping));
      return; // never call res.end() — the stream stays open
    }

    // Arm the shutter: wait for a physical button press on the camera.
    if (url.pathname === '/api/arm' && req.method === 'POST') {
      if (shutterArmed) return sendJson(res, 200, { ok: true, already: true });
      const body = await new Promise((resolve) => {
        let raw = '';
        req.on('data', (c) => { raw += c; });
        req.on('end', () => { try { resolve(JSON.parse(raw)); } catch (_) { resolve({}); } });
      });
      const timeoutSecs = Number(body.timeoutSecs) || 30;
      const result = await armShutter({ timeoutSecs });
      return sendJson(res, result.ok ? 200 : 503, result);
    }

    // Disarm: cancel an in-progress wait.
    if (url.pathname === '/api/disarm' && req.method === 'POST') {
      return sendJson(res, 200, disarmShutter());
    }

    return sendJson(res, 404, { error: 'not found', path: url.pathname });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: err.message });
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    warn(`port ${PORT} is already in use.`);
    warn(`Another bridge is already running, or a stale process holds the port.`);
    warn(`Fix: pkill -f camera-bridge.js  (then re-run)`);
  } else {
    warn('server error:', err.message);
  }
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', async () => {
  log(`camera bridge listening on http://127.0.0.1:${PORT}`);
  log(`mode: ${SIMULATE ? 'SIMULATED (no hardware)' : 'live gphoto2'}`);
  log(
    `supported: ${SUPPORTED_CAMERAS.map(
      (c) => `${c.model} (${hex(c.vendorId)}:${hex(c.productId)})`
    ).join(', ')}`
  );

  if (!SIMULATE) {
    const info = await detect();
    if (info.cameraConnected) {
      liveView.cameraAvailable = true;
      state('CAMERA_CONNECTED', `${info.model} on ${info.port}`);

      // Speed optimisations: disable the camera's post-shot review screen so
      // the PTP session becomes available again immediately, and default the
      // capture target to RAM so we don't fill the SD card.
      const initCmds = [
        ['--set-config', 'reviewtime=0'],
        ['--set-config', 'capturetarget=0'],
      ];
      for (const args of initCmds) {
        const r = await run('gphoto2', args, { timeout: 8000 });
        if (r.ok) {
          log(`camera init: ${args.join(' ')} -> ok`);
        } else {
          // Best effort — not every body supports every config key.
          warn(`camera init: ${args.join(' ')} -> ${(r.stderr || r.error || '').trim().slice(0, 80)}`);
        }
      }
    } else {
      state('CAMERA_UNAVAILABLE', 'no camera detected at startup');
      info.hints.forEach((hint) => warn('hint:', hint));
    }
  }
});

function hex(n) {
  return `0x${n.toString(16).padStart(4, '0')}`;
}

async function shutdown(signal) {
  log(`${signal} received, releasing camera`);
  await liveView.stop('shutdown');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
