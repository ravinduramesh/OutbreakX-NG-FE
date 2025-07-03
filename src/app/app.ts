import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ViewChild } from '@angular/core';

import { MapComponent } from './map/map';
import { ProjectService, MapProject } from './services/project.service';
import { AuthService } from './services/auth.service';
import { Observable } from 'rxjs';

/**
 * Dialog component for creating or renaming projects.
 * This component is standalone and imports necessary Angular Material modules.
 */
@Component({
  selector: 'app-project-dialog',
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <div mat-dialog-content>
      <mat-form-field appearance="outline">
        <mat-label>Project Name</mat-label>
        <input matInput [(ngModel)]="projectName" cdkFocusInitial>
      </mat-form-field>
    </div>
    <div mat-dialog-actions class="dialog-actions">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button mat-flat-button color="primary" [mat-dialog-close]="projectName" [disabled]="!projectName">
        {{ data.actionButtonText }}
      </button>
    </div>
  `,
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    FormsModule
  ]
})
export class ProjectDialogComponent {
  projectName: string = '';

  constructor(
    public dialogRef: MatDialogRef<ProjectDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { title: string, actionButtonText: string, currentName?: string }
  ) {
    this.projectName = this.data.currentName || '';
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}

/**
 * Main application component responsible for layout, project management UI,
 * and integrating the map component.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    MapComponent,
    MatSidenavModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatCardModule,
    FormsModule,
    MatInputModule,
    MatFormFieldModule,
    MatTooltipModule,
    MatMenuModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class AppComponent implements OnInit {
  title = 'OutbreakX Map System';
  projects$: Observable<MapProject[]>;
  activeProject$: Observable<MapProject | null>;

  /**
   * Toggles the sidenav state and invalidates the map size to adjust for the new layout.
   * The sidenav is opened by default.
   */
  @ViewChild(MapComponent) mapComponent?: MapComponent;
  set sidenavOpened(value: boolean) {
    this._sidenavOpened = value;
    setTimeout(() => {
      this.mapComponent?.invalidateMapSize();
    }, 300); // Delay to allow sidenav animation to finish
  }
  get sidenavOpened(): boolean {
    return this._sidenavOpened;
  }
  private _sidenavOpened = true;

  constructor(
    private projectService: ProjectService,
    public authService: AuthService,
    public dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {
    this.projects$ = this.projectService.projects$;
    this.activeProject$ = this.projectService.activeProject$;
  }

  ngOnInit(): void {
    // Projects are automatically loaded when user is authenticated via ProjectService
    // Auto-create first project if user has no projects
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.projects$.subscribe(projects => {
          if (projects.length === 0) {
            this.createFirstProject();
          }
        });
      }
    });
  }

  /**
   * Creates the first project for new users
   */
  private async createFirstProject(): Promise<void> {
    try {
      await this.projectService.createProject('My First Project');
    } catch (error) {
      console.error('Error creating first project:', error);
      this.snackBar.open('Error creating first project', 'Dismiss', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    }
  }

  /**
   * Signs out the current user
   */
  async signOut(): Promise<void> {
    try {
      await this.authService.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
      this.snackBar.open('Error signing out', 'Dismiss', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    }
  }

  /**
   * Opens a dialog to create a new project.
   */
  openCreateProjectDialog(): void {
    const dialogRef = this.dialog.open(ProjectDialogComponent, {
      width: '300px',
      data: { title: 'Create New Project', actionButtonText: 'Create' }
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result) {
        try {
          await this.projectService.createProject(result);
          this.snackBar.open('Project created successfully!', 'Dismiss', {
            duration: 2000,
            panelClass: ['success-snackbar']
          });
        } catch (error) {
          console.error('Error creating project:', error);
          this.snackBar.open('Error creating project', 'Dismiss', {
            duration: 3000,
            panelClass: ['error-snackbar']
          });
        }
      }
    });
  }

  /**
   * Selects a project to make it active.
   * @param projectId The ID of the project to select.
   */
  selectProject(projectId: string): void {
    this.projectService.selectProject(projectId);
  }

  /**
   * Opens a dialog to rename a project.
   * @param project The project to rename.
   * @param event The click event to stop propagation.
   */
  openRenameProjectDialog(project: MapProject, event: Event): void {
    event.stopPropagation(); // Prevent selecting the project when clicking rename
    const dialogRef = this.dialog.open(ProjectDialogComponent, {
      width: '300px',
      data: { title: 'Rename Project', actionButtonText: 'Rename', currentName: project.name }
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result && result !== project.name) {
        try {
          await this.projectService.renameProject(project.id, result);
          this.snackBar.open('Project renamed successfully!', 'Dismiss', {
            duration: 2000,
            panelClass: ['success-snackbar']
          });
        } catch (error) {
          console.error('Error renaming project:', error);
          this.snackBar.open('Error renaming project', 'Dismiss', {
            duration: 3000,
            panelClass: ['error-snackbar']
          });
        }
      }
    });
  }

  /**
   * Deletes a project.
   * @param projectId The ID of the project to delete.
   * @param event The click event to stop propagation.
   */
  async deleteProject(projectId: string, event: Event): Promise<void> {
    event.stopPropagation(); // Prevent selecting the project when clicking delete
    if (confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      try {
        await this.projectService.deleteProject(projectId);
        this.snackBar.open('Project deleted successfully!', 'Dismiss', {
          duration: 2000,
          panelClass: ['success-snackbar']
        });
      } catch (error) {
        console.error('Error deleting project:', error);
        this.snackBar.open('Error deleting project', 'Dismiss', {
          duration: 3000,
          panelClass: ['error-snackbar']
        });
      }
    }
  }
}