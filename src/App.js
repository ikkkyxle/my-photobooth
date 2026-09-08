<Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/png"
            mirrored={true}
            videoConstraints={{ facingMode: "user" }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              objectFit: 'cover',
              transform: 'scaleX(-1)' // Membalik video preview agar kembali normal (tidak mirror)
            }}
          />