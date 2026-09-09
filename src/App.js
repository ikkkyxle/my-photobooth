import React, { useState, useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import html2canvas from 'html2canvas';
import customFrameImg from './frame.png';

function App() {
  const [step, setStep] = useState('welcome');
  const [photos, setPhotos] = useState([]);
  
  // State untuk menyimpan frame yang dipilih (bisa warna atau gambar custom)
  const [selectedFrame, setSelectedFrame] = useState(customFrameImg);
  const [frameColor, setFrameColor] = useState('#ffffff');

  // State untuk Hitung Mundur & Pop-up Preview
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
        setStep('frame'); // Pindah ke hasil akhir photostrip
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

      {/* ----------------- STEP 1: HALAMAN AWAL ----------------- */}
      {step === 'welcome' && (
        <div style={{ width: '100%', height: '100%', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ fontSize: '100px', marginBottom: '20px' }}>📸</div>
          <h1 style={{ color: '#1f2937', marginBottom: '15px', fontSize: '48px', fontWeight: 'bold' }}>SnapBooth</h1>
          <p style={{ color: '#6b7280', marginBottom: '40px', fontSize: '18px', maxWidth: '600px' }}>Ambil {TOTAL_PHOTOS} foto terbaikmu dan pilih bingkai yang unik!</p>
          <button 
            onClick={() => setStep('select-frame')} // Masuk ke sesi pilih frame dulu
            style={{ padding: '18px 40px', backgroundColor: '#4f46e5', color: '#f8fc37', border: 'none', borderRadius: '12px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 6px rgba(79, 70, 229, 0.3)' }}
          >
            Mulai Photobooth 🚀
          </button>
        </div>
      )}

      {/* ----------------- SESI KHUSUS PILIH FRAME DI AWAL ----------------- */}
      {step === 'select-frame' && (
        <div style={{ width: '100vw', height: '100vh', backgroundColor: '#f3f4f6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <h2 style={{ color: '#1f2937', marginBottom: '10px' }}>Pilih Frame Favoritmu</h2>
          <p style={{ color: '#6b7280', marginBottom: '25px' }}>Tentukan gaya frame sebelum mulai berfoto!</p>

          <div style={{ display: 'flex', gap: '15px', marginBottom: '35px' }}>
            {['#ffffff', '#18181b', '#f43f5e'].map((color) => (
              <button
                key={color}
                onClick={() => setSelectedFrame(color)}
                style={{ width: '50px', height: '50px', borderRadius: '50%', backgroundColor: color, border: selectedFrame === color ? '4px solid #4f46e5' : '1px solid #ccc', cursor: 'pointer' }}
              />
            ))}
            <button
              onClick={() => setSelectedFrame(customFrameImg)}
              style={{ padding: '10px 16px', borderRadius: '8px', backgroundColor: '#fff', border: selectedFrame === customFrameImg ? '4px solid #4f46e5' : '1px solid #ccc', cursor: 'pointer', fontWeight: 'bold' }}
            >
              🎨 Frame Customku
            </button>
          </div>

          <button 
            onClick={() => { setFrameColor(selectedFrame); setPhotos([]); setStep('camera'); }}
            style={{ padding: '14px 32px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Lanjut ke Kamera ➡️
          </button>
        </div>
      )}

      {/* ----------------- STEP 2: HALAMAN KAMERA ----------------- */}
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

      {/* ----------------- STEP 3: HALAMAN HASIL & FOTOSTRIP ----------------- */}
      {step === 'frame' && (
        <div style={{ width: '100vw', height: '100vh', backgroundColor: '#f3f4f6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', padding: '20px', boxSizing: 'border-box' }}>
          <h2 style={{ color: '#1f2937', marginBottom: '15px' }}>Photostrip Kamu Berhasil Dibuat! 🎉</h2>

          {/* Area Photostrip yang Menggunakan Frame Pilihan */}
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
            {/* Overlay Gambar Frame Custom Jika Dipilih */}
            {!frameColor.startsWith('#') && (
              <img 
                src={frameColor} 
                alt="" 
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
            
            <div style={{ marginTop: '15px', fontSize: '12px', fontWeight: 'bold', color: '#333', letterSpacing: '2px', position: 'relative', zIndex: 1 }}>
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
