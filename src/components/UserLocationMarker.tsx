import React, { useEffect, useRef, useMemo } from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';

interface UserLocationMarkerProps {
  position: [number, number];
  heading: number | null;
}

export const UserLocationMarker: React.FC<UserLocationMarkerProps> = ({ position, heading }) => {
  const markerRef = useRef<L.Marker>(null);

  const customIcon = useMemo(() => {
    const size = 96;
    const center = size / 2; // 48
    const radius = 40;

    // 60-degree cone pointing straight UP (0° / North)
    const x1 = center + radius * Math.sin((-30 * Math.PI) / 180);
    const y1 = center - radius * Math.cos((-30 * Math.PI) / 180);
    const x2 = center + radius * Math.sin((30 * Math.PI) / 180);
    const y2 = center - radius * Math.cos((30 * Math.PI) / 180);

    const conePath = `M ${center} ${center} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
    const currentHeading = heading !== null ? heading : 0;
    const showCone = heading !== null;

    const svgContent = `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" style="overflow: visible;">
        <defs>
          <radialGradient id="user-heading-cone-gradient" cx="${center}" cy="${center}" r="${radius}" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#1D4ED8" stop-opacity="0.65" />
            <stop offset="50%" stop-color="#3B82F6" stop-opacity="0.35" />
            <stop offset="100%" stop-color="#60A5FA" stop-opacity="0" />
          </radialGradient>
        </defs>

        <!-- Rotating Cone Group -->
        ${
          showCone
            ? `<g class="heading-cone-group" transform="rotate(${currentHeading}, ${center}, ${center})">
                <path d="${conePath}" fill="url(#user-heading-cone-gradient)" />
                <line x1="${center}" y1="${center}" x2="${x1.toFixed(2)}" y2="${y1.toFixed(2)}" stroke="#3B82F6" stroke-opacity="0.4" stroke-width="1" />
                <line x1="${center}" y1="${center}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#3B82F6" stroke-opacity="0.4" stroke-width="1" />
              </g>`
            : ''
        }

        <!-- Outer Pulsing Glow -->
        <circle cx="${center}" cy="${center}" r="15" fill="#3B82F6" opacity="0.25" class="animate-ping" style="transform-origin: ${center}px ${center}px;" />
        
        <!-- White Ring Halo -->
        <circle cx="${center}" cy="${center}" r="10" fill="#FFFFFF" style="filter: drop-shadow(0px 2px 5px rgba(0,0,0,0.25));" />
        
        <!-- Core Blue Location Dot -->
        <circle cx="${center}" cy="${center}" r="7" fill="#2563EB" stroke="#FFFFFF" stroke-width="1.5" />
      </svg>
    `;

    return L.divIcon({
      className: 'user-heading-location-icon',
      html: svgContent,
      iconSize: [size, size],
      iconAnchor: [center, center],
    });
  }, [heading]);

  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.setIcon(customIcon);
    }
  }, [customIcon]);

  return <Marker ref={markerRef} position={position} icon={customIcon} zIndexOffset={1000} />;
};

export default UserLocationMarker;
