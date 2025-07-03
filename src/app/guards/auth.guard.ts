import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { map, take, filter } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

export const authGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait for auth state to be determined, then check if user is authenticated
  return authService.currentUser$.pipe(
    filter(user => user !== undefined), // Wait until auth state is determined
    take(1),
    map(user => {
      if (user) {
        return true;
      } else {
        router.navigate(['/login']);
        return false;
      }
    })
  );
};

export const loginGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Wait for auth state to be determined, then redirect if already authenticated
  return authService.currentUser$.pipe(
    filter(user => user !== undefined), // Wait until auth state is determined
    take(1),
    map(user => {
      if (user) {
        router.navigate(['/map']);
        return false;
      } else {
        return true;
      }
    })
  );
};