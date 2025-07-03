import { Injectable, inject, signal, computed } from '@angular/core';
import { Auth, GoogleAuthProvider, signInWithPopup, signOut, authState, User } from '@angular/fire/auth';
import { Firestore, doc, setDoc, getDoc, serverTimestamp } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { Observable, from, switchMap, of, catchError, EMPTY } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: any;
  lastLoginAt: any;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private router = inject(Router);

  // Zoneless signals for reactive state management
  private _isLoading = signal<boolean>(true);
  private _userProfile = signal<UserProfile | null>(null);
  private _authError = signal<string | null>(null);

  // Convert Firebase auth state to signal
  private authUser = toSignal(authState(this.auth), { initialValue: undefined });

  // Computed signals for reactive state
  public readonly isLoading = this._isLoading.asReadonly();
  public readonly userProfile = this._userProfile.asReadonly();
  public readonly authError = this._authError.asReadonly();
  public readonly isAuthenticated = computed(() => this.authUser() !== null && this.authUser() !== undefined);
  public readonly currentUser = computed(() => this.authUser());

  // Observable versions for compatibility
  public readonly currentUser$: Observable<User | null> = authState(this.auth);
  public readonly userProfile$: Observable<UserProfile | null> = this.currentUser$.pipe(
    switchMap(user => {
      if (user) {
        return this.loadUserProfileObservable(user);
      } else {
        this._userProfile.set(null);
        return of(null);
      }
    }),
    catchError(error => {
      console.error('Error in userProfile$ stream:', error);
      this._authError.set(error.message);
      return of(null);
    })
  );

  constructor() {
    // Initialize auth state monitoring
    this.initializeAuthState();
  }

  private initializeAuthState(): void {
    // Monitor auth state changes and update user profile
    this.currentUser$.subscribe(async (user) => {
      this._isLoading.set(true);
      this._authError.set(null);

      try {
        if (user) {
          await this.loadUserProfile(user);
        } else {
          this._userProfile.set(null);
        }
      } catch (error: any) {
        console.error('Error handling auth state change:', error);
        this._authError.set(error.message);
      } finally {
        this._isLoading.set(false);
      }
    });
  }

  /**
   * Sign in with Google using popup
   */
  async signInWithGoogle(): Promise<void> {
    try {
      this._isLoading.set(true);
      this._authError.set(null);

      const provider = new GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');

      // Configure provider for better UX
      provider.setCustomParameters({
        prompt: 'select_account'
      });

      const result = await signInWithPopup(this.auth, provider);

      if (result.user) {
        await this.createOrUpdateUserProfile(result.user);
        this.router.navigate(['/map']);
      }
    } catch (error: any) {
      console.error('Error signing in with Google:', error);
      this._authError.set(error.message);
      throw error;
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Sign out the current user
   */
  async signOut(): Promise<void> {
    try {
      this._isLoading.set(true);
      this._authError.set(null);

      await signOut(this.auth);
      this._userProfile.set(null);
      this.router.navigate(['/login']);
    } catch (error: any) {
      console.error('Error signing out:', error);
      this._authError.set(error.message);
      throw error;
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Create or update user profile in Firestore
   */
  private async createOrUpdateUserProfile(user: User): Promise<void> {
    const userRef = doc(this.firestore, 'users', user.uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      // Create new user profile
      const userProfile: UserProfile = {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        photoURL: user.photoURL || undefined,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp()
      };

      await setDoc(userRef, userProfile);
      this._userProfile.set({
        ...userProfile,
        createdAt: new Date(),
        lastLoginAt: new Date()
      });
    } else {
      // Update existing user profile
      const existingProfile = userDoc.data() as UserProfile;
      const updatedProfile: Partial<UserProfile> = {
        email: user.email || existingProfile.email,
        displayName: user.displayName || existingProfile.displayName,
        photoURL: user.photoURL || existingProfile.photoURL,
        lastLoginAt: serverTimestamp()
      };

      await setDoc(userRef, updatedProfile, { merge: true });
      this._userProfile.set({
        ...existingProfile,
        ...updatedProfile,
        lastLoginAt: new Date()
      });
    }
  }

  /**
   * Load user profile from Firestore (signal version)
   */
  private async loadUserProfile(user: User): Promise<void> {
    try {
      const userRef = doc(this.firestore, 'users', user.uid);
      const userDoc = await getDoc(userRef);

      if (userDoc.exists()) {
        const profile = userDoc.data() as UserProfile;
        // Convert Firestore timestamps to dates for local use
        const profileWithDates = {
          ...profile,
          createdAt: profile.createdAt?.toDate?.() || new Date(),
          lastLoginAt: profile.lastLoginAt?.toDate?.() || new Date()
        };
        this._userProfile.set(profileWithDates);
      } else {
        // If profile doesn't exist, create it
        await this.createOrUpdateUserProfile(user);
      }
    } catch (error: any) {
      console.error('Error loading user profile:', error);
      this._authError.set(error.message);
      throw error;
    }
  }

  /**
   * Load user profile from Firestore (observable version for compatibility)
   */
  private loadUserProfileObservable(user: User): Observable<UserProfile | null> {
    return from(this.loadUserProfile(user)).pipe(
      switchMap(() => of(this._userProfile())),
      catchError(error => {
        console.error('Error loading user profile:', error);
        return of(null);
      })
    );
  }

  /**
   * Clear auth error
   */
  clearAuthError(): void {
    this._authError.set(null);
  }

  /**
   * Get current user (legacy compatibility)
   */
  get currentUserValue(): User | null | undefined {
    return this.currentUser();
  }

  /**
   * Get current user profile (legacy compatibility)
   */
  get userProfileValue(): UserProfile | null {
    return this.userProfile();
  }

  /**
   * Check if user is authenticated (legacy compatibility)
   */
  get isAuthenticatedValue(): boolean {
    return this.isAuthenticated();
  }
}
