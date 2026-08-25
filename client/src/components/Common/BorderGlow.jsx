import React, { useRef, useState } from 'react';

/**
 * BorderGlow component inspired by ReactBits.
 * Wraps any rectangular button or card with an animated, pointer-reactive or continuous glowing border beam.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child content
 * @param {string} [props.className] - Extra class names
 * @param {Object} [props.style] - Container style
 * @param {string} [props.glowColor] - Main glow color (default: var(--accent-lime))
 * @param {string} [props.secondaryColor] - Accent beam color (default: #ffffff)
 * @param {string} [props.backgroundColor] - Inner fill color
 * @param {string} [props.borderRadius] - Border radius (default: '2px')
 * @param {number} [props.borderWidth] - Border thickness in px (default: 1.5)
 * @param {number} [props.glowIntensity] - Outer box shadow intensity in px (default: 20)
 * @param {boolean} [props.pointerTracked] - Whether to track cursor position
 * @param {boolean} [props.alwaysActive] - Whether border glow is active all the time or only on hover
 * @param {number} [props.speed] - Rotation speed in seconds (default: 3)
 * @param {string|React.ElementType} [props.as] - HTML element or component (default: 'div')
 * @param {Function} [props.onClick] - Click handler
 */
export function BorderGlow({
  children,
  className = '',
  style = {},
  glowColor = 'var(--accent-lime)',
  secondaryColor = '#ffffff',
  backgroundColor = 'var(--bg-surface)',
  borderRadius = '2px',
  borderWidth = 1.5,
  glowIntensity = 20,
  pointerTracked = true,
  alwaysActive = false,
  speed = 3,
  as: Component = 'div',
  onClick,
  disabled = false,
  ...props
}) {
  const containerRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [pointerAngle, setPointerAngle] = useState(0);

  const handleMouseMove = (e) => {
    if (!pointerTracked || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    setPointerAngle(deg < 0 ? deg + 360 : deg);
  };

  const isLit = (isHovered || alwaysActive) && !disabled;

  return (
    <Component
      ref={containerRef}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseMove={handleMouseMove}
      disabled={disabled}
      className={`border-glow-container ${isLit ? 'is-active' : ''} ${className}`}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'stretch',
        justifyContent: 'stretch',
        padding: `${borderWidth}px`,
        borderRadius,
        background: isLit
          ? pointerTracked && isHovered
            ? `conic-gradient(from ${pointerAngle}deg, transparent 0deg, transparent 40deg, ${glowColor} 80deg, ${secondaryColor} 90deg, ${glowColor} 100deg, transparent 140deg, transparent 360deg)`
            : undefined
          : 'var(--bg-surface-border)',
        boxShadow: isLit
          ? `0 0 ${glowIntensity}px rgba(183, 255, 90, 0.28), 0 0 ${glowIntensity * 2}px rgba(183, 255, 90, 0.1)`
          : 'none',
        transition: 'box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s ease',
        cursor: disabled ? 'default' : props.cursor || (Component === 'button' || onClick ? 'pointer' : 'default'),
        overflow: 'hidden',
        ...style,
      }}
      {...props}
    >
      {/* Continuous rotating beam when not mouse-hover tracked or when alwaysActive */}
      {isLit && (!pointerTracked || !isHovered) && (
        <div
          style={{
            position: 'absolute',
            inset: '-150%',
            background: `conic-gradient(from 0deg, transparent 0deg, transparent 60deg, ${glowColor} 110deg, ${secondaryColor} 130deg, ${glowColor} 150deg, transparent 200deg, transparent 360deg)`,
            animation: `borderRotate ${speed}s linear infinite`,
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Inner surface fill */}
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: `calc(${borderRadius} - ${borderWidth}px)`,
          background: backgroundColor,
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.2s ease',
        }}
      >
        {children}
      </div>
    </Component>
  );
}
