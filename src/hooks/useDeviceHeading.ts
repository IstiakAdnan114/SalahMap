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
  isSimulated: boolean;
}

export function useDeviceHeading(): UseDeviceHeadingResult {
  const [heading, setHeading] = useState<number | null>(null);
  const [isHeadingEnabled, setIsHeadingEnabled] = useState<boolean>(true);
  const [permissionState, setPermissionState] = useState<PermissionState>('prompt');
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [isSimulated, setIsSimulated] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isListeningRef = useRef(false);
  const hasHardwareDataRef = useRef(false);
  const simulatedTimerRef = useRef<number | null>(null);

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
    let rawHeading: number | null = null;

    // 1. iOS webkitCompassHeading (0 = North, 90 = East, etc.)
    if ('webkitCompassHeading' in event && typeof (event as any).webkitCompassHeading === 'number') {
      rawHeading = (event as any).webkitCompassHeading;
    } else if (event.alpha !== null && event.alpha !== undefined) {
      // 2. Standard W3C alpha (0..360)
      // 360 - alpha converts counter-clockwise alpha into clockwise compass heading
      rawHeading = (360 - event.alpha) % 360;
    }

    if (rawHeading !== null && !isNaN(rawHeading)) {
      hasHardwareDataRef.current = true;
      setIsSimulated(false);
      const normalized = (rawHeading % 360 + 360) % 360;
      setHeading(Math.round(normalized));
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

  // Handle fallback simulation for desktop browsers without orientation sensors
  useEffect(() => {
    if (!isHeadingEnabled) {
      stopListening();
      if (simulatedTimerRef.current) clearInterval(simulatedTimerRef.current);
      setHeading(null);
      return;
    }

    if (permissionState === 'granted' || permissionState === 'not-required') {
      startListening();

      // Check after 800ms if hardware sensor is active
      const timer = setTimeout(() => {
        if (!hasHardwareDataRef.current) {
          // No hardware sensor (likely desktop preview), set initial simulation angle (e.g. 45 degrees pointing North-East)
          setIsSimulated(true);
          setHeading((prev) => (prev === null ? 45 : prev));
        }
      }, 800);

      return () => {
        clearTimeout(timer);
        stopListening();
      };
    } else {
      stopListening();
      setHeading(null);
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
      setHeading(null);
      return false;
    } else {
      let permitted = true;
      if (permissionState === 'prompt') {
        permitted = await requestPermission();
      }
      
      if (permitted || permissionState === 'not-required' || permissionState === 'granted') {
        setIsHeadingEnabled(true);
        // On desktop or when clicking toggle repeatedly, rotate simulation angle by +45 deg for feedback
        if (!hasHardwareDataRef.current) {
          setIsSimulated(true);
          setHeading((prev) => (prev === null ? 45 : (prev + 45) % 360));
        }
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
    isSimulated,
  };
}
