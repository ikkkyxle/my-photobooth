import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Webcam from 'react-webcam';

import { FRAMES, PLAIN_FRAME, TOTAL_PHOTOS, slotAspectRatio } from './frameSlots';
import { drawPhotostrip, exportPhotostrip } from './photostrip';
import {
  useCameraSource,
  useShutterEvents,
  BRIDGE_URL,
} from './useCameraSource';

const COUNTDOWN_SECONDS = 5;
const PREVIEW_WIDTH = 400;

const FRAME_CHOICES = [...FRAMES, PLAIN_FRAME];

function App() {
  const [step, setStep] = useState('welcome');
  const [photos, setPhotos] = useState([]);
  const [selectedFrame, setSelectedFrame] = useState(FRAMES[0]);
  const [activeFrame, setActiveFrame] = useState(FRAMES[0]);

  const [countdown, setCountdown] = useState(null);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [isCounting, setIsCounting] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureError, setCaptureError] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  // true = bridge is waiting for a physical shutter press
  const [isArmed, setIsArmed] = useState(false);
  // Frozen frame: snapshot the last MJPEG src via /api/snapshot so the screen
  // doesn't go black while the bridge stops live view for capture.
  const [frozenFrame, setFrozenFrame] = useState(null);

  const webcamRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const liveImgRef = useRef(null);

  const camera = useCameraSource({ webcamRef });

  // Capture a frozen frame from the MJPEG snapshot endpoint before arming
  const freezeLastFrame = useCallback(async () => {
    try {
      const resp = await fetch(`${BRIDGE_URL}/api/snapshot`);
      if (resp.ok) {
        const blob = await resp.blob();
        setFrozenFrame(URL.createObjectURL(blob));
      }
    } catch (_) {
      // If snapshot fails, just leave the MJPEG img as-is; it will go stale
      // but won't flash black.
    }
  }, []);

  // ---------------------------------------------------------------- capture

  const runCapture = useCallback(async (forcedDataUrl = null) => {
    setIsCapturing(true);
    setCaptureError(null);
    try {
      let shot;
      if (forcedDataUrl) {
        // Photo arrived from physical shutter event — already downloaded
        shot = { dataUrl: forcedDataUrl, source: 'dslr', mirrored: false };
      } else {
        shot = await camera.capture();
      }
      setPreviewPhoto(shot);
    } catch (err) {
      setCaptureError(err.message);
    } finally {
      setIsCapturing(false);
    }
  }, [camera]);

  // Physical shutter events (DSLR only) ---------------------------------
  const handleShutterEvent = useCallback((data) => {
    setIsArmed(false);
    if (data.ok && data.dataUrl) {
      runCapture(data.dataUrl);
    } else {
      setCaptureError(data.error || 'Shutter gagal, coba lagi.');
    }
  }, [runCapture]);

  const handleShutterTimeout = useCallback(() => {
    setIsArmed(false);
    // Auto re-arm: user might have been slow, keep waiting
    setTimeout(() => {
      reArmIfNeeded();
    }, 100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { arm, disarm } = useShutterEvents({
    onShutter: handleShutterEvent,
    onTimeout: handleShutterTimeout,
    enabled: camera.isDslr && step === 'camera',
  });

  // Auto-arm when entering the camera screen in DSLR mode
  useEffect(() => {
    if (step !== 'camera' || !camera.isDslr) return;
    if (isArmed || isCapturing || previewPhoto !== null) return;
    if (photos.length >= TOTAL_PHOTOS) return;
    setIsArmed(true);
    freezeLastFrame().then(() =>
      arm(60).catch((err) => {
        setIsArmed(false);
        setCaptureError('Arm gagal: ' + err.message);
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, camera.isDslr]);

  // Re-arm after each accepted photo (for DSLR mode)
  const reArmIfNeeded = useCallback(() => {
    if (!camera.isDslr || isArmed || isCapturing) return;
    if (photos.length >= TOTAL_PHOTOS) return;
    setIsArmed(true);
    setFrozenFrame(null); // clear old frozen frame — live view is active again
    freezeLastFrame().then(() =>
      arm(60).catch((err) => {
        setIsArmed(false);
        setCaptureError('Arm gagal: ' + err.message);
      })
    );
  }, [camera.isDslr, isArmed, isCapturing, photos.length, arm, freezeLastFrame]);

  // Webcam countdown flow (unchanged) -----------------------------------
  useEffect(() => {
    if (countdown === null) return undefined;

    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }

    // countdown hit zero
    setCountdown(null);
    setIsCounting(false);
    runCapture();
    return undefined;
  }, [countdown, runCapture]);

  const startCountdown = () => {
    if (photos.length >= TOTAL_PHOTOS || isCounting || isCapturing) return;
    setCaptureError(null);
    setIsCounting(true);
    setCountdown(COUNTDOWN_SECONDS);
  };

  const acceptPhoto = () => {
    if (!previewPhoto) return;
    const next = [...photos, previewPhoto];
    setPhotos(next);
    setPreviewPhoto(null);
    if (next.length === TOTAL_PHOTOS) {
      disarm().catch(() => {});
      setStep('frame');
    } else {
      // Re-arm for next physical shutter press
      setTimeout(reArmIfNeeded, 100);
    }
  };

  const retakePhoto = () => {
    setPreviewPhoto(null);
    setCaptureError(null);
    // Re-arm so next press retakes
    setTimeout(reArmIfNeeded, 100);
  };

  const resetAll = () => {
    disarm().catch(() => {});
    setPhotos([]);
    setPreviewPhoto(null);
    setCountdown(null);
    setIsCounting(false);
    setCaptureError(null);
    setIsArmed(false);
    if (frozenFrame) URL.revokeObjectURL(frozenFrame);
    setFrozenFrame(null);
    setStep('welcome');
  };

  // ------------------------------------------------------------- photostrip

  // Preview is drawn by the very same compositor used for the export, so the
  // saved file cannot disagree with what the operator approved on screen.
  useEffect(() => {
    if (step !== 'frame' || !previewCanvasRef.current) return;
    let cancelled = false;
    drawPhotostrip(previewCanvasRef.current, activeFrame, photos, {
      width: PREVIEW_WIDTH,
    }).catch((err) => {
      if (!cancelled) console.error('preview render failed', err);
    });
    return () => {
      cancelled = true;
    };
  }, [step, activeFrame, photos]);

  const downloadPhotostrip = async () => {
    setIsExporting(true);
    try {
      const { url, width, height } = await exportPhotostrip(activeFrame, photos);
      const link = document.createElement('a');
      link.href = url;
      link.download = `snapbooth-${width}x${height}-${Date.now()}.png`;
      link.click();
      // Give the browser a beat to start the download before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      setCaptureError(err.message);
    } finally {
      setIsExporting(false);
    }
  };

  // ------------------------------------------------------------------ views

  const previewHeight = Math.round(PREVIEW_WIDTH / activeFrame.aspectRatio);

  // Crop the live preview to the frame's slot shape so the operator frames the
  // shot against the same crop the strip will apply. Without this, a 16:9
  // webcam or a 3:2 sensor looks nothing like the final ~1.48 slot.
  const targetSlotAspect = useMemo(
    () => slotAspectRatio(selectedFrame.src ? selectedFrame : FRAMES[0]),
    [selectedFrame]
  );

  const statusBadge = () => {
    if (camera.status === 'probing') {
      return { text: 'Mendeteksi kamera...', color: '#6b7280' };
    }
    if (camera.isDslr) {
      const model = (camera.info && camera.info.model) || 'DSLR';
      return { text: `${model} terhubung via USB`, color: '#10b981' };
    }
    return { text: 'Memakai kamera laptop (fallback)', color: '#f59e0b' };
  };

  const badge = statusBadge();

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        fontFamily: 'sans-serif',
        backgroundColor: '#000',
      }}
    >
      {/* HALAMAN 1: WELCOME */}
      {step === 'welcome' && (
        <div style={styles.page}>
          <div style={{ fontSize: '100px', marginBottom: '20px' }}>📸</div>
          <h1 style={{ color: '#1f2937', marginBottom: '15px', fontSize: '48px', fontWeight: 'bold' }}>
            SnapBooth
          </h1>
          <p style={{ color: '#6b7280', marginBottom: '18px', fontSize: '18px' }}>
            Abadikan momen serumu dengan pilihan frame {TOTAL_PHOTOS} foto keren!
          </p>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '30px',
              padding: '10px 18px',
              borderRadius: '999px',
              backgroundColor: '#f9fafb',
              border: `1px solid ${badge.color}`,
            }}
          >
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: badge.color,
                display: 'inline-block',
              }}
            />
            <span style={{ color: badge.color, fontWeight: 'bold', fontSize: '14px' }}>
              {badge.text}
            </span>
            <button onClick={camera.retry} style={styles.linkButton}>
              cek ulang
            </button>
          </div>

          {!camera.isDslr && camera.error && (
            <div style={styles.warningBox}>
              <strong>Kamera M100 belum aktif.</strong>
              <div style={{ marginTop: '6px' }}>{camera.error}</div>
              <ol style={{ margin: '10px 0 0 18px', padding: 0, lineHeight: 1.6 }}>
                <li>Nyalakan kamera, mode foto (bukan movie), kartu SD terpasang.</li>
                <li>
                  Windows (Administrator PowerShell):
                  <code style={styles.code}>.\scripts\attach-camera.ps1</code>
                </li>
                <li>
                  WSL: <code style={styles.code}>bash scripts/verify-camera.sh</code>
                </li>
                <li>
                  Jalankan bridge: <code style={styles.code}>npm run bridge</code> (
                  {BRIDGE_URL})
                </li>
              </ol>
            </div>
          )}

          <button onClick={() => setStep('select-frame')} style={styles.primaryButton}>
            Mulai Photobooth 🚀
          </button>
        </div>
      )}

      {/* HALAMAN 2: PILIH FRAME */}
      {step === 'select-frame' && (
        <div style={{ ...styles.page, backgroundColor: '#f3f4f6', overflowY: 'auto' }}>
          <h2 style={{ color: '#1f2937', marginBottom: '8px', fontSize: '26px' }}>
            Pilih Frame Favoritmu ✨
          </h2>
          <p style={{ color: '#6b7280', marginBottom: '25px', fontSize: '15px' }}>
            Klik salah satu desain frame di bawah ini:
          </p>

          <div
            style={{
              display: 'flex',
              gap: '20px',
              marginBottom: '30px',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            {FRAME_CHOICES.map((frame) => {
              const active = selectedFrame.id === frame.id;
              return (
                <div
                  key={frame.id}
                  onClick={() => setSelectedFrame(frame)}
                  style={{
                    cursor: 'pointer',
                    border: active ? '4px solid #4f46e5' : '2px solid #e5e7eb',
                    borderRadius: '14px',
                    padding: '12px',
                    backgroundColor: '#ffffff',
                    textAlign: 'center',
                    boxShadow: active
                      ? '0 10px 25px rgba(79, 70, 229, 0.25)'
                      : '0 4px 12px rgba(0,0,0,0.06)',
                    width: '120px',
                  }}
                >
                  <div
                    style={{
                      width: '96px',
                      // Thumbnail box follows the real frame aspect, so the
                      // preview is not distorted relative to the print.
                      height: `${Math.round(96 / frame.aspectRatio)}px`,
                      backgroundColor: '#f8fafc',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      margin: '0 auto 10px auto',
                      border: frame.src ? 'none' : '1px dashed #cbd5e1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '24px',
                    }}
                  >
                    {frame.src ? (
                      <img
                        src={frame.src}
                        alt={frame.name}
                        style={{ width: '100%', height: '100%', display: 'block' }}
                      />
                    ) : (
                      '🖼️'
                    )}
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#374151' }}>
                    {frame.name}
                  </span>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => {
              setActiveFrame(selectedFrame);
              setPhotos([]);
              setStep('camera');
            }}
            style={{ ...styles.primaryButton, backgroundColor: '#10b981' }}
          >
            Mulai Ambil Foto 🚀
          </button>
        </div>
      )}

      {/* HALAMAN 3: KAMERA */}
      {step === 'camera' && (
        <div style={{ position: 'relative', width: '100vw', height: '100vh', backgroundColor: '#000' }}>
          {/* Live view. The DSLR arrives as MJPEG over HTTP because the M100 is
              a PTP device, not a UVC webcam, so getUserMedia can never see it. */}
          {camera.isDslr ? (
            <>
              {/* Frozen frame behind the live stream — shown when MJPEG is
                  temporarily unavailable (during arm/capture) so the screen
                  doesn't flash black. */}
              {frozenFrame && (
                <img
                  src={frozenFrame}
                  alt=""
                  style={{ ...styles.liveView, zIndex: 0 }}
                />
              )}
              <img
                ref={liveImgRef}
                src={camera.streamUrl}
                alt="Live view kamera"
                onError={camera.retry}
                style={{ ...styles.liveView, zIndex: 1 }}
              />
            </>
          ) : (
            <Webcam
              audio={false}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              screenshotQuality={0.95}
              videoConstraints={{ facingMode: 'user', width: 1920, height: 1080 }}
              mirrored
              style={styles.liveView}
            />
          )}

          {/* Slot-shaped guide so the operator composes against the real crop. */}
          <div style={styles.guideWrap}>
            <div
              style={{
                aspectRatio: String(targetSlotAspect),
                height: '62vh',
                border: '2px dashed rgba(255,255,255,0.55)',
                borderRadius: '6px',
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.28)',
              }}
            />
          </div>

          <div style={styles.sourceChip}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: camera.isDslr ? '#10b981' : '#f59e0b',
                display: 'inline-block',
              }}
            />
            {camera.isDslr
              ? `${(camera.info && camera.info.model) || 'DSLR'} · USB tether`
              : 'Kamera laptop'}
          </div>

          {countdown !== null && (
            <div style={styles.overlayCenter}>
              <span style={{ fontSize: '140px', fontWeight: 'bold', color: '#ffffff' }}>
                {countdown > 0 ? countdown : '📸'}
              </span>
            </div>
          )}

          {/* Overlay hanya saat benar-benar sedang download foto */}
          {isCapturing && (
            <div style={styles.overlayCenter}>
              <div style={{ textAlign: 'center', color: '#fff' }}>
                <div style={{ fontSize: '64px' }}>📷</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', marginTop: '10px' }}>
                  Mengambil gambar...
                </div>
              </div>
            </div>
          )}

          <div style={styles.bottomBar}>
            <div style={styles.counterPill}>
              Foto ke-{Math.min(photos.length + 1, TOTAL_PHOTOS)} dari {TOTAL_PHOTOS}
            </div>

            {captureError && (
              <div style={styles.errorPill}>
                {captureError}
                {camera.isDslr && (
                  <button
                    onClick={() => {
                      setCaptureError(null);
                      setIsArmed(true);
                      freezeLastFrame().then(() =>
                        arm(60).catch((e) => { setIsArmed(false); setCaptureError(e.message); })
                      );
                    }}
                    style={{ marginLeft: '10px', background: 'none', border: '1px solid #fff', color: '#fff', borderRadius: '6px', padding: '2px 8px', cursor: 'pointer', fontSize: '12px' }}
                  >
                    Coba lagi
                  </button>
                )}
              </div>
            )}

            {/* Mode DSLR: tidak ada tombol — cukup pencet tombol kamera fisik.
                Mode Webcam: tombol countdown software. */}
            {!camera.isDslr && (
              <button
                onClick={startCountdown}
                disabled={isCounting || isCapturing || previewPhoto !== null}
                style={{
                  width: '75px',
                  height: '75px',
                  borderRadius: '50%',
                  backgroundColor: isCounting || isCapturing ? '#ccc' : '#ffffff',
                  border: '4px solid #10b981',
                  fontSize: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isCounting || isCapturing ? 'not-allowed' : 'pointer',
                }}
              >
                📸
              </button>
            )}
          </div>

          {previewPhoto && (
            <div style={styles.previewModal}>
              <h3 style={{ color: '#fff', marginBottom: '15px' }}>
                Hasil Foto ke-{photos.length + 1}
              </h3>
              <img
                src={previewPhoto.dataUrl}
                alt="Preview"
                style={{
                  maxWidth: '85%',
                  maxHeight: '55vh',
                  borderRadius: '12px',
                  marginBottom: '20px',
                  transform: previewPhoto.mirrored ? 'scaleX(-1)' : 'none',
                }}
              />
              <div style={{ display: 'flex', gap: '15px' }}>
                <button onClick={retakePhoto} style={{ ...styles.pillButton, backgroundColor: '#ef4444' }}>
                  🔄 Ulangi
                </button>
                <button onClick={acceptPhoto} style={{ ...styles.pillButton, backgroundColor: '#10b981' }}>
                  ✅ Gunakan
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* HALAMAN 4: HASIL FOTOSTRIP */}
      {step === 'frame' && (
        <div style={{ ...styles.page, backgroundColor: '#f3f4f6', overflowY: 'auto' }}>
          <h2 style={{ color: '#1f2937', marginBottom: '15px' }}>Photostrip Kamu 🎉</h2>
          <p style={{ color: '#6b7280', marginBottom: '20px', fontSize: '15px' }}>
            Simpan atau bagikan hasil fotostrip {TOTAL_PHOTOS} foto kamu!
          </p>

          {/* Single canvas: photos are composited into the measured slot
              rectangles, then the frame overlay is drawn on top. */}
          <canvas
            ref={previewCanvasRef}
            width={PREVIEW_WIDTH}
            height={previewHeight}
            style={{
              width: `${PREVIEW_WIDTH}px`,
              height: `${previewHeight}px`,
              backgroundColor: '#ffffff',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            }}
          />

          <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {FRAME_CHOICES.map((frame) => (
              <button
                key={frame.id}
                onClick={() => setActiveFrame(frame)}
                style={{
                  padding: '6px 14px',
                  fontSize: '13px',
                  borderRadius: '999px',
                  cursor: 'pointer',
                  border: activeFrame.id === frame.id ? '2px solid #4f46e5' : '1px solid #d1d5db',
                  backgroundColor: activeFrame.id === frame.id ? '#eef2ff' : '#fff',
                  color: '#374151',
                  fontWeight: activeFrame.id === frame.id ? 'bold' : 'normal',
                }}
              >
                {frame.name}
              </button>
            ))}
          </div>

          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'center', gap: '10px' }}>
            <button
              onClick={downloadPhotostrip}
              disabled={isExporting}
              style={{
                ...styles.pillButton,
                backgroundColor: isExporting ? '#9ca3af' : '#4f46e5',
                cursor: isExporting ? 'wait' : 'pointer',
              }}
            >
              {isExporting ? '⏳ Menyiapkan...' : '📥 Simpan Foto 4R (300dpi)'}
            </button>
            <button onClick={resetAll} style={{ ...styles.pillButton, backgroundColor: '#6b7280' }}>
              🔄 Mulai Dari Awal
            </button>
          </div>

          {captureError && (
            <div style={{ ...styles.warningBox, marginTop: '18px' }}>{captureError}</div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  armedRing: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '220px',
    height: '220px',
    borderRadius: '50%',
    border: '4px solid #10b981',
    boxShadow: '0 0 0 0 rgba(16,185,129,0.6)',
    animation: 'ripple 2s ease-out infinite',
    pointerEvents: 'none',
    zIndex: 6,
  },
  page: {
    width: '100%',
    height: '100%',
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '20px',
    boxSizing: 'border-box',
  },
  liveView: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    objectFit: 'cover',
  },
  guideWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 5,
  },
  sourceChip: {
    position: 'absolute',
    top: '18px',
    left: '18px',
    zIndex: 15,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#fff',
    padding: '7px 14px',
    borderRadius: '999px',
    fontSize: '13px',
    fontWeight: 'bold',
  },
  overlayCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  bottomBar: {
    position: 'absolute',
    bottom: '40px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    zIndex: 10,
  },
  counterPill: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    color: '#fff',
    padding: '8px 18px',
    borderRadius: '20px',
    fontSize: '16px',
    fontWeight: 'bold',
  },
  errorPill: {
    backgroundColor: 'rgba(239, 68, 68, 0.92)',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: '10px',
    fontSize: '13px',
    maxWidth: '420px',
    textAlign: 'center',
  },
  previewModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    padding: '20px',
  },
  primaryButton: {
    padding: '18px 40px',
    backgroundColor: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '18px',
    fontWeight: 'bold',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)',
  },
  pillButton: {
    padding: '12px 24px',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: '#4f46e5',
    textDecoration: 'underline',
    cursor: 'pointer',
    fontSize: '13px',
    padding: 0,
  },
  warningBox: {
    maxWidth: '560px',
    marginBottom: '26px',
    padding: '16px 20px',
    borderRadius: '12px',
    backgroundColor: '#fffbeb',
    border: '1px solid #fcd34d',
    color: '#92400e',
    fontSize: '14px',
    textAlign: 'left',
    lineHeight: 1.5,
  },
  code: {
    backgroundColor: '#1f2937',
    color: '#f9fafb',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '12px',
    marginLeft: '4px',
  },
};

export default App;
