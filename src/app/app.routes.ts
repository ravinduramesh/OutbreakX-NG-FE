import { Routes } from '@angular/router';
import { MapComponent } from './map/map';

export const routes: Routes = [
  { path: '', component: MapComponent },
  { path: '**', redirectTo: '' } // Redirect any unknown paths to the map
];