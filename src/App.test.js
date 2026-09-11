/**
 * Smoke tests for the booth flow.
 *
 * jsdom has no canvas implementation, so getContext is stubbed. These tests
 * cover the parts that do not need pixels: the camera source probe, the
 * webcam fallback path, and screen navigation.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

// react-webcam needs getUserMedia; the compositor needs a 2D context.
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = () => ({
    fillRect: () => {},
    drawImage: () => {},
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    rect: () => {},
    clip: () => {},
    translate: () => {},
    scale: () => {},
    set imageSmoothingEnabled(_) {},
    set imageSmoothingQuality(_) {},
    set fillStyle(_) {},
  });

  Object.defineProperty(global.navigator, 'mediaDevices', {
    writable: true,
    value: { getUserMedia: jest.fn().mockRejectedValue(new Error('no camera in jsdom')) },
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

function mockBridge(payload, { ok = true } = {}) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => payload,
  });
}

test('shows the M100 as connected when the bridge reports a camera', async () => {
  mockBridge({
    cameraConnected: true,
    model: 'Canon EOS M100',
    port: 'usb:001,014',
    hints: [],
  });

  render(<App />);

  await waitFor(() =>
    expect(screen.getByText(/Canon EOS M100 terhubung via USB/i)).toBeInTheDocument()
  );
});

test('falls back to the laptop webcam and explains how to fix it', async () => {
  mockBridge({ cameraConnected: false, model: null, hints: ['No camera detected by gphoto2.'] });

  render(<App />);

  await waitFor(() =>
    expect(screen.getByText(/Memakai kamera laptop/i)).toBeInTheDocument()
  );
  // The operator must be told the concrete recovery step, not just "failed".
  expect(screen.getByText(/attach-camera\.ps1/i)).toBeInTheDocument();
});

test('falls back when the bridge is not running at all', async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

  render(<App />);

  await waitFor(() =>
    expect(screen.getByText(/Bridge kamera tidak berjalan/i)).toBeInTheDocument()
  );
});

test('navigates from welcome to frame selection and lists every frame', async () => {
  mockBridge({ cameraConnected: true, model: 'Canon EOS M100', hints: [] });
  render(<App />);
  userEvent.click(await screen.findByRole('button', { name: /Mulai Photobooth/i }));

  expect(screen.getByText(/Pilih Frame Favoritmu/i)).toBeInTheDocument();
  ['Frame 1', 'Frame 2', 'Frame 3', 'Frame 4', 'Polos Putih'].forEach((name) => {
    expect(screen.getByText(name)).toBeInTheDocument();
  });
});

test('camera screen reports which source is live', async () => {
  mockBridge({ cameraConnected: true, model: 'Canon EOS M100', hints: [] });
  render(<App />);
  userEvent.click(await screen.findByRole('button', { name: /Mulai Photobooth/i }));
  userEvent.click(screen.getByRole('button', { name: /Mulai Ambil Foto/i }));

  expect(screen.getByText(/USB tether/i)).toBeInTheDocument();
  expect(screen.getByText(/Foto ke-1 dari 6/i)).toBeInTheDocument();
});
