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

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const supported = 'DeviceOrientationEvent' in window;
    setIsSupported(supported);

    if (!supported) {
      setPermissionState('unsupported');
      return;
    }

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
    let rawHeading: number | null = null;

    // iOS webkitCompassHeading
    if ('webkitCompassHeading' in event && typeof (event as any).webkitCompassHeading === 'number') {
      const iosHeading = (event as any).webkitCompassHeading;
      if (!isNaN(iosHeading)) {
        rawHeading = iosHeading;
      }
    } else if (event.alpha !== null && event.alpha !== undefined && !isNaN(event.alpha)) {
      // Android / W3C standard: heading = 360 - alpha
      rawHeading = (360 - event.alpha) % 360;
    }

    if (rawHeading !== null && !isNaN(rawHeading)) {
      const normalized = Math.round((rawHeading % 360 + 360) % 360);
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
      return () => {
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
        return true;
      }
      return false;
    }
  }, [isHeadingEnabled, permissionState, requestPermission]);

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
