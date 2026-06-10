import { DatePipe } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, Component, ViewChild, inject } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { CardModule } from 'primeng/card';
import { DividerModule } from 'primeng/divider';
import { ButtonModule } from 'primeng/button';
import { RadioButtonModule } from 'primeng/radiobutton';
import { SliderModule } from 'primeng/slider';
import { ToastModule } from 'primeng/toast';
import {
  MARKER_SHAPES,
  MAX_PLANS,
  MarkerShape,
  RouteEvent,
  RouteWaypoint,
  VehicleSimulationState,
  WaypointAddedEvent,
} from '../../models/plan.model';
import { findRouteIntersections } from '../../utils/route-intersection.util';
import { PlanApiService, PlanRecord, TimelineSettings } from '../../services/plan-api.service';
import { OpDashPlanInput } from '../../utils/plan-fuel.util';
import {
  missionTimeFromSliderValue,
  sliderValueFromMissionTime,
} from '../../utils/plan-timeline.util';
import {
  snapToNearestEventProgress,
  snapToPreviousEventProgress,
} from '../../utils/simulation-event.util';
import { AerialDeviceMapComponent } from './aerial-device-map/aerial-device-map.component';
import { OpDashPanelComponent } from './op-dash-panel/op-dash-panel.component';
import { PlanPanelComponent } from './plan-panel/plan-panel.component';

type PlaybackMode = 'event' | 'time';
type SidebarPanel = 'plan' | 'deploy' | 'opDash';

@Component({
  selector: 'app-dashboard',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    CardModule,
    DividerModule,
    ButtonModule,
    RadioButtonModule,
    SliderModule,
    ToastModule,
    AerialDeviceMapComponent,
    PlanPanelComponent,
    OpDashPanelComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.Default,
})
export class DashboardComponent implements AfterViewInit {
  @ViewChild(AerialDeviceMapComponent) private readonly aerialDeviceMap?: AerialDeviceMapComponent;

  private readonly datePipe = new DatePipe('en-US');
  private readonly messageService = inject(MessageService);
  private readonly fb = inject(FormBuilder);
  private readonly planApi = inject(PlanApiService);

  readonly maxPlans = MAX_PLANS;

  readonly planDraftForm = this.fb.group({
    planeName: ['', Validators.required],
    speed: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
    startingDate: this.fb.control<Date | null>(null, Validators.required),
  });

  readonly savedPlans = this.fb.array<FormGroup>([]);

  isRunning = false;
  isPaused = false;
  simulationComplete = false;
  playbackMode: PlaybackMode = 'event';
  activePanel: SidebarPanel | null = null;
  timelineValue = 0;
  timelineSteps: number[] = [0, 100];
  routeSelectionActive = false;
  draftWaypointCount = 0;
  vehicleStates: VehicleSimulationState[] = [];
  opDashPlans: OpDashPlanInput[] = [];
  opDashRouteEvents: RouteEvent[] = [];
  selectedOpDashPlanStartingTime: string | null = null;
  timelineStartTime: Date | null = null;
  timelineEndTime: Date | null = null;

  private syncingTimelineFromSimulation = false;
  private manualTimelineScrub = false;

  get savedPlanKeys(): string[] {
    return this.savedPlans.controls.map((plan) => plan.get('key')?.value as string);
  }

  get isFinishDisabled(): boolean {
    return (
      this.planDraftForm.invalid ||
      this.draftWaypointCount === 0 ||
      this.savedPlans.length >= MAX_PLANS
    );
  }

  get canPlaySimulation(): boolean {
    return (
      this.vehicleStates.length > 0 &&
      !this.isRunning &&
      !this.isPaused &&
      !this.simulationComplete
    );
  }

  get canPauseSimulation(): boolean {
    return this.isRunning;
  }

  get canResumeSimulation(): boolean {
    return this.isPaused && !this.isRunning;
  }

  get canStopSimulation(): boolean {
    return this.isRunning || this.isPaused || this.vehicleStates.length > 0;
  }

  get isTimelineInteractive(): boolean {
    return this.vehicleStates.length > 0 && this.timelineStartTime != null && this.timelineEndTime != null;
  }

  get currentTime(): string {
    if (!this.timelineStartTime || !this.timelineEndTime) {
      return '—';
    }

    const missionTime = missionTimeFromSliderValue(
      this.timelineValue,
      this.timelineStartTime,
      this.timelineEndTime
    );
    return this.formatTimelineTime(missionTime);
  }

  get timelineStartLabel(): string {
    return this.formatTimelineTime(this.timelineStartTime);
  }

  get timelineEndLabel(): string {
    return this.formatTimelineTime(this.timelineEndTime);
  }

  ngAfterViewInit(): void {
    this.loadPlansFromDb();
  }

  onSidebarSelect(panel: SidebarPanel): void {
    this.activePanel = this.activePanel === panel ? null : panel;

    if (this.activePanel === 'opDash') {
      this.loadOpDashFromDb();
    } else {
      this.selectedOpDashPlanStartingTime = null;
    }

    if (this.activePanel !== 'plan') {
      this.routeSelectionActive = false;
    }

    if (this.activePanel !== 'deploy') {
      this.aerialDeviceMap?.clearDeploySelection();
    }
  }

  onStartMapRoute(): void {
    if (this.savedPlans.length >= MAX_PLANS) {
      return;
    }

    this.routeSelectionActive = true;
    this.messageService.add({
      severity: 'info',
      summary: 'Map route',
      detail: 'Click on the map to add waypoints.',
      life: 5000,
    });
  }

  onWaypointAdded(payload: WaypointAddedEvent): void {
    this.draftWaypointCount = payload.count;
  }

  onFinishPlan(): void {
    if (this.isFinishDisabled || !this.aerialDeviceMap) {
      return;
    }

    const planNumber = this.savedPlans.length + 1;
    const planKey = `plan${planNumber}`;
    const { planeName, speed, startingDate } = this.planDraftForm.getRawValue();
    const routeSegment = this.aerialDeviceMap.commitDraftRoute(planKey);

    this.planApi
      .createPlan({
        planeName: planeName as string,
        speed: Number(speed),
        startingDate: (startingDate as Date).toISOString(),
        route: routeSegment.map(([longitude, latitude]) => ({ longitude, latitude })),
      })
      .subscribe({
        next: (plan) => {
          if (plan.key !== planKey) {
            this.aerialDeviceMap?.removeSavedRoute(planKey);
            this.aerialDeviceMap?.restoreSavedRoute(plan.key, plan.route, this.savedPlans.length);
          }

          this.savedPlans.push(this.createPlanFormGroup(plan));
          this.syncRouteEvents();

          this.aerialDeviceMap?.startPlanSimulation({
            planKey: plan.key,
            speed: plan.speed,
            shape: plan.markerShape ?? MARKER_SHAPES[this.savedPlans.length - 1],
            route: plan.route,
            startingDate: new Date(plan.startingDate),
          });

          this.simulationComplete = false;
          this.timelineSteps = this.aerialDeviceMap?.getTimelineEventSteps() ?? [0, 100];
          this.loadTimelineSettings();

          this.planDraftForm.reset();
          this.routeSelectionActive = false;
          this.draftWaypointCount = 0;

          const detail =
            this.savedPlans.length >= MAX_PLANS
              ? `${plan.key} saved. Press Play to start all markers.`
              : `${plan.key} saved. Press Play to start markers, or create up to ${MAX_PLANS - this.savedPlans.length} more plan(s).`;

          this.messageService.add({ severity: 'success', summary: 'Plan saved', detail, life: 4000 });
        },
        error: () => {
          this.aerialDeviceMap?.removeSavedRoute(planKey);
          this.messageService.add({
            severity: 'error',
            summary: 'Save failed',
            detail: 'Could not save plan to database. Check that the backend is running.',
            life: 5000,
          });
        },
      });
  }

  onPlay(): void {
    this.aerialDeviceMap?.startSimulation(this.playbackMode);
    this.isRunning = true;
    this.isPaused = false;
    this.simulationComplete = false;
  }

  onPause(): void {
    this.aerialDeviceMap?.pauseSimulation(this.playbackMode === 'event');
    this.isRunning = false;
    this.isPaused = true;
  }

  onResume(): void {
    this.aerialDeviceMap?.resumeSimulation();
    this.isRunning = true;
    this.isPaused = false;
  }

  onStop(): void {
    this.aerialDeviceMap?.resetSimulation();
    this.isRunning = false;
    this.isPaused = false;
    this.simulationComplete = false;
    this.timelineValue = 0;
    this.timelineSteps = [0, 100];
  }

  onClearAllRoutes(): void {
    this.planApi.clearPlans().subscribe({
      next: () => this.resetLocalPlanState(),
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Clear failed',
          detail: 'Could not clear plans from database.',
          life: 5000,
        });
      },
    });
  }

  private resetLocalPlanState(): void {
    this.aerialDeviceMap?.clearAllRoutes();

    this.savedPlans.clear();
    this.planDraftForm.reset();
    this.routeSelectionActive = false;
    this.draftWaypointCount = 0;
    this.vehicleStates = [];
    this.opDashPlans = [];
    this.opDashRouteEvents = [];
    this.selectedOpDashPlanStartingTime = null;
    this.isRunning = false;
    this.isPaused = false;
    this.simulationComplete = false;
    this.timelineValue = 0;
    this.timelineSteps = [0, 100];
    this.timelineStartTime = null;
    this.timelineEndTime = null;
    this.aerialDeviceMap?.setTimelineBounds(null, null);

    this.messageService.add({
      severity: 'info',
      summary: 'Routes cleared',
      detail: 'All routes and plan form data have been reset.',
      life: 4000,
    });
  }

  onSimulationStateChange(states: VehicleSimulationState[]): void {
    this.vehicleStates = states;
    this.syncTimelineFromSimulation(states);
  }

  onMissionTimeChange(missionTimeMs: number): void {
    if (!this.timelineStartTime || !this.timelineEndTime || this.syncingTimelineFromSimulation) {
      return;
    }

    const nextValue = sliderValueFromMissionTime(
      new Date(missionTimeMs),
      this.timelineStartTime,
      this.timelineEndTime
    );

    if (nextValue === this.timelineValue) {
      return;
    }

    this.syncingTimelineFromSimulation = true;
    this.timelineValue = nextValue;
    this.syncingTimelineFromSimulation = false;
  }

  onSimulationFinished(): void {
    this.isRunning = false;
    this.isPaused = false;
    this.simulationComplete = true;
    this.syncTimelineFromSimulation(this.vehicleStates);
    this.messageService.add({
      severity: 'info',
      summary: 'Simulation finished',
      detail: 'All markers stopped (route complete or fuel depleted).',
      life: 4000,
    });
  }

  shapeLabel(shape: MarkerShape): string {
    return shape.charAt(0).toUpperCase() + shape.slice(1);
  }

  onOpDashPlanSelect(event: {
    planKey: string;
    planeName: string;
    startingDate: Date | null;
  }): void {
    this.selectedOpDashPlanStartingTime = event.startingDate
      ? this.datePipe.transform(event.startingDate, 'medium') ?? null
      : null;
  }

  zoomTimeline(delta: number): void {
    if (!this.isTimelineInteractive) {
      return;
    }

    this.pauseSimulationForTimelineScrub();
    this.manualTimelineScrub = true;
    this.applyTimelineChange(Math.min(100, Math.max(0, this.timelineValue + delta)));
    this.manualTimelineScrub = false;
  }

  onTimelineChange(value: number): void {
    if (!this.isTimelineInteractive || this.syncingTimelineFromSimulation) {
      return;
    }

    this.pauseSimulationForTimelineScrub();
    this.manualTimelineScrub = true;
    this.applyTimelineChange(value);
    this.manualTimelineScrub = false;
  }

  private syncRouteEvents(): void {
    const intersections = findRouteIntersections(
      this.savedPlans.controls.map((plan) => ({
        planKey: plan.get('key')?.value as string,
        route: this.getPlanRoute(plan),
      }))
    );

    this.opDashRouteEvents = intersections;
    this.opDashPlans = this.savedPlans.controls.map((plan) => ({
      key: plan.get('key')?.value as string,
      planeName: plan.get('planeName')?.value as string,
      speed: Number(plan.get('speed')?.value),
      route: this.getPlanRoute(plan),
      startingDate: plan.get('startingDate')?.value as Date,
    }));

    this.aerialDeviceMap?.setRouteEvents(intersections);
  }

  private loadPlansFromDb(): void {
    this.planApi.listPlans().subscribe({
      next: (plans) => this.applyPlansFromApi(plans),
      error: () => {
        this.messageService.add({
          severity: 'warn',
          summary: 'Plans not loaded',
          detail: 'Could not load saved plans from database.',
          life: 4000,
        });
      },
    });
  }

  private loadOpDashFromDb(): void {
    this.planApi.getDashboard().subscribe({
      next: (dashboard) => {
        this.opDashPlans = dashboard.plans.map((plan) => ({
          key: plan.key,
          planeName: plan.planeName,
          speed: plan.speed,
          route: plan.route,
          startingDate: plan.startingDate,
        }));
        this.opDashRouteEvents = this.planApi.toRouteEvents(dashboard.routeEvents);
        this.applyTimelineSettings(dashboard.timeline);
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Dashboard unavailable',
          detail: 'Could not load output dashboard from database.',
          life: 5000,
        });
      },
    });
  }

  private applyPlansFromApi(plans: PlanRecord[]): void {
    this.savedPlans.clear();
    this.aerialDeviceMap?.clearAllRoutes();

    plans.forEach((plan, index) => {
      this.savedPlans.push(this.createPlanFormGroup(plan));
      this.aerialDeviceMap?.restoreSavedRoute(plan.key, plan.route, index);
      this.aerialDeviceMap?.startPlanSimulation({
        planKey: plan.key,
        speed: plan.speed,
        shape: plan.markerShape ?? MARKER_SHAPES[index],
        route: plan.route,
        startingDate: new Date(plan.startingDate),
      });
    });

    this.syncRouteEvents();
    this.loadTimelineSettings();
  }

  private loadTimelineSettings(): void {
    this.planApi.getTimeline().subscribe({
      next: (timeline) => this.applyTimelineSettings(timeline),
      error: () => {
        this.messageService.add({
          severity: 'warn',
          summary: 'Timeline unavailable',
          detail: 'Could not load mission timeline bounds from database.',
          life: 4000,
        });
      },
    });
  }

  private applyTimelineSettings(timeline: TimelineSettings): void {
    this.timelineStartTime = timeline.sliderStartTime
      ? new Date(timeline.sliderStartTime)
      : null;
    this.timelineEndTime = timeline.sliderEndTime ? new Date(timeline.sliderEndTime) : null;
    this.aerialDeviceMap?.setTimelineBounds(this.timelineStartTime, this.timelineEndTime);
    this.timelineValue = 0;

    if (this.timelineStartTime && this.timelineEndTime) {
      this.aerialDeviceMap?.setTimelineProgress(0, this.playbackMode);
    }
  }

  private createPlanFormGroup(plan: PlanRecord): FormGroup {
    return this.fb.group({
      key: [plan.key],
      planeName: [plan.planeName],
      speed: [plan.speed],
      startingDate: [new Date(plan.startingDate)],
      markerShape: [plan.markerShape],
      distanceMeters: [plan.distanceMeters],
      route: this.fb.array(
        plan.route.map((point) =>
          this.fb.group({
            longitude: [point.longitude],
            latitude: [point.latitude],
          })
        )
      ),
    });
  }

  private getPlanRoute(plan: FormGroup): RouteWaypoint[] {
    const routeArray = plan.get('route') as FormArray<FormGroup>;
    return routeArray.controls.map((point) => ({
      longitude: point.get('longitude')?.value as number,
      latitude: point.get('latitude')?.value as number,
    }));
  }

  private pauseSimulationForTimelineScrub(): void {
    if (!this.isRunning) {
      return;
    }

    this.aerialDeviceMap?.pauseSimulation(false);
    this.isRunning = false;
    this.isPaused = true;
  }

  private applyTimelineChange(value: number): void {
    let nextValue = Math.min(100, Math.max(0, value));

    if (this.playbackMode === 'event') {
      const eventProgresses = this.timelineSteps.map((step) => step / 100);
      nextValue = Math.round(
        snapToNearestEventProgress(nextValue / 100, eventProgresses) * 100
      );
    } else {
      nextValue = Math.round(nextValue);
    }

    this.timelineValue = nextValue;
    this.aerialDeviceMap?.setTimelineProgress(nextValue, this.playbackMode);
  }

  private formatTimelineTime(value: Date | null): string {
    if (!value) {
      return '—';
    }

    return this.datePipe.transform(value, 'medium') ?? '—';
  }

  private syncTimelineFromSimulation(states: VehicleSimulationState[]): void {
    if (
      !this.isTimelineInteractive ||
      states.length === 0 ||
      this.manualTimelineScrub ||
      this.playbackMode === 'time'
    ) {
      return;
    }

    const maxProgress = Math.max(...states.map((state) => state.progress)) / 100;
    let nextValue: number;

    if (this.playbackMode === 'event') {
      const eventProgresses = this.timelineSteps.map((step) => step / 100);
      nextValue = Math.round(snapToPreviousEventProgress(maxProgress, eventProgresses) * 100);
    } else {
      nextValue = Math.round(maxProgress * 100);
    }

    if (nextValue === this.timelineValue) {
      return;
    }

    this.syncingTimelineFromSimulation = true;
    this.timelineValue = nextValue;
    this.syncingTimelineFromSimulation = false;
  }
}
