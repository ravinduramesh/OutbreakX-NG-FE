import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import * as L from 'leaflet';
import 'leaflet-draw';
import 'leaflet-routing-machine';
import { ProjectService } from '../services/project.service';
import { geoJSONToLayer, layerToGeoJSON } from '../shared/geojson.utils';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  templateUrl: './map.html',
  styleUrl: './map.scss',
})
export class MapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer') mapContainer!: ElementRef;

  private map!: L.Map;
  private drawnItems!: L.FeatureGroup;
  private drawControl!: L.Control.Draw;
  private routingControl: L.Routing.Control | null = null;

  private activeProjectSubscription!: Subscription;
  private currentProjectGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [],
  };

  isDrawingRoute: boolean = false;

  constructor(
    private projectService: ProjectService,
    private snackBar: MatSnackBar
  ) {}

  ngAfterViewInit(): void {
    this.initializeMap();
    this.setupDrawingControls();
    this.subscribeToActiveProject();
  }

  ngOnDestroy(): void {
    // Clean up map and subscriptions to prevent memory leaks
    if (this.map) {
      this.map.remove();
    }
    if (this.activeProjectSubscription) {
      this.activeProjectSubscription.unsubscribe();
    }
    if (this.routingControl) {
      this.map.removeControl(this.routingControl);
    }
  }

  /**
   * Initializes the Leaflet map.
   */
  private initializeMap(): void {
    this.map = L.map(this.mapContainer.nativeElement, {
      center: [51.505, -0.09], // Default center (London)
      zoom: 13,
      zoomControl: false, // We'll rely on Leaflet.draw's controls or custom ones
    });

    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.map);

    // FeatureGroup to store all drawn items
    this.drawnItems = new L.FeatureGroup().addTo(this.map);
  }

  /**
   * Invalidates the map size to ensure it resizes correctly after changes.
   * Useful when the map container size changes (e.g., after sidenav toggle).
   */
  invalidateMapSize(): void {
    if (this.map) {
      this.map.invalidateSize();
    }
  }

  /**
   * Sets up Leaflet.draw controls and event listeners.
   */
  private setupDrawingControls(): void {
    this.drawControl = new L.Control.Draw({
      edit: {
        featureGroup: this.drawnItems, // Enable editing and deleting of drawn items
        remove: true,
      },
      draw: {
        polygon: {
          allowIntersection: true,
          showArea: true,
          shapeOptions: {
            color: '#1F75FE', // Secondary color for polygon outline
            fillColor: 'rgba(31, 117, 254, 0.2)', // Secondary color with transparency for fill
          },
        },
        polyline: {
          shapeOptions: {
            color: '#660BC2', // Primary color for polyline
            weight: 5,
          },
        },
        circle: {
          shapeOptions: {
            color: '#FEB101', // Accent color for circle outline
            fillColor: 'rgba(254, 177, 1, 0.2)', // Accent color with transparency for fill
          },
        },
        marker: {
          icon: L.icon({
            // Custom marker icon using SVG data URL with accent color
            iconUrl:
              'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23FEB101"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg>',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            className: 'custom-marker-icon', // Apply custom class for additional styling if needed
          }),
        },
        rectangle: false, // Disable rectangle drawing as per requirements
        circlemarker: false, // Disable circlemarker drawing as per requirements
      },
    });

    this.map.addControl(this.drawControl);

    // Event listeners for drawing actions
    this.map.on(L.Draw.Event.CREATED, (event) => {
      const layer = (event as L.DrawEvents.Created).layer;
      this.drawnItems.addLayer(layer); // Add the newly drawn layer to the feature group
      this.updateGeoJSON(); // Update the project's GeoJSON data
      this.snackBar.open('Feature added!', 'Dismiss', { duration: 2000 });
    });

    this.map.on(L.Draw.Event.EDITED, () => {
      this.updateGeoJSON(); // Update GeoJSON after editing
      this.snackBar.open('Feature edited!', 'Dismiss', { duration: 2000 });
    });

    this.map.on(L.Draw.Event.DELETED, () => {
      this.updateGeoJSON(); // Update GeoJSON after deleting
      this.snackBar.open('Feature deleted!', 'Dismiss', { duration: 2000 });
    });
  }

  /**
   * Subscribes to the active project changes from the ProjectService.
   * Loads GeoJSON data for the newly active project onto the map.
   */
  private subscribeToActiveProject(): void {
    this.activeProjectSubscription =
      this.projectService.activeProject$.subscribe((project) => {
        this.clearMapLayers(); // Clear existing features from the map
        if (project) {
          // Deep copy the GeoJSON to avoid direct mutation issues
          this.currentProjectGeoJSON = JSON.parse(
            JSON.stringify(project.geojson)
          );
          this.loadGeoJSONToMap(this.currentProjectGeoJSON); // Load features of the new active project

          // Fit map bounds to the drawn items, or default bounds if no items
          if (this.drawnItems.getBounds().isValid()) {
            this.map.fitBounds(this.drawnItems.getBounds());
          } else {
            this.map.setView([51.505, -0.09], 13); // Reset to default view if no features
          }
        } else {
          this.currentProjectGeoJSON = {
            type: 'FeatureCollection',
            features: [],
          };
        }
      });
  }

  /**
   * Clears all drawn layers and routing controls from the map.
   */
  private clearMapLayers(): void {
    this.drawnItems.clearLayers();
    if (this.routingControl) {
      this.map.removeControl(this.routingControl);
      this.routingControl = null;
    }
  }

  /**
   * Loads GeoJSON features onto the map.
   * @param geojson The GeoJSON FeatureCollection to load.
   */
  private loadGeoJSONToMap(geojson: GeoJSON.FeatureCollection): void {
    if (!geojson || !geojson.features) {
      return;
    }
    geojson.features.forEach((feature) => {
      const layer = geoJSONToLayer(feature); // Convert GeoJSON feature to Leaflet layer
      if (layer) {
        this.drawnItems.addLayer(layer); // Add layer to the drawn items group
      } else {
        console.warn(
          'Could not convert GeoJSON feature to Leaflet layer:',
          feature
        );
      }
    });
  }

  /**
   * Updates the GeoJSON data in the ProjectService based on current map layers.
   * This ensures real-time persistence of drawn features.
   */
  private updateGeoJSON(): void {
    const features: GeoJSON.Feature[] = [];
    this.drawnItems.eachLayer((layer: L.Layer) => {
      const feature = layerToGeoJSON(layer); // Convert each Leaflet layer back to GeoJSON feature
      if (feature) {
        features.push(feature);
      }
    });
    this.currentProjectGeoJSON = {
      type: 'FeatureCollection',
      features: features,
    };
    this.projectService.updateActiveProjectGeoJSON(this.currentProjectGeoJSON);
  }

  /**
   * Initiates the route drawing process using Leaflet Routing Machine.
   * Prompts the user to click two points on the map.
   */
  drawRoute(): void {
    this.isDrawingRoute = true;
    this.snackBar.open(
      'Click two points on the map to define a route.',
      'Dismiss',
      { duration: 5000 }
    );

    // Remove any existing routing control before starting a new one
    if (this.routingControl) {
      this.map.removeControl(this.routingControl);
      this.routingControl = null;
    }

    let waypoints: L.LatLng[] = [];
    let tempMarkers: L.Marker[] = []; // To store temporary markers for waypoints

    const clickHandler = (e: L.LeafletMouseEvent) => {
      waypoints.push(e.latlng);
      // Add a temporary marker to show the clicked waypoint
      const tempMarker = L.marker(e.latlng, {
        icon: L.icon({
          iconUrl:
            'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%231F75FE"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg>',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
        }),
      }).addTo(this.map);
      tempMarkers.push(tempMarker);

      if (waypoints.length === 2) {
        this.map.off('click', clickHandler); // Remove listener after two points are selected
        this.isDrawingRoute = false;
        this.createRoutingControl(waypoints); // Create the routing control
        // Clear temporary markers after route is initiated
        tempMarkers.forEach((marker) => this.map.removeLayer(marker));
        tempMarkers = [];
        waypoints = []; // Reset waypoints for next route
      }
    };

    this.map.on('click', clickHandler);
  }

  /**
   * Creates and adds the Leaflet Routing Machine control to the map.
   * @param waypoints An array of Leaflet LatLng objects for the route.
   */
  private createRoutingControl(waypoints: L.LatLng[]): void {
    if (this.routingControl) {
      this.map.removeControl(this.routingControl);
    }

    const startIcon =
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23660BC2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg>'; // Start marker (Purple)
    const endIcon =
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%231F75FE"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg>'; // End marker (Blue)

    this.routingControl = L.Routing.control({
      waypoints: waypoints,
      routeWhileDragging: true, // Calculate route while dragging waypoints (if draggable)
      showAlternatives: false, // Do not show alternative routes
      addWaypoints: false, // Do not allow adding more waypoints via UI
      fitSelectedRoutes: true, // Fit map to the selected route
      lineOptions: {
        styles: [{ color: '#660BC2', weight: 5, opacity: 0.7 }], // Primary color for route line
        extendToWaypoints: false,
        missingRouteTolerance: 0,
      },
      createMarker: function (i: number, waypoint: any) {
        return L.marker(waypoint.latLng, {
          icon: L.icon({
            iconUrl: i === 0 ? startIcon : endIcon,
            iconSize: [25, 41],
            iconAnchor: [12, 41],
          }),
          draggable: true,
        });
      },
    } as any).addTo(this.map);

    // Event listener for when routes are found
    this.routingControl.on('routesfound', (e: any) => {
      const routes = e.routes;
      if (routes && routes.length > 0) {
        const routeLine = routes[0].coordinates; // Array of LatLng objects representing the route path
        const geojsonLine: GeoJSON.Feature = {
          type: 'Feature',
          properties: {
            type: 'route', // Custom type to identify routes
            name: 'Generated Route',
            style: { color: '#660BC2', weight: 5, opacity: 0.7 }, // Store style for persistence
          },
          geometry: {
            type: 'LineString',
            coordinates: routeLine.map((latlng: L.LatLng) => [
              latlng.lng,
              latlng.lat,
            ]), // Convert LatLng to [lng, lat]
          },
        };
        // Add the route as a new feature to the drawn items and update GeoJSON
        // Use L.geoJSON to create a layer from the GeoJSON feature
        const routeLayer = L.geoJSON(geojsonLine);
        this.drawnItems.addLayer(routeLayer); // Add to drawnItems so it can be edited/deleted by Leaflet.draw
        this.updateGeoJSON();
        this.snackBar.open('Route added!', 'Dismiss', { duration: 2000 });
      }
    });

    // Event listener for routing errors
    this.routingControl.on('routingerror', (e: any) => {
      console.error('Routing error:', e);
      this.snackBar.open(
        'Could not find a route. Please try different points.',
        'Dismiss',
        { duration: 3000 }
      );
      // Remove the routing control if an error occurs
      if (this.routingControl) {
        this.map.removeControl(this.routingControl);
        this.routingControl = null;
      }
    });
  }

  /**
   * Handles GeoJSON file import.
   * Reads the selected file and loads its features onto the map.
   * @param event The file input change event.
   */
  importGeoJSON(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const geojson = JSON.parse(
            e.target?.result as string
          ) as GeoJSON.FeatureCollection;
          this.clearMapLayers(); // Clear existing features before importing new ones
          this.loadGeoJSONToMap(geojson); // Load new features from the imported GeoJSON
          this.updateGeoJSON(); // Save the imported data to the active project
          this.snackBar.open('GeoJSON imported successfully!', 'Dismiss', {
            duration: 2000,
          });
        } catch (error) {
          console.error('Error parsing GeoJSON:', error);
          this.snackBar.open('Invalid GeoJSON file.', 'Dismiss', {
            duration: 3000,
          });
        }
      };
      reader.readAsText(file); // Read the file content as text
    }
  }

  /**
   * Exports the current project's GeoJSON data as a downloadable file.
   */
  exportGeoJSON(): void {
    this.projectService.activeProject$.subscribe((activeProject) => {
      if (activeProject && activeProject.geojson) {
        const geojsonString = JSON.stringify(activeProject.geojson, null, 2); // Pretty print GeoJSON
        const blob = new Blob([geojsonString], { type: 'application/json' }); // Create a Blob from the string
        const url = URL.createObjectURL(blob); // Create a URL for the Blob
        const a = document.createElement('a'); // Create a temporary anchor element
        a.href = url;
        a.download = `${activeProject.name || 'map_project'}.geojson`; // Set download filename
        document.body.appendChild(a); // Append to body (required for Firefox)
        a.click(); // Programmatically click the anchor to trigger download
        document.body.removeChild(a); // Remove the temporary anchor
        URL.revokeObjectURL(url); // Release the object URL
        this.snackBar.open('GeoJSON exported!', 'Dismiss', { duration: 2000 });
      } else {
        this.snackBar.open(
          'No active project or no data to export.',
          'Dismiss',
          { duration: 3000 }
        );
      }
    });
  }
}
