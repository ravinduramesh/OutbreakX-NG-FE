import { Injectable, inject, signal, computed } from '@angular/core';
import { 
  Firestore, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  Timestamp 
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { Observable, BehaviorSubject, combineLatest } from 'rxjs';
import { map, switchMap, startWith } from 'rxjs/operators';

export interface MapProject {
  id: string;
  name: string;
  geojson: GeoJSON.FeatureCollection;
  ownerId: string;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

@Injectable({
  providedIn: 'root'
})
export class ProjectService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  // Signals for reactive state management
  private _projects = signal<MapProject[]>([]);
  private _activeProjectId = signal<string | null>(null);
  private _isLoading = signal<boolean>(false);
  private _error = signal<string | null>(null);

  // Computed signals
  public readonly projects = this._projects.asReadonly();
  public readonly activeProjectId = this._activeProjectId.asReadonly();
  public readonly isLoading = this._isLoading.asReadonly();
  public readonly error = this._error.asReadonly();
  
  public readonly activeProject = computed(() => {
    const projects = this._projects();
    const activeId = this._activeProjectId();
    return projects.find(p => p.id === activeId) || null;
  });

  // Observable versions for compatibility
  public readonly projects$: Observable<MapProject[]> = this.authService.currentUser$.pipe(
    switchMap(user => {
      if (!user) {
        this._projects.set([]);
        return new Observable<MapProject[]>(subscriber => subscriber.next([]));
      }
      return this.getUserProjects(user.uid);
    })
  );

  public readonly activeProject$: Observable<MapProject | null> = combineLatest([
    this.projects$,
    new BehaviorSubject(this._activeProjectId()).pipe(
      switchMap(() => new Observable(subscriber => {
        const unsubscribe = () => {};
        subscriber.next(this._activeProjectId());
        return unsubscribe;
      }))
    )
  ]).pipe(
    map(([projects, activeId]) => {
      return projects.find(p => p.id === activeId) || null;
    })
  );

  constructor() {
    this.initializeProjectsListener();
  }

  /**
   * Initialize real-time listener for user's projects
   */
  private initializeProjectsListener(): void {
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.setupProjectsListener(user.uid);
      } else {
        this._projects.set([]);
        this._activeProjectId.set(null);
      }
    });
  }

  /**
   * Set up real-time listener for user's projects
   */
  private setupProjectsListener(userId: string): void {
    this._isLoading.set(true);
    this._error.set(null);

    const projectsRef = collection(this.firestore, 'projects');
    const q = query(
      projectsRef,
      where('ownerId', '==', userId),
      orderBy('updatedAt', 'desc')
    );

    onSnapshot(q, 
      (snapshot) => {
        const projects: MapProject[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          projects.push({
            id: doc.id,
            name: data['name'],
            geojson: data['geojson'] || { type: 'FeatureCollection', features: [] },
            ownerId: data['ownerId'],
            createdAt: data['createdAt'],
            updatedAt: data['updatedAt']
          });
        });
        
        this._projects.set(projects);
        this._isLoading.set(false);

        // Auto-select first project if none is selected
        if (projects.length > 0 && !this._activeProjectId()) {
          this._activeProjectId.set(projects[0].id);
        } else if (projects.length === 0) {
          this._activeProjectId.set(null);
        }
      },
      (error) => {
        console.error('Error listening to projects:', error);
        this._error.set(error.message);
        this._isLoading.set(false);
      }
    );
  }

  /**
   * Get user's projects as Observable
   */
  private getUserProjects(userId: string): Observable<MapProject[]> {
    return new Observable<MapProject[]>(subscriber => {
      const projectsRef = collection(this.firestore, 'projects');
      const q = query(
        projectsRef,
        where('ownerId', '==', userId),
        orderBy('updatedAt', 'desc')
      );

      const unsubscribe = onSnapshot(q, 
        (snapshot) => {
          const projects: MapProject[] = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            projects.push({
              id: doc.id,
              name: data['name'],
              geojson: data['geojson'] || { type: 'FeatureCollection', features: [] },
              ownerId: data['ownerId'],
              createdAt: data['createdAt'],
              updatedAt: data['updatedAt']
            });
          });
          subscriber.next(projects);
        },
        (error) => {
          subscriber.error(error);
        }
      );

      return () => unsubscribe();
    });
  }

  /**
   * Create a new map project
   */
  async createProject(name: string): Promise<void> {
    const user = this.authService.currentUserValue;
    if (!user) {
      throw new Error('User must be authenticated to create projects');
    }

    try {
      this._isLoading.set(true);
      this._error.set(null);

      const projectData = {
        name: name,
        geojson: {
          type: 'FeatureCollection' as const,
          features: []
        },
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const projectsRef = collection(this.firestore, 'projects');
      const docRef = await addDoc(projectsRef, projectData);
      
      // Auto-select the newly created project
      this._activeProjectId.set(docRef.id);
    } catch (error: any) {
      console.error('Error creating project:', error);
      this._error.set(error.message);
      throw error;
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Select a project to make it active
   */
  selectProject(projectId: string): void {
    const projects = this._projects();
    const project = projects.find(p => p.id === projectId);
    if (project) {
      this._activeProjectId.set(projectId);
    } else {
      console.warn(`Project with ID ${projectId} not found.`);
    }
  }

  /**
   * Delete a project
   */
  async deleteProject(projectId: string): Promise<void> {
    const user = this.authService.currentUserValue;
    if (!user) {
      throw new Error('User must be authenticated to delete projects');
    }

    try {
      this._isLoading.set(true);
      this._error.set(null);

      // Verify ownership before deletion
      const projects = this._projects();
      const project = projects.find(p => p.id === projectId);
      if (!project || project.ownerId !== user.uid) {
        throw new Error('Project not found or access denied');
      }

      const projectRef = doc(this.firestore, 'projects', projectId);
      await deleteDoc(projectRef);

      // If the deleted project was active, clear active project
      if (this._activeProjectId() === projectId) {
        this._activeProjectId.set(null);
        // Auto-select first remaining project if any
        const remainingProjects = projects.filter(p => p.id !== projectId);
        if (remainingProjects.length > 0) {
          this._activeProjectId.set(remainingProjects[0].id);
        }
      }
    } catch (error: any) {
      console.error('Error deleting project:', error);
      this._error.set(error.message);
      throw error;
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Update project's GeoJSON data
   */
  async updateActiveProjectGeoJSON(geojson: GeoJSON.FeatureCollection): Promise<void> {
    const activeProjectId = this._activeProjectId();
    if (!activeProjectId) {
      console.warn('No active project to update');
      return;
    }

    const user = this.authService.currentUserValue;
    if (!user) {
      throw new Error('User must be authenticated to update projects');
    }

    try {
      const projectRef = doc(this.firestore, 'projects', activeProjectId);
      await updateDoc(projectRef, {
        geojson: geojson,
        updatedAt: serverTimestamp()
      });
    } catch (error: any) {
      console.error('Error updating project GeoJSON:', error);
      this._error.set(error.message);
      throw error;
    }
  }

  /**
   * Rename a project
   */
  async renameProject(projectId: string, newName: string): Promise<void> {
    const user = this.authService.currentUserValue;
    if (!user) {
      throw new Error('User must be authenticated to rename projects');
    }

    try {
      this._isLoading.set(true);
      this._error.set(null);

      // Verify ownership before renaming
      const projects = this._projects();
      const project = projects.find(p => p.id === projectId);
      if (!project || project.ownerId !== user.uid) {
        throw new Error('Project not found or access denied');
      }

      const projectRef = doc(this.firestore, 'projects', projectId);
      await updateDoc(projectRef, {
        name: newName,
        updatedAt: serverTimestamp()
      });
    } catch (error: any) {
      console.error('Error renaming project:', error);
      this._error.set(error.message);
      throw error;
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Get active project data (legacy compatibility)
   */
  getActiveProjectData(): MapProject | null {
    return this.activeProject();
  }

  /**
   * Clear any errors
   */
  clearError(): void {
    this._error.set(null);
  }
}