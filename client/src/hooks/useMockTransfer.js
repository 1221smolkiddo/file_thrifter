import { useState, useRef, useCallback } from 'react';

export function useMockTransfer({ onStart, onProgress, onComplete }) {
  const [isTransferring, setIsTransferring] = useState(false);
  const timerRef = useRef(null);

  const startMockTransfer = useCallback((fileInfo) => {
    setIsTransferring(true);

    // This visual-only mock is intentionally local. Real files will use the
    // DataChannel protocol once FILE_CHUNK support is implemented.
    onStart(fileInfo);

    const totalBytes = fileInfo.size;
    let transferred = 0;
    const startTime = performance.now();
    let lastProgressTime = startTime;
    let lastTransferred = 0;

    // Simulation loop interval (approx 50ms per tick)
    const tick = () => {
      const now = performance.now();
      const timeDeltaSec = (now - lastProgressTime) / 1000;

      if (timeDeltaSec <= 0) return;

      // Dynamic speed simulation between 30 MB/s and 70 MB/s with random packet variance
      const targetSpeedMbps = 30 + Math.random() * 40; // MB/s
      const bytesPerSec = targetSpeedMbps * 1024 * 1024;
      const chunkTransferred = Math.round(bytesPerSec * timeDeltaSec);

      transferred = Math.min(totalBytes, transferred + chunkTransferred);

      // Instantaneous speed calculation
      const instantSpeedBps = (transferred - lastTransferred) / timeDeltaSec;

      lastProgressTime = now;
      lastTransferred = transferred;

      onProgress(transferred, totalBytes, instantSpeedBps);

      if (transferred >= totalBytes) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        setIsTransferring(false);
        onComplete();
      }
    };

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(tick, 50);
  }, [onStart, onProgress, onComplete]);

  const cancelTransfer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsTransferring(false);
  }, []);

  return {
    isTransferring,
    startMockTransfer,
    cancelTransfer,
  };
}
