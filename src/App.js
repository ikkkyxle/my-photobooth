import React, { useState, useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import html2canvas from 'html2canvas';

// Import file frame custom kamu dari folder src
import frame1 from './frame1.png';
import frame2 from './frame2.png';
import frame3 from './frame3.png';
import frame4 from './frame4.png';

function App() {
  const [step, setStep] = useState('welcome');
  const [photos, setPhotos] = useState([]);
  
  // State untuk menyimpan frame pilihan
  const [selectedFrame, setSelectedFrame] = useState(frame1);
  const [frameColor, setFrameColor] = useState(frame1);

  // Total foto dikunci langsung menjadi 6 foto
  const totalPhotos = 6;

  // State Hitung Mundur & Preview Foto
  const [countdown, setCountdown] = useState(null);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [isCounting, setIsCounting] = useState(false);

  const webcamRef = useRef(null);
  const stripRef = useRef(null);

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
    if (photos.length < totalPhotos && !isCounting) {
      setIsCounting(true);
      setCountdown(3); // Hitung mundur 3 detik
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

      // Pindah ke halaman frame jika sudah pas 6 foto
      if (newPhotos.length === totalPhotos) {
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
      link.download = `snapbooth-6foto-${Date.now()}.png`;
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
          <p style={{ color: '#6b7280', marginBottom: '40px', fontSize: '18px' }}>Abadikan momen serumu dengan pilihan frame 6 foto keren!</p>
          <button 
            onClick={() => setStep('select-frame')}
            style={{ padding: '18px 40px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)' }}
          >
            Mulai Photobooth 🚀
          </button>
        </div>
      )}

      {/* HALAMAN 2: PILIH FRAME */}
      {step === 'select-frame' && (
        <div style={{ width: '100vw', height: '100vh', backgroundColor: '#f3f4f6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box', overflowY: 'auto' }}>
          <h2 style={{ color: '#1f2937', marginBottom: '8px', fontSize: '26px' }}>Pilih Frame Favoritmu ✨</h2>
          <p style={{ color: '#6b7280', marginBottom: '25px', fontSize: '15px' }}>Klik salah satu desain frame di bawah ini:</p>

          <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', flexWrap: 'wrap', justifyContent: 'center' }}>
            
            {[
              { id: 'frame1', name: 'Frame 1', src: frame1 },
              { id: 'frame2', name: 'Frame 2', src: frame2 },
              { id: 'frame3', name: 'Frame 3', src: frame3 },
              { id: 'frame4', name: 'Frame 4', src: frame4 }
            ].map((item) => (
              <div 
                key={item.id}
                onClick={() => setSelectedFrame(item.src)}
                style={{
                  cursor: 'pointer',
                  border: selectedFrame === item.src ? '4px solid #4f46e5' : '2px solid #e5e7eb',
                  borderRadius: '14px',
                  padding: '12px',
                  backgroundColor: '#ffffff',
                  textAlign: 'center',
                  boxShadow: selectedFrame === item.src ? '0 10px 25px rgba(79, 70, 229, 0.25)' : '0 4px 12px rgba(0,0,0,0.06)',
                  width: '120px'
                }}
              >
                <div style={{ width: '96px', height: '210px', backgroundColor: '#f8fafc', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px auto' }}>
                  <img 
                    src={item.src} 
                    alt={item.name} 
                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} 
                  />
                </div>
                <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#374151' }}>{item.name}</span>
              </div>
            ))}

            {/* Opsi Polos Putih */}
            <div 
              onClick={() => setSelectedFrame('#ffffff')}
              style={{
                cursor: 'pointer',
                border: selectedFrame === '#ffffff' ? '4px solid #4f46e5' : '2px solid #e5e7eb',
                borderRadius: '14px',
                padding: '12px',
                backgroundColor: '#ffffff',
                textAlign: 'center',
                boxShadow: selectedFrame === '#ffffff' ? '0 10px 25px rgba(79, 70, 229, 0.25)' : '0 4px 12px rgba(0,0,0,0.06)',
                width: '120px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ width: '96px', height: '210px', backgroundColor: '#ffffff', border: '1px dashed #cbd5e1', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px auto', fontSize: '24px' }}>
                🖼️
              </div>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#374151' }}>Polos Putih</span>
            </div>

          </div>

          <button 
            onClick={() => { setFrameColor(selectedFrame); setPhotos([]); setStep('camera'); }}
            style={{ padding: '14px 36px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }}
          >
            Mulai Ambil Foto 🚀
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
              Foto ke-{photos.length + 1} dari {totalPhotos}
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

          {/* Kanvas Utama 400x600 (Format 4R) */}
          <div 
            ref={stripRef}
            style={{ 
              position: 'relative', 
              width: '400px', 
              height: '600px', 
              backgroundColor: frameColor.startsWith('#') ? frameColor : '#ffffff', 
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              overflow: 'hidden'
            }}
          >
        {/* TAMPILAN 6 FOTO */}
            {photos.length > 0 && (
              <div style={{ position: 'absolute', top: '0px', left: '0px', width: '100%', height: '100%', zIndex: 1 }}>
                
                {/* Baris 1 (Foto 1 & 4) */}
                <div style={{ position: 'absolute', top: '75px', left: '46px', width: '308px', height: '105px', display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ width: '135px', height: '105px', overflow: 'hidden' }}>
                    <img src={photos[0]} alt="L-0" style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                  </div>
                  <div style={{ width: '135px', height: '105px', overflow: 'hidden' }}>
                    <img src={photos[3]} alt="R-0" style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                  </div>
                </div>

                {/* Baris 2 (Foto 2 & 5) */}
                <div style={{ position: 'absolute', top: '235px', left: '46px', width: '308px', height: '105px', display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ width: '135px', height: '105px', overflow: 'hidden' }}>
                    <img src={photos[1]} alt="L-1" style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                  </div>
                  <div style={{ width: '135px', height: '105px', overflow: 'hidden' }}>
                    <img src={photos[4]} alt="R-1" style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                  </div>
                </div>

                {/* Baris 3 (Foto 3 & 6) */}
                <div style={{ position: 'absolute', top: '395px', left: '46px', width: '308px', height: '105px', display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ width: '135px', height: '105px', overflow: 'hidden' }}>
                    <img src={photos[2]} alt="L-2" style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                  </div>
                  <div style={{ width: '135px', height: '105px', overflow: 'hidden' }}>
                    <img src={photos[5]} alt="R-2" style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                  </div>
                </div>

              </div>
            )}

            {/* Layer Gambar Frame Utama */}
            {!frameColor.startsWith('#') && (
              <img 
                src={frameColor} 
                alt="Custom Frame 4R" 
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'fill',
                  pointerEvents: 'none',
                  zIndex: 10
                }}
              />
            )}
          </div>

          <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'center', gap: '10px' }}>
            <button onClick={downloadPhotostrip} style={{ padding: '12px 24px', backgroundColor: '#4f46e5', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>📥 Simpan Foto 4R</button>
            <button onClick={resetAll} style={{ padding: '12px 24px', backgroundColor: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>🔄 Mulai Dari Awal</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;