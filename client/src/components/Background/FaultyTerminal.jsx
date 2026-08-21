import React, { useEffect, useRef } from 'react';

export function FaultyTerminal() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    let animationFrameId;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    let lastTime = performance.now();
    let frameCount = 0;
    let fps = 60;
    let isLowPerformance = false;

    const draw = (currentTime) => {
      frameCount++;
      const delta = currentTime - lastTime;

      if (delta >= 1000) {
        fps = (frameCount * 1000) / delta;
        frameCount = 0;
        lastTime = currentTime;

        if (fps < 45) {
          isLowPerformance = true;
        }
      }

      ctx.clearRect(0, 0, width, height);

      // Ultra-subtle warm dark grid
      ctx.strokeStyle = 'rgba(242, 240, 234, 0.012)';
      ctx.lineWidth = 1;

      for (let x = 0; x <= width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      if (!isLowPerformance) {
        // Minimal glitch scanline
        if (Math.random() < 0.03) {
          const scanY = Math.random() * height;
          ctx.fillStyle = 'rgba(183, 255, 90, 0.015)'; // Very faint lime
          ctx.fillRect(0, scanY, width, 1 + Math.random() * 2);
        }

        // Faint terminal flickering text elements in corner
        if (Math.random() < 0.01) {
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.fillStyle = 'rgba(140, 138, 132, 0.1)'; // Text secondary with low opacity
          const textSnippet = `SYS_STATUS_OK // ADDR_0x${Math.floor(Math.random() * 0xffff).toString(16)}`;
          ctx.fillText(textSnippet, 24, height - 24);
        }
      }

      if (isLowPerformance) {
        setTimeout(() => {
          animationFrameId = requestAnimationFrame(draw);
        }, 150); // Heavily throttle
      } else {
        animationFrameId = requestAnimationFrame(draw);
      }
    };

    animationFrameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}
