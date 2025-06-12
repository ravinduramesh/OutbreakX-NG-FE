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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
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
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
  ],
  templateUrl: './map.html',
  styleUrl: './map.scss',
})
export class MapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer') mapContainer!: ElementRef;

  private map!: L.Map;
  private drawnItems!: L.FeatureGroup;
  private routingControl: L.Routing.Control | null = null;

  private activeProjectSubscription!: Subscription;
  private currentProjectGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [],
  };

  // Drawing state management
  activeDrawingMode: string | null = null;
  isDrawingRoute: boolean = false;
  isEditMode: boolean = false;
  isDeleteMode: boolean = false;
  
  // Search functionality
  searchQuery: string = '';
  
  // Drawing handlers
  private currentDrawHandler: any = null;
  private editHandler: any = null;
  private deleteHandler: any = null;

  constructor(
    private projectService: ProjectService,
    private snackBar: MatSnackBar
  ) {}

  ngAfterViewInit(): void {
    this.initializeMap();
    this.setupDrawingHandlers();
    this.subscribeToActiveProject();
  }

  ngOnDestroy(): void {
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
      center: [51.505, -0.09],
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.map);

    this.drawnItems = new L.FeatureGroup().addTo(this.map);
  }

  /**
   * Sets up drawing handlers for different drawing modes.
   */
  private setupDrawingHandlers(): void {
    // Setup edit and delete handlers
    this.editHandler = new L.EditToolbar.Edit(this.map, {
      featureGroup: this.drawnItems,
    });

    this.deleteHandler = new L.EditToolbar.Delete(this.map, {
      featureGroup: this.drawnItems,
    });

    // Event listeners for drawing completion
    this.map.on(L.Draw.Event.CREATED, (event) => {
      const layer = (event as L.DrawEvents.Created).layer;
      this.drawnItems.addLayer(layer);
      this.updateGeoJSON();
      this.snackBar.open('Feature added!', 'Dismiss', { duration: 2000 });
      this.deactivateDrawingMode();
    });

    this.map.on(L.Draw.Event.EDITED, () => {
      this.updateGeoJSON();
      this.snackBar.open('Feature edited!', 'Dismiss', { duration: 2000 });
    });

    this.map.on(L.Draw.Event.DELETED, () => {
      this.updateGeoJSON();
      this.snackBar.open('Feature deleted!', 'Dismiss', { duration: 2000 });
    });
  }

  /**
   * Toggles drawing mode for different shapes.
   */
  toggleDrawingMode(mode: string): void {
    // Deactivate current mode if same mode is clicked
    if (this.activeDrawingMode === mode) {
      this.deactivateDrawingMode();
      return;
    }

    // Deactivate any existing drawing mode
    this.deactivateDrawingMode();
    this.deactivateEditMode();
    this.deactivateDeleteMode();

    this.activeDrawingMode = mode;

    const drawOptions = {
      polygon: {
        allowIntersection: false,
        showArea: true,
        shapeOptions: {
          color: '#1F75FE',
          fillColor: 'rgba(31, 117, 254, 0.2)',
        },
      },
      polyline: {
        shapeOptions: {
          color: '#660BC2',
          weight: 5,
        },
      },
      circle: {
        shapeOptions: {
          color: '#FEB101',
          fillColor: 'rgba(254, 177, 1, 0.2)',
        },
      },
      marker: {
        icon: L.icon({
          iconUrl:
            'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23FEB101"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg>',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          className: 'custom-marker-icon',
        }),
      },
    };

    switch (mode) {
      case 'marker':
        this.currentDrawHandler = new L.Draw.Marker(this.map, drawOptions.marker);
        break;
      case 'polyline':
        this.currentDrawHandler = new L.Draw.Polyline(this.map, drawOptions.polyline);
        break;
      case 'polygon':
        this.currentDrawHandler = new L.Draw.Polygon(this.map, drawOptions.polygon);
        break;
      case 'circle':
        this.currentDrawHandler = new L.Draw.Circle(this.map, drawOptions.circle);
        break;
    }

    if (this.currentDrawHandler) {
      this.currentDrawHandler.enable();
      this.snackBar.open(`${mode.charAt(0).toUpperCase() + mode.slice(1)} drawing mode activated`, 'Dismiss', { duration: 2000 });
    }
  }

  /**
   * Deactivates current drawing mode.
   */
  private deactivateDrawingMode(): void {
    if (this.currentDrawHandler) {
      this.currentDrawHandler.disable();
      this.currentDrawHandler = null;
    }
    this.activeDrawingMode = null;
  }

  /**
   * Toggles edit mode.
   */
  toggleEditMode(): void {
    if (this.isEditMode) {
      this.deactivateEditMode();
    } else {
      this.deactivateDrawingMode();
      this.deactivateDeleteMode();
      this.isEditMode = true;
      this.editHandler.enable();
      this.snackBar.open('Edit mode activated. Click features to edit them.', 'Dismiss', { duration: 3000 });
    }
  }

  /**
   * Deactivates edit mode.
   */
  private deactivateEditMode(): void {
    if (this.isEditMode) {
      this.editHandler.disable();
      this.isEditMode = false;
    }
  }

  /**
   * Toggles delete mode.
   */
  toggleDeleteMode(): void {
    if (this.isDeleteMode) {
      this.deactivateDeleteMode();
    } else {
      this.deactivateDrawingMode();
      this.deactivateEditMode();
      this.isDeleteMode = true;
      this.deleteHandler.enable();
      this.snackBar.open('Delete mode activated. Click features to delete them.', 'Dismiss', { duration: 3000 });
    }
  }

  /**
   * Deactivates delete mode.
   */
  private deactivateDeleteMode(): void {
    if (this.isDeleteMode) {
      this.deleteHandler.disable();
      this.isDeleteMode = false;
    }
  }

  /**
   * Searches for a location using Nominatim API.
   */
  async searchLocation(): void {
    if (!this.searchQuery.trim()) {
      this.snackBar.open('Please enter a location to search', 'Dismiss', { duration: 2000 });
      return;
    }

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(this.searchQuery)}&limit=1`
      );
      const data = await response.json();

      if (data && data.length > 0) {
        const result = data[0];
        const lat = parseFloat(result.lat);
        const lon = parseFloat(result.lon);
        
        this.map.setView([lat, lon], 15);
        
        // Add a temporary marker to show the search result
        const searchMarker = L.marker([lat, lon], {
          icon: L.icon({
            iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23FF5722"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg>',
            iconSize: [30, 46],
            iconAnchor: [15, 46],
          }),
        }).addTo(this.map);

        // Remove the search marker after 5 seconds
        setTimeout(() => {
          this.map.removeLayer(searchMarker);
        }, 5000);

        this.snackBar.open(`Found: ${result.display_name}`, 'Dismiss', { duration: 3000 });
      } else {
        this.snackBar.open('Location not found. Please try a different search term.', 'Dismiss', { duration: 3000 });
      }
    } catch (error) {
      console.error('Search error:', error);
      this.snackBar.open('Search failed. Please check your internet connection.', 'Dismiss', { duration: 3000 });
    }
  }

  /**
   * Subscribes to the active project changes.
   */
  private subscribeToActiveProject(): void {
    this.activeProjectSubscription =
      this.projectService.activeProject$.subscribe((project) => {
        this.clearMapLayers();
        if (project) {
          this.currentProjectGeoJSON = JSON.parse(
            JSON.stringify(project.geojson)
          );
          this.loadGeoJSONToMap(this.currentProjectGeoJSON);

          if (this.drawnItems.getBounds().isValid()) {
            this.map.fitBounds(this.drawnItems.getBounds());
          } else {
            this.map.setView([51.505, -0.09], 13);
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
   */
  private loadGeoJSONToMap(geojson: GeoJSON.FeatureCollection): void {
    if (!geojson || !geojson.features) {
      return;
    }
    geojson.features.forEach((feature) => {
      const layer = geoJSONToLayer(feature);
      if (layer) {
        this.drawnItems.addLayer(layer);
      } else {
        console.warn(
          'Could not convert GeoJSON feature to Leaflet layer:',
          feature
        );
      }
    });
  }

  /**
   * Updates the GeoJSON data in the ProjectService.
   */
  private updateGeoJSON(): void {
    const features: GeoJSON.Feature[] = [];
    this.drawnItems.eachLayer((layer: L.Layer) => {
      const feature = layerToGeoJSON(layer);
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
   * Initiates the route drawing process.
   */
  drawRoute(): void {
    this.deactivateDrawingMode();
    this.deactivateEditMode();
    this.deactivateDeleteMode();
    
    this.isDrawingRoute = true;
    this.snackBar.open(
      'Click two points on the map to define a route.',
      'Dismiss',
      { duration: 5000 }
    );

    if (this.routingControl) {
      this.map.removeControl(this.routingControl);
      this.routingControl = null;
    }

    let waypoints: L.LatLng[] = [];
    let tempMarkers: L.Marker[] = [];

    const clickHandler = (e: L.LeafletMouseEvent) => {
      waypoints.push(e.latlng);
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
        this.map.off('click', clickHandler);
        this.isDrawingRoute = false;
        this.createRoutingControl(waypoints);
        tempMarkers.forEach((marker) => this.map.removeLayer(marker));
        tempMarkers = [];
        waypoints = [];
      }
    };

    this.map.on('click', clickHandler);
  }

  /**
   * Creates and adds the Leaflet Routing Machine control.
   */
  private createRoutingControl(waypoints: L.LatLng[]): void {
    if (this.routingControl) {
      this.map.removeControl(this.routingControl);
    }

    const startIcon =
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23660BC2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg>';
    const endIcon =
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%231F75FE"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg>';

    this.routingControl = L.Routing.control({
      waypoints: waypoints,
      routeWhileDragging: true,
      showAlternatives: false,
      addWaypoints: false,
      fitSelectedRoutes: true,
      lineOptions: {
        styles: [{ color: '#660BC2', weight: 5, opacity: 0.7 }],
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

    this.routingControl.on('routesfound', (e: any) => {
      const routes = e.routes;
      if (routes && routes.length > 0) {
        const routeLine = routes[0].coordinates;
        const geojsonLine: GeoJSON.Feature = {
          type: 'Feature',
          properties: {
            type: 'route',
            name: 'Generated Route',
            style: { color: '#660BC2', weight: 5, opacity: 0.7 },
          },
          geometry: {
            type: 'LineString',
            coordinates: routeLine.map((latlng: L.LatLng) => [
              latlng.lng,
              latlng.lat,
            ]),
          },
        };
        const routeLayer = L.geoJSON(geojsonLine);
        this.drawnItems.addLayer(routeLayer);
        this.updateGeoJSON();
        this.snackBar.open('Route added!', 'Dismiss', { duration: 2000 });
      }
    });

    this.routingControl.on('routingerror', (e: any) => {
      console.error('Routing error:', e);
      this.snackBar.open(
        'Could not find a route. Please try different points.',
        'Dismiss',
        { duration: 3000 }
      );
      if (this.routingControl) {
        this.map.removeControl(this.routingControl);
        this.routingControl = null;
      }
    });
  }

  /**
   * Handles GeoJSON file import.
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
          this.clearMapLayers();
          this.loadGeoJSONToMap(geojson);
          this.updateGeoJSON();
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
      reader.readAsText(file);
    }
  }

  /**
   * Exports the current project's GeoJSON data.
   */
  exportGeoJSON(): void {
    this.projectService.activeProject$.subscribe((activeProject) => {
      if (activeProject && activeProject.geojson) {
        const geojsonString = JSON.stringify(activeProject.geojson, null, 2);
        const blob = new Blob([geojsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeProject.name || 'map_project'}.geojson`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
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