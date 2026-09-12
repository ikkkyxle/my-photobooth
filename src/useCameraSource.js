/**
 * Camera source abstraction.
 *
 * The photobooth can be driven by two very different sources:
 *
 *   1. "dslr"   - a Canon EOS M100 tethered over USB, reached through the local
 *                 bridge in scripts/camera-bridge.js. Preview arrives as an
 *                 MJPEG stream that a plain <img> can render; stills are taken
 *                 by the camera itself at full sensor resolution.
 *
 *   2. "webcam" - the built-in laptop camera via getUserMedia. Used as a
 *                 fallback so the booth still works with no hardware attached.
 *
 * The two differ in a way that matters for framing: a laptop webcam is 16:9
 * (~1.78) while the M100's sensor is 3:2 (1.500), and the frame artwork expects
 * roughly 1.48. That is why webcam shots never filled the frame holes properly.
 * Consumers of this hook get the source's aspect ratio so they can crop
 * consistently instead of guessing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_BRIDGE = 'http://127.0.0.1:5001';

// Allow overriding at build time without touching code:
//   REACT_APP_CAMERA_BRIDGE=http://192.168.1.20:5001 npm start
export const BRIDGE_URL = (
  process.env.REACT_APP_CAMERA_BRIDGE || DEFAULT_BRIDGE
).replace(/\/+$/, '');

export const SOURCE_DSLR = 'dslr';
export const SOURCE_WEBCAM = 'webcam';

// Canon EOS sensor is 3:2. Webcam is almost always 16:9.
const ASPECT = {
  [SOURCE_DSLR]: 3 / 2,
  [SOURCE_WEBCAM]: 16 / 9,
};

async function fetchJson(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `HTTP ${response.status}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * useShutterEvents — subscribe to the bridge SSE stream.
 *
 * Calls onShutter({ dataUrl, ... }) when the physical shutter is pressed,
 * onTimeout() when the arm window expires without a press.
 * Returns { arm, disarm } helpers.
 *
 * When the bridge sends a photoUrl instead of inline base64, the hook fetches
 * the JPEG as a blob and converts it to a data URL before calling onShutter.
 * This is much faster than embedding multi-MB base64 in SSE.
 */
export function useShutterEvents({ onShutter, onTimeout, enabled = true }) {
  const onShutterRef = useRef(onShutter);
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => { onShutterRef.current = onShutter; }, [onShutter]);
  useEffect(() => { onTimeoutRef.current = onTimeout; }, [onTimeout]);

  useEffect(() => {
    if (!enabled) return;
    let es;
    let dead = false;

    function connect() {
      if (dead) return;
      es = new EventSource(`${BRIDGE_URL}/api/events`);

      es.addEventListener('shutter', async (e) => {
        try {
          const data = JSON.parse(e.data);
          if (!data.ok) {
            if (onShutterRef.current) onShutterRef.current(data);
            return;
          }
          // Prefer photoUrl (fast file download) over inline base64
          if (data.photoUrl && !data.dataUrl) {
            const photoAbsUrl = `${BRIDGE_URL}${data.photoUrl}`;
            const resp = await fetch(photoAbsUrl);
            if (!resp.ok) throw new Error(`Foto download gagal: ${resp.status}`);
            const blob = await resp.blob();
            const dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            data.dataUrl = dataUrl;
          }
          if (onShutterRef.current) onShutterRef.current(data);
        } catch (err) {
          if (onShutterRef.current) onShutterRef.current({ ok: false, error: err.message });
        }
      });

      es.addEventListener('shutter-timeout', () => {
        if (onTimeoutRef.current) onTimeoutRef.current();
      });

      es.onerror = () => {
        es.close();
        if (!dead) setTimeout(connect, 2000);
      };
    }

    connect();
    return () => {
      dead = true;
      if (es) es.close();
    };
  }, [enabled]);

  const arm = useCallback((timeoutSecs = 30) => {
    return fetchJson(`${BRIDGE_URL}/api/arm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeoutSecs }),
    }, 10000);
  }, []);

  const disarm = useCallback(() => {
    return fetchJson(`${BRIDGE_URL}/api/disarm`, { method: 'POST' }, 5000);
  }, []);

  return { arm, disarm };
}

/**
 * Probe the bridge and decide which source to use.
 *
 * Returns:
 *   status      'probing' | 'dslr-ready' | 'webcam-fallback'
 *   source      SOURCE_DSLR | SOURCE_WEBCAM | null
 *   info        bridge /api/status payload when reachable
 *   aspectRatio numeric aspect of the active source
 *   streamUrl   MJPEG url for the DSLR preview (null for webcam)
 *   capture()   returns a JPEG/PNG data URL from the active source
 */
export function useCameraSource({ webcamRef } = {}) {
  const [status, setStatus] = useState('probing');
  const [source, setSource] = useState(null);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  // Cache-busting token so remounting the <img> restarts the MJPEG stream
  // rather than reusing a dead connection.
  const [streamToken, setStreamToken] = useState(() => Date.now());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const probe = useCallback(async ({ force = false } = {}) => {
    setStatus('probing');
    setError(null);
    try {
      const url = `${BRIDGE_URL}/api/status${force ? '?force=1' : ''}`;
      const payload = await fetchJson(url, {}, 20000);
      if (!mounted.current) return;

      setInfo(payload);

      if (payload.cameraConnected) {
        setSource(SOURCE_DSLR);
        setStatus('dslr-ready');
        setStreamToken(Date.now());
      } else {
        // Bridge is up but no camera is attached. Fall back rather than
        // stranding the operator with a dead preview.
        setSource(SOURCE_WEBCAM);
        setStatus('webcam-fallback');
        setError(
          payload.hints && payload.hints.length
            ? payload.hints[0]
            : 'Kamera M100 tidak terdeteksi oleh bridge.'
        );
      }
    } catch (err) {
      if (!mounted.current) return;
      setInfo(null);
      setSource(SOURCE_WEBCAM);
      setStatus('webcam-fallback');
      setError(
        err.name === 'AbortError'
          ? 'Bridge kamera tidak menjawab (timeout).'
          : `Bridge kamera tidak berjalan di ${BRIDGE_URL}.`
      );
    }
  }, []);

  useEffect(() => {
    probe();
  }, [probe]);

  // Exposed as camera.retry — force a fresh detect (bypasses cache)
  const retry = useCallback(() => probe({ force: true }), [probe]);

  const capture = useCallback(async () => {
    if (source === SOURCE_DSLR) {
      const payload = await fetchJson(
        `${BRIDGE_URL}/api/capture`,
        { method: 'POST' },
        // A tethered shutter release includes autofocus and the download of a
        // multi-megabyte JPEG over USB, so this is deliberately generous.
        60000
      );
      if (!payload.dataUrl) throw new Error('Bridge tidak mengirim gambar.');
      return { dataUrl: payload.dataUrl, source: SOURCE_DSLR, mirrored: false };
    }

    const webcam = webcamRef && webcamRef.current;
    if (!webcam) throw new Error('Webcam belum siap.');
    const dataUrl = webcam.getScreenshot();
    if (!dataUrl) throw new Error('Gagal mengambil gambar dari webcam.');
    // Webcam preview is mirrored for the operator's benefit, so the stored
    // frame must be flipped back to match what the preview showed.
    return { dataUrl, source: SOURCE_WEBCAM, mirrored: true };
  }, [source, webcamRef]);

  return {
    status,
    source,
    info,
    error,
    aspectRatio: ASPECT[source] || 3 / 2,
    streamUrl:
      source === SOURCE_DSLR ? `${BRIDGE_URL}/api/stream?t=${streamToken}` : null,
    isDslr: source === SOURCE_DSLR,
    retry,
    capture,
  };
}
