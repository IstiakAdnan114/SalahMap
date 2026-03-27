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
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="11" fill="#0F7A5C" />
      <path d="M3 21h18" stroke="white"/>
      <path d="M10 21V10a2 2 0 0 1 4 0v11" stroke="white"/>
      <path d="M4 21V10a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11" stroke="white"/>
      <path d="M9 8V4a2 2 0 0 1 4 0v4" stroke="white"/>
    </svg>
  `)}`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -18],
});

const UserLocationIcon = L.divIcon({
  className: 'bg-blue-500 w-3 h-3 rounded-full border-2 border-white box-border shadow-sm',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
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
