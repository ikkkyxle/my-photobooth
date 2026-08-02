import React, { useState, useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import html2canvas from 'html2canvas';

function App() {
  const [step, setStep] = useState('welcome');
  const [photos, setPhotos] = useState([]);
  const [frameColor, setFrameColor] = useState('#ffffff');

  // State untuk Hitung Mundur & Pop-up Preview
  const [countdown, setCountdown] = useState(null);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [isCounting, setIsCounting] = useState(false);

  const webcamRef = useRef(null);
  const stripRef = useRef(null);

  const TOTAL_PHOTOS = 3;

  // Effect untuk menjalankan timer hitung mundur (5, 4, 3, 2, 1)
  useEffect(() => {
    if (countdown === null) return;

    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      // Ketika timer menyentuh 0, langsung jepret foto
      capturePhoto();
      setCountdown(null);
      setIsCounting(false);
    }
  }, [countdown]);

  // Memulai proses hitung mundur dari angka 5
  const startCountdown = () => {
    if (photos.length < TOTAL_PHOTOS && !isCounting) {
      setIsCounting(true);
      setCountdown(5);
    }
  };

  // Ambil gambar dari kamera & munculkan Pop-up Preview
  const capturePhoto = () => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        setPreviewPhoto(imageSrc);
      }
    }
  };

  // Simpan foto dari Pop-up Preview ke daftar koleksi
  const acceptPhoto = () => {
    if (previewPhoto) {
      const newPhotos = [...photos, previewPhoto];
      setPhotos(newPhotos);
      setPreviewPhoto(null);

      // Jika jumlah foto sudah genap 3, pindah ke halaman frame
      if (newPhotos.length === TOTAL_PHOTOS) {
        setStep('frame');
      }
    }
  };

  // Ulangi foto saat ini (dari Pop-up Preview)
  const retakePhoto = () => {
    setPreviewPhoto(null);
  };

  // Fungsi Simpan Foto ke Folder / Download
  const downloadPhotostrip = async () => {
    if (stripRef.current) {
      const canvas = await html2canvas(stripRef.current, {
        scale: 2,
        useCORS: true
      });
      
      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = image;
      link.download = `snapbooth-${Date.now()}.png`;
      link.click();
    }
  };

  // Reset Semua Data
  const resetAll = () => {
    setPhotos([]);
    setStep('welcome');
    setPreviewPhoto(null);
    setCountdown(null);
    setIsCounting(false);
  };

  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      margin: 0, 
      padding: 0, 
      overflow: 'hidden', 
      fontFamily: 'sans-serif',
      backgroundColor: '#000'
    }}>

      {/* ----------------- STEP 1: HALAMAN AWAL ----------------- */}
      {step === 'welcome' && (
        <div style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '20px',
          boxSizing: 'border-box'
        }}>
          <div style={{ fontSize: '100px', marginBottom: '20px' }}>📸</div>
          <h1 style={{ color: '#1f2937', marginBottom: '15px', fontSize: '48px', fontWeight: 'bold' }}>
            SnapBooth
          </h1>
          <p style={{ color: '#6b7280', marginBottom: '40px', fontSize: '18px', maxWidth: '600px' }}>
            Ambil {TOTAL_PHOTOS} foto terbaikmu dan pilih bingkai yang unik!
          </p>
          <button 
            onClick={() => { setPhotos([]); setStep('camera'); }}
            style={{
              padding: '18px 40px',
              backgroundColor: '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: '12px',
              fontSize: '18px',
              fontWeight: 'bold',
              cursor: 'pointer',
              boxShadow: '0 4px 6px rgba(79, 70, 229, 0.3)'
            }}
          >
            Mulai Photobooth 🚀
          </button>
        </div>
      )}

      {/* ----------------- STEP 2: HALAMAN KAMERA ----------------- */}
      {step === 'camera' && (
        <div style={{ 
          position: 'relative', 
          width: '100vw', 
          height: '100vh', 
          backgroundColor: '#000'
        }}>
          {/* Webcam dengan mirrored={false} agar tidak terbalik */}
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/png"
            mirrored={false}
            videoConstraints={{ facingMode: "user" }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              objectFit: 'cover',
              transform: 'scaleX(1)' // Memastikan kamera tidak terbalik (1 = normal, -1 = mirror)
            }}
          />

          {/* OVERLAY TIMER HITUNG MUNDUR (5, 4, 3, 2, 1) */}
          {countdown !== null && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 20
            }}>
              <span style={{
                fontSize: '140px',
                fontWeight: 'bold',
                color: '#ffffff',
                textShadow: '0 4px 20px rgba(0,0,0,0.8)',
                animation: 'pulse 0.5s infinite alternate'
              }}>
                {countdown > 0 ? countdown : '📸'}
              </span>
            </div>
          )}

          {/* OVERLAY TOMBOL KONTROL */}
          <div style={{
            position: 'absolute',
            bottom: '40px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '15px',
            zIndex: 10
          }}>
            <div style={{
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              color: '#fff',
              padding: '8px 18px',
              borderRadius: '20px',
              fontSize: '16px',
              fontWeight: 'bold',
              backdropFilter: 'blur(4px)'
            }}>
              Foto ke-{photos.length + 1} dari {TOTAL_PHOTOS}
            </div>

            <button 
              onClick={startCountdown}
              disabled={isCounting || previewPhoto !== null}
              style={{
                width: '75px',
                height: '75px',
                borderRadius: '50%',
                backgroundColor: isCounting ? '#ccc' : '#ffffff',
                border: '4px solid #10b981',
                fontSize: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: isCounting ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 15px rgba(0,0,0,0.5)'
              }}
            >
              📸
            </button>
          </div>

          {/* ----------------- POP-UP / MODAL PREVIEW HASIL FOTO ----------------- */}
          {previewPhoto && (
            <div style={{
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
              boxSizing: 'border-box'
            }}>
              <h3 style={{ color: '#fff', marginBottom: '15px', fontSize: '22px' }}>
                Hasil Foto ke-{photos.length + 1}
              </h3>

              <img 
                src={previewPhoto} 
                alt="Preview" 
                style={{
                  maxWidth: '85%',
                  maxHeight: '55vh',
                  borderRadius: '12px',
                  boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                  marginBottom: '20px'
                }}
              />

              <div style={{ display: 'flex', gap: '15px' }}>
                <button
                  onClick={retakePhoto}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  🔄 Ulangi Foto
                </button>

                <button
                  onClick={acceptPhoto}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#10b981',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  ✅ Gunakan Foto
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ----------------- STEP 3: HALAMAN PILIH FRAME ----------------- */}
      {step === 'frame' && (
        <div style={{ 
          width: '100vw', 
          height: '100vh', 
          backgroundColor: '#f3f4f6', 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          overflowY: 'auto',
          padding: '20px',
          boxSizing: 'border-box'
        }}>
          <h2 style={{ color: '#1f2937', marginBottom: '10px' }}>Pilih Warna Frame</h2>
          <p style={{ color: '#6b7280', marginBottom: '20px' }}>Sesuaikan gaya photostrip milikmu!</p>

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

          <div 
            ref={stripRef}
            style={{ 
              display: 'inline-block', 
              backgroundColor: frameColor, 
              padding: '20px 20px 30px 20px', 
              borderRadius: '8px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              transition: '0.3s'
            }}
          >
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

          <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'center', gap: '10px' }}>
            <button 
              onClick={downloadPhotostrip} 
              style={{
                padding: '12px 24px',
                backgroundColor: '#4f46e5',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              📥 Simpan Foto
            </button>

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