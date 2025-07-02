import { Routes } from '@angular/router';

import { MapComponent } from './map/map';
import { LoginComponent } from './login/login';
import { authGuard, loginGuard } from './guards/auth.guard';

export const routes: Routes = [
  { 
    path: 'login', 
    component: LoginComponent,
    canActivate: [loginGuard]
  },
  { 
    path: '', 
    component: MapComponent,
    canActivate: [authGuard]
  },
  { 
    path: '**', 
    redirectTo: 'login' 
  }
];