import * as L from 'leaflet';

/**
 * Converts a Leaflet layer to a GeoJSON feature.
 * Handles different layer types (marker, circle, polyline, polygon).
 * @param layer The Leaflet layer to convert.
 * @returns A GeoJSON Feature object.
 */
export function layerToGeoJSON(layer: L.Layer): GeoJSON.Feature | null {
  if (layer instanceof L.Marker) {
    const latlng = layer.getLatLng();
    return {
      type: 'Feature',
      properties: {
        type: 'marker',
        // Attempt to preserve custom icon URL if it was set
        iconUrl: (layer.options as any).icon?.options?.iconUrl || null,
        iconSize: (layer.options as any).icon?.options?.iconSize || null,
        iconAnchor: (layer.options as any).icon?.options?.iconAnchor || null,
      },
      geometry: {
        type: 'Point',
        coordinates: [latlng.lng, latlng.lat]
      }
    };
  } else if (layer instanceof L.Circle) {
    const center = layer.getLatLng();
    const radius = layer.getRadius();
    return {
      type: 'Feature',
      properties: {
        type: 'circle',
        radius: radius,
        style: layer.options // Preserve style options like color, fillColor, etc.
      },
      geometry: {
        type: 'Point', // GeoJSON circle is represented as a point with a radius property
        coordinates: [center.lng, center.lat]
      }
    };
  } else if (layer instanceof L.Polyline) {
    const latlngs = layer.getLatLngs() as L.LatLng[];
    return {
      type: 'Feature',
      properties: {
        type: 'polyline',
        style: layer.options // Preserve style options
      },
      geometry: {
        type: 'LineString',
        coordinates: latlngs.map(latlng => [latlng.lng, latlng.lat])
      }
    };
  } else if (layer instanceof L.Polygon) {
    const latlngs = layer.getLatLngs() as L.LatLng[][]; // Can be multiple rings
    const coordinates = latlngs.map(ring =>
      ring.map(latlng => [latlng.lng, latlng.lat])
    );
    return {
      type: 'Feature',
      properties: {
        type: 'polygon',
        style: layer.options // Preserve style options
      },
      geometry: {
        type: 'Polygon',
        coordinates: coordinates
      }
    };
  }
  return null;
}

/**
 * Converts a GeoJSON feature to a Leaflet layer.
 * @param feature The GeoJSON Feature object.
 * @returns A Leaflet Layer object.
 */
export function geoJSONToLayer(feature: GeoJSON.Feature): L.Layer | null {
  if (!feature || !feature.geometry) {
    return null;
  }

  const properties = feature.properties || {};
  const style = properties['style'] || {}; // Retrieve preserved style options

  switch (feature.geometry.type) {
    case 'Point':
      const coords = (feature.geometry as GeoJSON.Point).coordinates;
      const latlng = L.latLng(coords[1], coords[0]);

      if (properties['type'] === 'marker') {
        const iconOptions = {
          // Use the stored iconUrl or a default SVG data URL
          iconUrl: properties['iconUrl'] || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23FEB101"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg>',
          iconSize: properties['iconSize'] || [25, 41],
          iconAnchor: properties['iconAnchor'] || [12, 41],
          className: properties['iconUrl'] ? '' : 'custom-marker-icon' // Apply custom class only if using default SVG
        };
        return L.marker(latlng, { icon: L.icon(iconOptions) });
      } else if (properties['type'] === 'circle' && properties['radius']) {
        return L.circle(latlng, { radius: properties['radius'], ...style });
      }
      return L.marker(latlng); // Default marker if type is not specified
    case 'LineString':
      const lineCoords = (feature.geometry as GeoJSON.LineString).coordinates;
      const lineLatLngs = lineCoords.map(c => L.latLng(c[1], c[0]));
      return L.polyline(lineLatLngs, style);
    case 'Polygon':
      const polyCoords = (feature.geometry as GeoJSON.Polygon).coordinates;
      const polyLatLngs = polyCoords.map(ring =>
        ring.map(c => L.latLng(c[1], c[0]))
      );
      return L.polygon(polyLatLngs, style);
    default:
      return null;
  }
}
