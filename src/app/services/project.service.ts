import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid'; // For unique project IDs

export interface MapProject {
  id: string;
  name: string;
  geojson: GeoJSON.FeatureCollection;
}

@Injectable({
  providedIn: 'root'
})
export class ProjectService {
  private projectsKey = 'mapProjects';
  private activeProjectKey = 'activeMapProjectId';

  private _projects = new BehaviorSubject<MapProject[]>([]);
  readonly projects$: Observable<MapProject[]> = this._projects.asObservable();

  private _activeProject = new BehaviorSubject<MapProject | null>(null);
  readonly activeProject$: Observable<MapProject | null> = this._activeProject.asObservable();

  constructor() {
    this.loadProjects();
    this.loadActiveProject();
  }

  /**
   * Loads all projects from localStorage.
   */
  private loadProjects(): void {
    const projectsJson = localStorage.getItem(this.projectsKey);
    if (projectsJson) {
      try {
        const projects: MapProject[] = JSON.parse(projectsJson);
        this._projects.next(projects);
      } catch (e) {
        console.error('Error parsing projects from localStorage', e);
        this._projects.next([]);
      }
    } else {
      this._projects.next([]);
    }
  }

  /**
   * Saves all projects to localStorage.
   */
  private saveProjects(): void {
    localStorage.setItem(this.projectsKey, JSON.stringify(this._projects.value));
  }

  /**
   * Loads the active project based on the stored active project ID.
   */
  private loadActiveProject(): void {
    const activeProjectId = localStorage.getItem(this.activeProjectKey);
    if (activeProjectId) {
      const project = this._projects.value.find(p => p.id === activeProjectId);
      if (project) {
        this._activeProject.next(project);
      } else {
        // If active project ID is invalid, clear it and select first project if available
        localStorage.removeItem(this.activeProjectKey);
        if (this._projects.value.length > 0) {
          this.selectProject(this._projects.value[0].id);
        }
      }
    } else if (this._projects.value.length > 0) {
      // If no active project, select the first one
      this.selectProject(this._projects.value[0].id);
    }
  }

  /**
   * Creates a new map project.
   * @param name The name of the new project.
   */
  createProject(name: string): void {
    const newProject: MapProject = {
      id: uuidv4(),
      name: name,
      geojson: {
        type: 'FeatureCollection',
        features: []
      }
    };
    const currentProjects = this._projects.value;
    this._projects.next([...currentProjects, newProject]);
    this.saveProjects();
    this.selectProject(newProject.id); // Automatically select the new project
  }

  /**
   * Selects an existing map project to make it active.
   * @param projectId The ID of the project to select.
   */
  selectProject(projectId: string): void {
    const project = this._projects.value.find(p => p.id === projectId);
    if (project) {
      this._activeProject.next(project);
      localStorage.setItem(this.activeProjectKey, projectId);
    } else {
      console.warn(`Project with ID ${projectId} not found.`);
    }
  }

  /**
   * Deletes a map project.
   * @param projectId The ID of the project to delete.
   */
  deleteProject(projectId: string): void {
    const currentProjects = this._projects.value.filter(p => p.id !== projectId);
    this._projects.next(currentProjects);
    this.saveProjects();

    // If the deleted project was the active one, clear active project or select another
    if (this._activeProject.value?.id === projectId) {
      localStorage.removeItem(this.activeProjectKey);
      this._activeProject.next(null);
      if (currentProjects.length > 0) {
        this.selectProject(currentProjects[0].id);
      }
    }
  }

  /**
   * Updates the GeoJSON data for the active project.
   * @param geojson The new GeoJSON FeatureCollection.
   */
  updateActiveProjectGeoJSON(geojson: GeoJSON.FeatureCollection): void {
    const activeProject = this._activeProject.value;
    if (activeProject) {
      // Create a new object for immutability to ensure change detection
      activeProject.geojson = JSON.parse(JSON.stringify(geojson));
      const updatedProjects = this._projects.value.map(p =>
        p.id === activeProject.id ? activeProject : p
      );
      this._projects.next(updatedProjects);
      this.saveProjects();
    }
  }

  /**
   * Renames a project.
   * @param projectId The ID of the project to rename.
   * @param newName The new name for the project.
   */
  renameProject(projectId: string, newName: string): void {
    const currentProjects = this._projects.value;
    const projectIndex = currentProjects.findIndex(p => p.id === projectId);

    if (projectIndex > -1) {
      // Create a new project object to ensure immutability and trigger change detection
      const updatedProject = { ...currentProjects[projectIndex], name: newName };
      currentProjects[projectIndex] = updatedProject;
      this._projects.next([...currentProjects]); // Emit new array to trigger change detection
      this.saveProjects();
      if (this._activeProject.value?.id === projectId) {
        this._activeProject.next(updatedProject); // Update active project if it was renamed
      }
    }
  }
}
