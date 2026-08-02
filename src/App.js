import React, { useState, useRef } from 'react';
import Webcam from 'react-webcam';

function App() {
  // Mode Halaman: 'welcome' | 'camera' | 'frame'
  const [step, setStep] = useState('welcome');
  const [photos, setPhotos] = useState([]);
  const [frameColor, setFrameColor] = useState('#ffffff');
  const webcamRef = useRef(null);

  const TOTAL_PHOTOS = 3; // Jumlah foto yang dibutuhkan

  // Fungsi Ambil Foto
  const capture = () => {
    if (photos.length < TOTAL_PHOTOS) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        const newPhotos = [...photos, imageSrc];
        setPhotos(newPhotos);

        // Jika foto sudah mencukupi target, otomatis pindah ke pilih frame
        if (newPhotos.length === TOTAL_PHOTOS) {
          setTimeout(() => {
            setStep('frame');
          }, 500);
        }
      }
    }
  };

  // Reset Semua Data
  const resetAll = () => {
    setPhotos([]);
    setStep('welcome');
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#f3f4f6', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      fontFamily: 'sans-serif',
      padding: '20px'
    }}>

      {/* ----------------- STEP 1: HALAMAN AWAL ----------------- */}
      {step === 'welcome' && (
        <div style={{
          backgroundColor: '#ffffff',
          padding: '40px',
          borderRadius: '16px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          textAlign: 'center',
          maxWidth: '400px',
          width: '100%'
        }}>
          <div style={{ fontSize: '64px', marginBottom: '10px' }}>📸</div>
          <h1 style={{ color: '#1f2937', marginBottom: '8px', fontSize: '28px' }}>SnapBooth</h1>
          <p style={{ color: '#6b7280', marginBottom: '30px', fontSize: '14px' }}>
            Ambil {TOTAL_PHOTOS} foto terbaikmu dan pilih bingkai yang unik!
          </p>
          <button 
            onClick={() => { setPhotos([]); setStep('camera'); }}
            style={{
              width: '100%',
              padding: '14px',
              backgroundColor: '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Mulai Photobooth 🚀
          </button>
        </div>
      )}

      {/* ----------------- STEP 2: HALAMAN KAMERA ----------------- */}
      {step === 'camera' && (
        <div style={{ textAlign: 'center', maxWidth: '500px', width: '100%' }}>
          <h2 style={{ color: '#1f2937', marginBottom: '10px' }}>
            Foto ke-{photos.length + 1} dari {TOTAL_PHOTOS}
          </h2>

          <div style={{ 
            borderRadius: '12px', 
            overflow: 'hidden', 
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'inline-block',
            backgroundColor: '#000',
            marginBottom: '20px'
          }}>
            <Webcam
              audio={false}
              ref={webcamRef}
              screenshotFormat="image/png"
              width={400}
              videoConstraints={{ width: 400, height: 300, facingMode: "user" }}
            />
          </div>

          <div>
            <button 
              onClick={capture} 
              style={{
                padding: '14px 28px',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              📸 Ambil Foto ({photos.length}/{TOTAL_PHOTOS})
            </button>
          </div>
        </div>
      )}

      {/* ----------------- STEP 3: HALAMAN PILIH FRAME ----------------- */}
      {step === 'frame' && (
        <div style={{ textAlign: 'center', maxWidth: '600px', width: '100%' }}>
          <h2 style={{ color: '#1f2937', marginBottom: '10px' }}>Pilih Warna Frame</h2>
          <p style={{ color: '#6b7280', marginBottom: '20px' }}>Sesuaikan gaya photostrip milikmu!</p>

          {/* Pilihan Warna Frame */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '25px' }}>
            {['#ffffff', '#18181b', '#f43f5e', '#3b82f6', '#f59e0b', '#10b981'].map((color) => (
              <button
                key={color}
                onClick={() => setFrameColor(color)}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: color,
                  border: frameColor === color ? '3px solid #4f46e5' : '1px solid #ccc',
                  cursor: 'pointer'
                }}
              />
            ))}
          </div>

          {/* Preview Hasil Photostrip */}
          <div style={{ 
            display: 'inline-block', 
            backgroundColor: frameColor, 
            padding: '20px 20px 30px 20px', 
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            transition: '0.3s'
          }}>
            {photos.map((photo, index) => (
              <div key={index} style={{ marginBottom: '12px' }}>
                <img 
                  src={photo} 
                  alt={`Snap ${index}`} 
                  style={{ width: '200px', borderRadius: '4px', display: 'block' }} 
                />
              </div>
            ))}
            <div style={{ 
              marginTop: '15px', 
              fontSize: '12px', 
              fontWeight: 'bold', 
              color: frameColor === '#ffffff' ? '#333' : '#fff',
              letterSpacing: '2px'
            }}>
              SNAPBOOTH
            </div>
          </div>

          {/* Tombol Aksi Akhir */}
          <div style={{ marginTop: '30px' }}>
            <button 
              onClick={resetAll} 
              style={{
                padding: '12px 24px',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                cursor: 'pointer'
              }}
            >
              🔄 Foto Ulang
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;