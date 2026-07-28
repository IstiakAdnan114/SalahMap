import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { motion } from 'motion/react';
import { Mosque, COUNTRY_BOUNDS, COUNTRY_CENTER } from '../types';
import MosquePopup from './MosquePopup';

// Add custom styles for tooltips
const tooltipStyles = `
  .mosque-tooltip {
    background: white !important;
    border: 1px solid #0F7A5C !important;
    border-radius: 6px !important;
    padding: 2px 6px !important;
    font-size: 10px !important;
    font-weight: 700 !important;
    color: #0F7A5C !important;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
  }
  .mosque-tooltip::before {
    border-top-color: #0F7A5C !important;
  }
`;

// Fix for default marker icons in Leaflet with Vite
// @ts-ignore
import markerIcon from 'leaflet/dist/images/marker-icon.png';
// @ts-ignore
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapProps {
  center: [number, number];
  userLocation?: [number, number] | null;
  mosques: Mosque[];
  showLabels?: boolean;
  onMosqueSelect: (mosque: Mosque) => void;
  onCenterChange?: (center: [number, number]) => void;
  onDeleteMosque?: (id: string) => void;
  isAdding?: boolean;
}

function MapEvents({ onCenterChange }: { onCenterChange?: (center: [number, number]) => void }) {
  const map = useMap();
  const lastCenter = React.useRef<[number, number]>([0, 0]);

  useEffect(() => {
    if (!onCenterChange) return;
    
    const handleMoveEnd = () => {
      const center = map.getCenter();
      const newCenter: [number, number] = [center.lat, center.lng];
      
      // Only trigger if moved significantly (> 0.0001 degrees, approx 10m)
      const dist = Math.sqrt(
        Math.pow(newCenter[0] - lastCenter.current[0], 2) + 
        Math.pow(newCenter[1] - lastCenter.current[1], 2)
      );

      if (dist > 0.0001) {
        lastCenter.current = newCenter;
        onCenterChange(newCenter);
      }
    };

    map.on('moveend', handleMoveEnd);
    return () => {
      map.off('moveend', handleMoveEnd);
    };
  }, [map, onCenterChange]);
  return null;
}

function RecenterMap({ center, force }: { center: [number, number], force: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [force, map]); // Only recenter when 'force' trigger changes
  return null;
}

const MosqueIcon = L.icon({
  iconUrl: `data:image/svg+xml;base64,${btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44" fill="none">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
          <feOffset dx="0" dy="2" result="offsetblur" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.3" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle cx="22" cy="22" r="18" fill="#10B981" filter="url(#shadow)" stroke="white" stroke-width="2" />
      <g transform="translate(10, 10) scale(0.8)">
        <path d="M3 21h18" stroke="white" stroke-width="2" stroke-linecap="round"/>
        <path d="M10 21V10a2 2 0 0 1 4 0v11" stroke="white" stroke-width="2" stroke-linecap="round"/>
        <path d="M4 21V10a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11" stroke="white" stroke-width="2" stroke-linecap="round"/>
        <path d="M9 8V4a2 2 0 0 1 4 0v4" stroke="white" stroke-width="2" stroke-linecap="round"/>
      </g>
    </svg>
  `)}`,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
  popupAnchor: [0, -22],
});

const UserLocationIcon = L.divIcon({
  className: 'user-location-marker',
  html: `
    <div class="relative flex items-center justify-center">
      <div class="absolute w-6 h-6 bg-blue-500 rounded-full animate-ping opacity-20"></div>
      <div class="relative w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-lg"></div>
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const Map: React.FC<MapProps & { forceRecenter?: number }> = ({ center, userLocation, mosques, showLabels = true, onMosqueSelect, onCenterChange, onDeleteMosque, forceRecenter = 0, isAdding = false }) => {
  return (
    <div className="h-full w-full relative z-0">
      <style>{tooltipStyles}</style>
      <MapContainer
        center={center}
        zoom={16}
        className="h-full w-full"
        zoomControl={false}
        maxBounds={COUNTRY_BOUNDS}
        minZoom={7}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RecenterMap center={center} force={forceRecenter} />
        <MapEvents onCenterChange={onCenterChange} />
        
        {/* User Location Marker (Blue Dot) */}
        {userLocation && (
          <Marker position={userLocation} icon={UserLocationIcon} />
        )}

        {mosques.map((mosque) => (
          <Marker
            key={mosque.id}
            position={[mosque.latitude, mosque.longitude]}
            icon={MosqueIcon}
            eventHandlers={{
              click: () => onMosqueSelect(mosque),
            }}
          >
            {showLabels && (
              <Tooltip 
                permanent 
                direction="top" 
                offset={[0, -15]} 
                className="mosque-tooltip"
              >
                {mosque.name}
              </Tooltip>
            )}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default Map;
