import React, { useState, useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import html2canvas from 'html2canvas';

// Import beberapa frame custommu dari folder src
import frame1 from './frame1.png';
import frame2 from './frame2.png';

function App() {
  const [step, setStep] = useState('welcome');
  const [photos, setPhotos] = useState([]);
  
  // State untuk menyimpan frame pilihan (bisa warna heksadesimal atau variabel gambar import)
  const [selectedFrame, setSelectedFrame] = useState(frame1);
  const [frameColor, setFrameColor] = useState(frame1);

  // State Hitung Mundur & Preview Foto
  const [countdown, setCountdown] = useState(null);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [isCounting, setIsCounting] = useState(false);

  const webcamRef = useRef(null);
  const stripRef = useRef(null);

  const TOTAL_PHOTOS = 3;

  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      capturePhoto();
      setCountdown(null);
      setIsCounting(false);
    }
  }, [countdown]);

  const startCountdown = () => {
    if (photos.length < TOTAL_PHOTOS && !isCounting) {
      setIsCounting(true);
      setCountdown(5);
    }
  };

  const capturePhoto = () => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) setPreviewPhoto(imageSrc);
    }
  };

  const acceptPhoto = () => {
    if (previewPhoto) {
      const newPhotos = [...photos, previewPhoto];
      setPhotos(newPhotos);
      setPreviewPhoto(null);

      if (newPhotos.length === TOTAL_PHOTOS) {
        setStep('frame');
      }
    }
  };

  const retakePhoto = () => setPreviewPhoto(null);

  const downloadPhotostrip = async () => {
    if (stripRef.current) {
      const canvas = await html2canvas(stripRef.current, { scale: 2, useCORS: true });
      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = image;
      link.download = `snapbooth-${Date.now()}.png`;
      link.click();
    }
  };

  const resetAll = () => {
    setPhotos([]);
    setStep('welcome');
    setPreviewPhoto(null);
    setCountdown(null);
    setIsCounting(false);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', fontFamily: 'sans-serif', backgroundColor: '#000' }}>

      {/* HALAMAN 1: WELCOME */}
      {step === 'welcome' && (
        <div style={{ width: '100%', height: '100%', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ fontSize: '100px', marginBottom: '20px' }}>📸</div>
          <h1 style={{ color: '#1f2937', marginBottom: '15px', fontSize: '48px', fontWeight: 'bold' }}>SnapBooth</h1>
          <p style={{ color: '#6b7280', marginBottom: '40px', fontSize: '18px' }}>Ambil {TOTAL_PHOTOS} foto terbaikmu dengan pilihan frame keren!</p>
          <button 
            onClick={() => setStep('select-frame')}
            style={{ padding: '18px 40px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Mulai Photobooth 🚀
          </button>
        </div>
      )}

      {/* HALAMAN 2: PILIH FRAME DENGAN PREVIEW */}
      {step === 'select-frame' && (
        <div style={{ width: '100vw', height: '100vh', backgroundColor: '#f3f4f6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box', overflowY: 'auto' }}>
          <h2 style={{ color: '#1f2937', marginBottom: '10px' }}>Pilih Frame Favoritmu</h2>
          <p style={{ color: '#6b7280', marginBottom: '25px' }}>Klik salah satu pilihan frame di bawah ini untuk melihat preview-nya:</p>

          {/* Kotak Pilihan dengan Preview Gambar */}
          <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', flexWrap: 'wrap', justifyContent: 'center' }}>
            
            {/* Pilihan Frame 1 */}
            <div 
              onClick={() => setSelectedFrame(frame1)}
              style={{
                cursor: 'pointer',
                border: selectedFrame === frame1 ? '4px solid #4f46e5' : '2px solid #ccc',
                borderRadius: '10px',
                padding: '10px',
                backgroundColor: '#fff',
                textAlign: 'center',
                boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
              }}
            >
              <img src={frame1} alt="Frame 1" style={{ width: '397px', height: '1123px', objectFit: 'cover', borderRadius: '4px', display: 'block', marginBottom: '8px' }} />
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>Frame 1</span>
            </div>

            {/* Pilihan Frame 2 */}
            <div 
              onClick={() => setSelectedFrame(frame2)}
              style={{
                cursor: 'pointer',
                border: selectedFrame === frame2 ? '4px solid #4f46e5' : '2px solid #ccc',
                borderRadius: '10px',
                padding: '10px',
                backgroundColor: '#fff',
                textAlign: 'center',
                boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
              }}
            >
              <img src={frame2} alt="Frame 2" style={{ width: '397px', height: '1123px', objectFit: 'cover', borderRadius: '4px', display: 'block', marginBottom: '8px' }} />
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>Frame 2</span>
            </div>

            {/* Pilihan Warna Polos (Opsional) */}
            <div 
              onClick={() => setSelectedFrame('#ffffff')}
              style={{
                cursor: 'pointer',
                border: selectedFrame === '#ffffff' ? '4px solid #4f46e5' : '2px solid #ccc',
                borderRadius: '10px',
                padding: '10px',
                backgroundColor: '#fff',
                textAlign: 'center',
                boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
              }}
            >
              <div style={{ width: '80px', height: '120px', backgroundColor: '#ffffff', border: '1px solid #ddd', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>⚪</div>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>Polos Putih</span>
            </div>

          </div>

          <button 
            onClick={() => { setFrameColor(selectedFrame); setPhotos([]); setStep('camera'); }}
            style={{ padding: '14px 32px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Lanjut ke Kamera ➡️
          </button>
        </div>
      )}

      {/* HALAMAN 3: KAMERA */}
      {step === 'camera' && (
        <div style={{ position: 'relative', width: '100vw', height: '100vh', backgroundColor: '#000' }}>
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/png"
            videoConstraints={{ facingMode: "user" }}
            style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', objectFit: 'cover' }}
          />

          {countdown !== null && (
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0, 0, 0, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
              <span style={{ fontSize: '140px', fontWeight: 'bold', color: '#ffffff' }}>
                {countdown > 0 ? countdown : '📸'}
              </span>
            </div>
          )}

          <div style={{ position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', zIndex: 10 }}>
            <div style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', color: '#fff', padding: '8px 18px', borderRadius: '20px', fontSize: '16px', fontWeight: 'bold' }}>
              Foto ke-{photos.length + 1} dari {TOTAL_PHOTOS}
            </div>

            <button 
              onClick={startCountdown}
              disabled={isCounting || previewPhoto !== null}
              style={{ width: '75px', height: '75px', borderRadius: '50%', backgroundColor: isCounting ? '#ccc' : '#ffffff', border: '4px solid #10b981', fontSize: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              📸
            </button>
          </div>

          {previewPhoto && (
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0, 0, 0, 0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 30, padding: '20px' }}>
              <h3 style={{ color: '#fff', marginBottom: '15px' }}>Hasil Foto ke-{photos.length + 1}</h3>
              <img src={previewPhoto} alt="Preview" style={{ maxWidth: '85%', maxHeight: '55vh', borderRadius: '12px', marginBottom: '20px' }} />
              <div style={{ display: 'flex', gap: '15px' }}>
                <button onClick={retakePhoto} style={{ padding: '12px 24px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>🔄 Ulangi</button>
                <button onClick={acceptPhoto} style={{ padding: '12px 24px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>✅ Gunakan</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* HALAMAN 4: HASIL FOTOSTRIP */}
      {step === 'frame' && (
        <div style={{ width: '100vw', height: '100vh', backgroundColor: '#f3f4f6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', padding: '20px', boxSizing: 'border-box' }}>
          <h2 style={{ color: '#1f2937', marginBottom: '15px' }}>Photostrip Kamu 🎉</h2>

          <div 
            ref={stripRef}
            style={{ 
              position: 'relative', 
              display: 'inline-block', 
              backgroundColor: frameColor.startsWith('#') ? frameColor : '#ffffff', 
              padding: '20px 20px 30px 20px', 
              borderRadius: '8px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              overflow: 'hidden'
            }}
          >
            {/* Menampilkan Gambar Frame Custom Jika Dipilih */}
            {!frameColor.startsWith('#') && (
              <img 
                src={frameColor} 
                alt="Custom Frame" 
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  pointerEvents: 'none',
                  zIndex: 10
                }}
              />
            )}

            {photos.map((photo, index) => (
              <div key={index} style={{ marginBottom: '12px', position: 'relative', zIndex: 1 }}>
                <img src={photo} alt={`Snap ${index}`} style={{ width: '200px', borderRadius: '4px', display: 'block' }} />
              </div>
            ))}
            
            <div style={{ marginTop: '15px', fontSize: '12px', fontWeight: 'bold', color: '#333', letterSpacing: '2px', position: 'relative', zIndex: 1, textAlign: 'center' }}>
              SNAPBOOTH
            </div>
          </div>

          <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'center', gap: '10px' }}>
            <button onClick={downloadPhotostrip} style={{ padding: '12px 24px', backgroundColor: '#4f46e5', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>📥 Simpan Foto</button>
            <button onClick={resetAll} style={{ padding: '12px 24px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>🔄 Mulai Dari Awal</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;