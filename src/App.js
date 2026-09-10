import React, { useState, useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import html2canvas from 'html2canvas';

// Import beberapa frame custommu dari folder src
import frame1 from './frame1.png';
import frame2 from './frame2.png';

function App() {
  const [step, setStep] = useState('welcome');
  const [photos, setPhotos] = useState([]);
  
  // State untuk menyimpan frame pilihan
  const [selectedFrame, setSelectedFrame] = useState(frame1);
  const [frameColor, setFrameColor] = useState(frame1);

  // State untuk jumlah foto pilihan user (default 3 atau 6)
  const [totalPhotos, setTotalPhotos] = useState(3);

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
      link.download = `snapbooth-${totalPhotos}foto-${Date.now()}.png`;
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
          <p style={{ color: '#6b7280', marginBottom: '40px', fontSize: '18px' }}>Abadikan momen serumu dengan pilihan frame & mode foto keren!</p>
          <button 
            onClick={() => setStep('select-frame')}
            style={{ padding: '18px 40px', backgroundColor: '#4f46e5', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Mulai Photobooth 🚀
          </button>
        </div>
      )}

      {/* HALAMAN 2: PILIH FRAME */}
      {step === 'select-frame' && (
        <div style={{ width: '100vw', height: '100vh', backgroundColor: '#f3f4f6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box', overflowY: 'auto' }}>
          <h2 style={{ color: '#1f2937', marginBottom: '10px' }}>Pilih Frame Favoritmu</h2>
          <p style={{ color: '#6b7280', marginBottom: '25px' }}>Klik salah satu pilihan frame di bawah ini:</p>

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
              <img src={frame1} alt="Frame 1" style={{ width: '100px', height: '200px', objectFit: 'cover', borderRadius: '4px', display: 'block', marginBottom: '8px' }} />
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
              <img src={frame2} alt="Frame 2" style={{ width: '100px', height: '200px', objectFit: 'cover', borderRadius: '4px', display: 'block', marginBottom: '8px' }} />
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#333' }}>Frame 2</span>
            </div>

            {/* Pilihan Warna Polos */}
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
            onClick={() => { setFrameColor(selectedFrame); setStep('select-mode'); }}
            style={{ padding: '14px 32px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Lanjut Pilih Mode ➡️
          </button>
        </div>
      )}

      {/* HALAMAN 3: PILIH OPSI 3 FOTO ATAU 6 FOTO */}
      {step === 'select-mode' && (
        <div style={{ width: '100vw', height: '100vh', backgroundColor: '#f3f4f6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <h2 style={{ color: '#1f2937', marginBottom: '10px' }}>Pilih Mode Photostrip</h2>
          <p style={{ color: '#6b7280', marginBottom: '30px' }}>Berapa banyak foto yang ingin kamu ambil?</p>

          <div style={{ display: 'flex', gap: '20px', marginBottom: '35px', flexWrap: 'wrap', justifyContent: 'center' }}>
            
            {/* Opsi 3 Foto */}
            <div 
              onClick={() => setTotalPhotos(3)}
              style={{
                cursor: 'pointer',
                border: totalPhotos === 3 ? '4px solid #4f46e5' : '2px solid #ccc',
                borderRadius: '12px',
                padding: '25px 35px',
                backgroundColor: '#fff',
                textAlign: 'center',
                boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
                width: '140px'
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>📸 3x</div>
              <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#333' }}>3 Foto</span>
              <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>1 Strip (3 Foto)</p>
            </div>

            {/* Opsi 6 Foto */}
            <div 
              onClick={() => setTotalPhotos(6)}
              style={{
                cursor: 'pointer',
                border: totalPhotos === 6 ? '4px solid #4f46e5' : '2px solid #ccc',
                borderRadius: '12px',
                padding: '25px 35px',
                backgroundColor: '#fff',
                textAlign: 'center',
                boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
                width: '140px'
              }}
            >
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>📸📸 6x</div>
              <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#333' }}>6 Foto</span>
              <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>2 Strip Terpisah</p>
            </div>

          </div>

          <button 
            onClick={() => { setPhotos([]); setStep('camera'); }}
            style={{ padding: '14px 32px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Mulai Ambil Foto 🚀
          </button>
        </div>
      )}

      {/* HALAMAN 4: KAMERA */}
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

      {/* HALAMAN 5: HASIL FOTOSTRIP */}
      {step === 'frame' && (
        <div style={{ width: '100vw', height: '100vh', backgroundColor: '#f3f4f6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', padding: '20px', boxSizing: 'border-box' }}>
          <h2 style={{ color: '#1f2937', marginBottom: '15px' }}>Photostrip Kamu 🎉</h2>

          {/* Kanvas 4R */}
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
          {/* TAMPILAN 3 FOTO (1 Strip Tunggal dengan Rasio Pas) */}
            {totalPhotos === 3 && photos.length > 0 && (
              <div style={{ position: 'absolute', top: '50px', left: '85px', display: 'flex', flexDirection: 'column', gap: '15px', zIndex: 1 }}>
                {photos.map((photo, index) => (
                  <div key={index} style={{ width: '230px', height: '150px', overflow: 'hidden', borderRadius: '4px' }}>
                    <img 
                      src={photo} 
                      alt={`Snap ${index}`} 
                      style={{ 
                        width: '100%', 
                        height: '100%', 
                        objectFit: 'cover',   /* Ini kunci agar foto tidak gepeng */
                        display: 'block',
                        transform: 'scaleX(-1)' /* Efek cermin supaya natural */
                      }} 
                    />
                  </div>
                ))}
              </div>
            )}

{/* TAMPILAN 6 FOTO (2 Strip Terpisah) */}
            {totalPhotos === 6 && photos.length > 0 && (
              <div style={{ position: 'absolute', top: '50px', left: '25px', display: 'flex', gap: '20px', zIndex: 1 }}>
                
                {/* Strip Terpisah 1 (Foto 1, 2, 3) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '8px', backgroundColor: '#fff', border: '1px dashed #cbd5e1', borderRadius: '6px' }}>
                  {photos.slice(0, 3).map((photo, index) => (
                    <div key={index} style={{ width: '165px', height: '120px', overflow: 'hidden', borderRadius: '4px' }}>
                      <img 
                        src={photo} 
                        alt={`Strip1 Photo ${index}`} 
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: 'scaleX(-1)' }} 
                      />
                    </div>
                  ))}
                </div>

                {/* Strip Terpisah 2 (Foto 4, 5, 6) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '8px', backgroundColor: '#fff', border: '1px dashed #cbd5e1', borderRadius: '6px' }}>
                  {photos.slice(3, 6).map((photo, index) => (
                    <div key={index} style={{ width: '165px', height: '120px', overflow: 'hidden', borderRadius: '4px' }}>
                      <img 
                        src={photo} 
                        alt={`Strip2 Photo ${index}`} 
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transform: 'scaleX(-1)' }} 
                      />
                    </div>
                  ))}
                </div>

              </div>
            )}

            {/* Layer Gambar Frame di Depan (Jika pakai frame gambar custom) */}
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