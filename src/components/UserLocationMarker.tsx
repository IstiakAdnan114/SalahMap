import React, { useMemo } from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';

interface UserLocationMarkerProps {
  position: [number, number];
  heading: number | null;
}

export const UserLocationMarker: React.FC<UserLocationMarkerProps> = ({ position, heading }) => {
  const customIcon = useMemo(() => {
    const size = 96;
    const center = size / 2; // 48
    const radius = 40;

    // Calculate arc end points for 60-degree cone pointing UP (North / 0 deg)
    // -30 deg and +30 deg
    const x1 = center + radius * Math.sin((-30 * Math.PI) / 180); // 48 - 20 = 28
    const y1 = center - radius * Math.cos((-30 * Math.PI) / 180); // 48 - 34.64 = 13.36
    const x2 = center + radius * Math.sin((30 * Math.PI) / 180);  // 48 + 20 = 68
    const y2 = center - radius * Math.cos((30 * Math.PI) / 180);  // 48 - 34.64 = 13.36

    const conePath = `M ${center} ${center} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;

    const gradId = `heading-cone-grad-${heading !== null ? heading : 'none'}`;

    const svgContent = `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" style="overflow: visible;">
        <defs>
          <radialGradient id="${gradId}" cx="${center}" cy="${center}" r="${radius}" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#1D4ED8" stop-opacity="0.6" />
            <stop offset="50%" stop-color="#3B82F6" stop-opacity="0.3" />
            <stop offset="100%" stop-color="#60A5FA" stop-opacity="0" />
          </radialGradient>
        </defs>

        ${
          heading !== null
            ? `
          <g style="transform: rotate(${heading}deg); transform-origin: ${center}px ${center}px; transition: transform 0.15s ease-out;">
            <path d="${conePath}" fill="url(#${gradId})" />
            <!-- Cone accent beam lines -->
            <line x1="${center}" y1="${center}" x2="${x1.toFixed(2)}" y2="${y1.toFixed(2)}" stroke="#3B82F6" stroke-opacity="0.3" stroke-width="1" />
            <line x1="${center}" y1="${center}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#3B82F6" stroke-opacity="0.3" stroke-width="1" />
          </g>
        `
            : ''
        }

        <!-- Outer Pulsing Glow -->
        <circle cx="${center}" cy="${center}" r="14" fill="#3B82F6" opacity="0.25" class="animate-ping" style="transform-origin: ${center}px ${center}px;" />
        
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

  return <Marker position={position} icon={customIcon} zIndexOffset={1000} />;
};

export default UserLocationMarker;
