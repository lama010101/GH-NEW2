'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toProxiedImageUrl } from "@/lib/imageProxy";
import styles from './FullscreenImageViewer.module.css';

interface FullscreenImageViewerProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export default function FullscreenImageViewer({ src, alt, onClose }: FullscreenImageViewerProps) {
  const tNav = useTranslations('nav');
  const imgRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [pinchStart, setPinchStart] = useState<{ distance: number; scale: number } | null>(null);

  // Reset transform
  const resetTransform = () => {
    setTransform({ x: 0, y: 0, scale: 1 });
  };

  // Handle pan with pointer drag
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // Only left click
    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setTransform({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
      scale: transform.scale,
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // Handle zoom with scroll wheel (desktop)
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(Math.max(transform.scale * delta, 0.5), 8);
    setTransform({ ...transform, scale: newScale });
  };

  // Handle pinch zoom (mobile)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      setPinchStart({ distance, scale: transform.scale });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStart) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const scaleChange = distance / pinchStart.distance;
      const newScale = Math.min(Math.max(pinchStart.scale * scaleChange, 0.5), 8);
      setTransform({ ...transform, scale: newScale });
    }
  };

  const handleTouchEnd = () => {
    setPinchStart(null);
  };

  // Handle double-click/tap to reset
  const handleDoubleClick = () => {
    resetTransform();
  };

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Focus trap
  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.focus();
    }
  }, []);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
    >
      <button
        className={styles.closeBtn}
        onClick={onClose}
        aria-label={tNav('close_fullscreen_view')}
      >
        ✕
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={toProxiedImageUrl(src) ?? ''}
        alt={alt || ''}
        className={styles.img}
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={handleDoubleClick}
        draggable={false}
      />
    </div>
  );
}
