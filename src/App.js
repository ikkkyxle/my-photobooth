import React, { useState, useRef } from 'react';
import Webcam from 'react-webcam';
import html2canvas from 'html2canvas';

function App() {
  const [step, setStep] = useState('welcome');
  const [photos, setPhotos] = useState([]);
  const [frameColor, setFrameColor] = useState('#ffffff');
  
  const webcamRef = useRef(null);
  const stripRef = useRef(null); // Ref untuk menangkap area photostrip

  const TOTAL_PHOTOS = 3;

  // Fungsi Ambil Foto
  const capture = () => {
    if (photos.length < TOTAL_PHOTOS) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        const newPhotos = [...photos, imageSrc];
        setPhotos(newPhotos);

        if (newPhotos.length === TOTAL_PHOTOS) {
          setTimeout(() => {
            setStep('frame');
          }, 500);
        }
      }
    }
  };

  // Fungsi Simpan Foto ke Folder / Download
  const downloadPhotostrip = async () => {
    if (stripRef.current) {
      const canvas = await html2canvas(stripRef.current, {
        scale: 2, // Meningkatkan kualitas/resolusi gambar
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

      {/* ----------------- STEP 1: HALAMAN AWAL (UBAH KE FULL SCREEN) ----------------- */}
      {step === 'welcome' && (
        <div style={{
          // INI MEMBUAT JADI SATU LAYAR PENUH
          width: '100vw',
          height: '100vh',
          backgroundColor: '#ffffff', // Warna background layar
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '20px',
          boxSizing: 'border-box'
          // Shadow dan border radius dari kotak putih sebelumnya sudah dihapus
        }}>
          {/* Logo / Icon App (Bisa ganti foto nanti) */}
          <div style={{ fontSize: '100px', marginBottom: '20px' }}>📸</div>

          {/* Nama Aplikasi */}
          <h1 style={{ 
            color: '#1f2937', 
            marginBottom: '15px', 
            fontSize: '48px', // Ukuran font lebih besar
            fontWeight: 'bold'
          }}>
            SnapBooth
          </h1>

          {/* Deskripsi */}
          <p style={{ 
            color: '#6b7280', 
            marginBottom: '40px', 
            fontSize: '18px', // Ukuran font lebih besar
            maxWidth: '600px' // Agar teks tidak terlalu lebar ke samping
          }}>
            "Ambil {TOTAL_PHOTOS} foto terbaikmu dan pilih bingkai yang unik!, lalu simpan hasilnya sebagai photostrip kerenmu."
          </p>

          {/* Tombol Start */}
          <button 
            onClick={() => { setPhotos([]); setStep('camera'); }}
            style={{
              padding: '18px 40px', // Tombol lebih besar
              backgroundColor: '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: '12px', // Sedikit lebih kotak/modern
              fontSize: '18px', // Font tombol lebih besar
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
              boxShadow: '0 4px 6px rgba(79, 70, 229, 0.3)' // Shadow tombol
            }}
          >
            Mulai Photobooth 🚀
          </button>
        </div>
      )}

      {/* ----------------- STEP 3: HALAMAN PILIH FRAME & DOWNLOAD ----------------- */}
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

          {/* Area Photostrip (yang akan di-download) */}
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

          {/* Tombol Aksi Akhir */}
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