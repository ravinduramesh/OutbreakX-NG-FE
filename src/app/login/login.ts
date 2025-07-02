import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginComponent {
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);

  // Zoneless signals from AuthService
  readonly isLoading = this.authService.isLoading;
  readonly authError = this.authService.authError;

  async signInWithGoogle(): Promise<void> {
    try {
      await this.authService.signInWithGoogle();
      this.snackBar.open('Successfully signed in!', 'Dismiss', {
        duration: 3000,
        panelClass: ['success-snackbar']
      });
    } catch (error: any) {
      console.error('Login error:', error);
      // Error is already handled by AuthService and displayed via signal
      // Just show a snackbar for additional feedback
      this.snackBar.open(
        'Failed to sign in. Please try again.',
        'Dismiss',
        {
          duration: 5000,
          panelClass: ['error-snackbar']
        }
      );
    }
  }

  clearError(): void {
    this.authService.clearAuthError();
  }
}