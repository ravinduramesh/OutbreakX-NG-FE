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

  private initializeMap(): void {
    this.map = L.map(this.mapContainer.nativeElement, {
      center: [51.505, -0.09],
      zoom: 13,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.map);

    this.drawnItems = new L.FeatureGroup().addTo(this.map);
  }

  private setupDrawingControls(): void {
    this.drawControl = new L.Control.Draw({
      edit: {
        featureGroup: this.drawnItems,
        remove: true,
      },
      draw: {
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
        rectangle: false,
        circlemarker: false,
      },
    });

    this.map.addControl(this.drawControl);

    this.map.on(L.Draw.Event.CREATED, (event) => {
      const layer = (event as L.DrawEvents.Created).layer;
      this.drawnItems.addLayer(layer);
      this.updateGeoJSON();
      this.snackBar.open('Feature added!', 'Dismiss', { duration: 2000 });
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

  private subscribeToActiveProject(): void {
    this.activeProjectSubscription = this.projectService.activeProject$.subscribe(
      (project) => {
        this.clearMapLayers();
        if (project) {
          this.currentProjectGeoJSON = JSON.parse(JSON.stringify(project.geojson));
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
      }
    );
  }

  private clearMapLayers(): void {
    this.drawnItems.clearLayers();
    if (this.routingControl) {
      this.map.removeControl(this.routingControl);
      this.routingControl = null;
    }
  }

  private loadGeoJSONToMap(geojson: GeoJSON.FeatureCollection): void {
    if (!geojson || !geojson.features) {
      return;
    }
    geojson.features.forEach((feature) => {
      if (feature.properties?.type === 'route') {
        // Handle route features
        const coordinates = (feature.geometry as GeoJSON.LineString).coordinates;
        const waypoints = coordinates.map((coord) =>
          L.latLng(coord[1], coord[0])
        );
        if (waypoints.length >= 2) {
          // Create route with first and last points
          this.createRoutingControl([waypoints[0], waypoints[waypoints.length - 1]], feature);
        }
      } else {
        // Handle other features
        const layer = geoJSONToLayer(feature);
        if (layer) {
          this.drawnItems.addLayer(layer);
        }
      }
    });
  }

  private updateGeoJSON(): void {
    const features: GeoJSON.Feature[] = [];
    this.drawnItems.eachLayer((layer: L.Layer) => {
      const feature = layerToGeoJSON(layer);
      if (feature) {
        features.push(feature);
      }
    });

    // Add active route if exists
    if (this.routingControl) {
      const currentRoute = this.routingControl.getWaypoints();
      if (currentRoute && currentRoute.length >= 2 && currentRoute[0].latLng && currentRoute[1].latLng) {
        const routeFeature: GeoJSON.Feature = {
          type: 'Feature',
          properties: {
            type: 'route',
            style: { color: '#660BC2', weight: 5, opacity: 0.7 },
          },
          geometry: {
            type: 'LineString',
            coordinates: [
              [currentRoute[0].latLng.lng, currentRoute[0].latLng.lat],
              [currentRoute[1].latLng.lng, currentRoute[1].latLng.lat],
            ],
          },
        };
        features.push(routeFeature);
      }
    }

    this.currentProjectGeoJSON = {
      type: 'FeatureCollection',
      features: features,
    };
    this.projectService.updateActiveProjectGeoJSON(this.currentProjectGeoJSON);
  }

  drawRoute(): void {
    this.isDrawingRoute = true;
    this.snackBar.open('Click two points on the map to define a route.', 'Dismiss', {
      duration: 5000,
    });

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

  private createRoutingControl(waypoints: L.LatLng[], existingFeature?: GeoJSON.Feature): void {
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
        this.updateGeoJSON();
        if (!existingFeature) {
          this.snackBar.open('Route added!', 'Dismiss', { duration: 2000 });
        }
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