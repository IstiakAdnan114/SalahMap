import { useState, useEffect, useCallback, useRef } from 'react';

export type PermissionState = 'prompt' | 'granted' | 'denied' | 'not-required' | 'unsupported';

export interface UseDeviceHeadingResult {
  heading: number | null;
  permissionState: PermissionState;
  isSupported: boolean;
  isHeadingEnabled: boolean;
  toggleHeading: () => Promise<boolean>;
  requestPermission: () => Promise<boolean>;
  error: string | null;
}

export function useDeviceHeading(): UseDeviceHeadingResult {
  const [heading, setHeadingState] = useState<number | null>(null);
  const [isHeadingEnabled, setIsHeadingEnabled] = useState<boolean>(true);
  const [permissionState, setPermissionState] = useState<PermissionState>('prompt');
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isListeningRef = useRef(false);

  // Get screen orientation offset (portrait = 0, landscape = 90 / -90 / 270)
  const getScreenOrientation = (): number => {
    if (typeof window === 'undefined') return 0;
    if (window.screen && window.screen.orientation && typeof window.screen.orientation.angle === 'number') {
      return window.screen.orientation.angle;
    }
    if (typeof window.orientation === 'number') {
      return window.orientation;
    }
    return 0;
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const supported = 'DeviceOrientationEvent' in window;
    setIsSupported(supported);

    if (!supported) {
      setPermissionState('unsupported');
      return;
    }

    // Check if explicit permission API exists (iOS 13+)
    const DeviceOrientationEventTyped = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };

    if (typeof DeviceOrientationEventTyped.requestPermission === 'function') {
      setPermissionState('prompt');
    } else {
      setPermissionState('not-required');
    }
  }, []);

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    let compassHeading: number | null = null;

    // 1. iOS WebKit Compass Heading (Magnetic North, 0..360)
    if ('webkitCompassHeading' in event && typeof (event as any).webkitCompassHeading === 'number') {
      const iosHeading = (event as any).webkitCompassHeading;
      if (!isNaN(iosHeading)) {
        compassHeading = iosHeading;
      }
    } else if (event.alpha !== null && event.alpha !== undefined && !isNaN(event.alpha)) {
      // 2. Android / W3C Device Orientation alpha
      // alpha = 0 is North in W3C spec if absolute=true, rotating counter-clockwise
      const alpha = event.alpha;
      const screenAngle = getScreenOrientation();

      // Convert alpha to compass heading (clockwise from North) and account for screen rotation
      let calculatedHeading = 360 - alpha + screenAngle;
      compassHeading = (calculatedHeading % 360 + 360) % 360;
    }

    if (compassHeading !== null && !isNaN(compassHeading)) {
      const normalized = Math.round((compassHeading % 360 + 360) % 360);
      setHeadingState(normalized);
    }
  }, []);

  const startListening = useCallback(() => {
    if (isListeningRef.current || typeof window === 'undefined') return;

    window.addEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
    window.addEventListener('deviceorientation', handleOrientation as EventListener, true);
    isListeningRef.current = true;
  }, [handleOrientation]);

  const stopListening = useCallback(() => {
    if (!isListeningRef.current || typeof window === 'undefined') return;

    window.removeEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
    window.removeEventListener('deviceorientation', handleOrientation as EventListener, true);
    isListeningRef.current = false;
  }, [handleOrientation]);

  useEffect(() => {
    if (!isHeadingEnabled) {
      stopListening();
      setHeadingState(null);
      return;
    }

    if (permissionState === 'granted' || permissionState === 'not-required') {
      startListening();

      // Fallback default North 0° if hardware listener hasn't received first event yet
      const timer = setTimeout(() => {
        setHeadingState((prev) => (prev === null ? 0 : prev));
      }, 500);

      return () => {
        clearTimeout(timer);
        stopListening();
      };
    } else {
      stopListening();
      setHeadingState(null);
    }
  }, [isHeadingEnabled, permissionState, startListening, stopListening]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      setPermissionState('unsupported');
      setError('Device orientation is not supported on this device');
      return false;
    }

    const DeviceOrientationEventTyped = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };

    if (typeof DeviceOrientationEventTyped.requestPermission === 'function') {
      try {
        const response = await DeviceOrientationEventTyped.requestPermission();
        if (response === 'granted') {
          setPermissionState('granted');
          setError(null);
          startListening();
          return true;
        } else {
          setPermissionState('denied');
          setError('Permission to access orientation was denied');
          return false;
        }
      } catch (err: any) {
        const message = err?.message || 'Failed to request orientation permission';
        setError(message);
        setPermissionState('denied');
        return false;
      }
    } else {
      setPermissionState('granted');
      setError(null);
      startListening();
      return true;
    }
  }, [startListening]);

  const toggleHeading = useCallback(async (): Promise<boolean> => {
    if (isHeadingEnabled) {
      setIsHeadingEnabled(false);
      setHeadingState(null);
      return false;
    } else {
      let permitted = true;
      if (permissionState === 'prompt') {
        permitted = await requestPermission();
      }
      
      if (permitted || permissionState === 'not-required' || permissionState === 'granted') {
        setIsHeadingEnabled(true);
        if (heading === null) {
          setHeadingState(0);
        }
        return true;
      }
      return false;
    }
  }, [isHeadingEnabled, permissionState, requestPermission, heading]);

  return {
    heading,
    permissionState,
    isSupported,
    isHeadingEnabled,
    toggleHeading,
    requestPermission,
    error,
  };
}
