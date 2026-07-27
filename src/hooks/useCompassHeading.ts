import { useState, useEffect, useRef, useCallback } from 'react';

function getContinuousAngle(prevAngle: number | null, newHeading: number): number {
  if (prevAngle === null) return newHeading;
  let diff = (newHeading - (prevAngle % 360 + 360) % 360);
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return prevAngle + diff;
}

export function useCompassHeading() {
  const [heading, setHeading] = useState<number | null>(null);
  const [hasSensor, setHasSensor] = useState<boolean>(false);
  const animFrameRef = useRef<number | null>(null);
  const continuousHeadingRef = useRef<number | null>(null);

  const processHeading = useCallback((rawHeading: number) => {
    const screenAngle = Number(
      (typeof window !== 'undefined' && (window.orientation || window.screen?.orientation?.angle)) || 0
    );
    
    // Normalize raw heading with screen orientation offset
    let normalized = (rawHeading + screenAngle) % 360;
    if (normalized < 0) normalized += 360;

    const continuous = getContinuousAngle(continuousHeadingRef.current, normalized);
    
    // Ignore micro jitter (< 0.5 deg)
    if (continuousHeadingRef.current !== null && Math.abs(continuous - continuousHeadingRef.current) < 0.5) {
      return;
    }

    continuousHeadingRef.current = continuous;

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }

    animFrameRef.current = requestAnimationFrame(() => {
      setHeading(continuous);
      setHasSensor(true);
    });
  }, []);

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    let rawHeading: number | null = null;

    // iOS / Safari
    if ('webkitCompassHeading' in event && typeof (event as any).webkitCompassHeading === 'number') {
      const webkitHeading = (event as any).webkitCompassHeading;
      if (!isNaN(webkitHeading) && webkitHeading !== null) {
        rawHeading = webkitHeading;
      }
    } 
    // Android / standard deviceorientation or deviceorientationabsolute
    else if (event.alpha !== null && event.alpha !== undefined && !isNaN(event.alpha)) {
      // Standard compass heading relative to North
      rawHeading = (360 - event.alpha) % 360;
    }

    if (rawHeading !== null && !isNaN(rawHeading)) {
      processHeading(rawHeading);
    }
  }, [processHeading]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const win = window as any;
    if ('ondeviceorientationabsolute' in win) {
      win.addEventListener('deviceorientationabsolute', handleOrientation, true);
    } else if ('ondeviceorientation' in win) {
      win.addEventListener('deviceorientation', handleOrientation, true);
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (typeof window !== 'undefined') {
        win.removeEventListener('deviceorientationabsolute', handleOrientation, true);
        win.removeEventListener('deviceorientation', handleOrientation, true);
      }
    };
  }, [handleOrientation]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof (DeviceOrientationEvent as any).requestPermission === 'function'
    ) {
      try {
        const permission = await (DeviceOrientationEvent as any).requestPermission();
        if (permission === 'granted') {
          const win = window as any;
          if ('ondeviceorientationabsolute' in win) {
            win.addEventListener('deviceorientationabsolute', handleOrientation, true);
          } else if ('ondeviceorientation' in win) {
            win.addEventListener('deviceorientation', handleOrientation, true);
          }
          return true;
        }
      } catch (err) {
        console.warn('DeviceOrientation permission request error:', err);
      }
    }
    return false;
  }, [handleOrientation]);

  return { heading, hasSensor, requestPermission };
}
