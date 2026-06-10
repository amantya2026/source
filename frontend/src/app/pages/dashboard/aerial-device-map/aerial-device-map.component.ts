import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import OlMap from 'ol/Map';
import View from 'ol/View';
import VectorLayer from 'ol/layer/Vector';
import { createGeoServerBaseLayer } from '../../../utils/geoserver-map.util';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import type { FeatureLike } from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import type Polygon from 'ol/geom/Polygon';
import { fromLonLat, toLonLat } from 'ol/proj';
import { getLength } from 'ol/sphere';
import { Style, Circle, Fill, Stroke, Text, RegularShape } from 'ol/style';
import { defaults as defaultControls, ScaleLine, Zoom } from 'ol/control';
import DragPan from 'ol/interaction/DragPan';
import type { EventsKey } from 'ol/events';
import { unByKey } from 'ol/Observable';
import type { Coordinate } from 'ol/coordinate';
import type { MapBrowserEvent } from 'ol';
import { DeployEditAction, DeployArea } from '../../../models/deploy-area.model';
import {
  FUEL_CAPACITY_LITERS,
  FUEL_CONSUMPTION_L_PER_MIN,
  MarkerShape,
  PlanSimulationConfig,
  RouteEvent,
  RouteWaypoint,
  VehicleSimulationState,
  WaypointAddedEvent,
} from '../../../models/plan.model';
import {
  cloneDeployVertices,
  createDeployAreaPolygon,
  distanceMeters,
  sampleEllipseVertices,
} from '../../../utils/ellipse.util';
import { fuelRemainingForDistance } from '../../../utils/plan-fuel.util';
import {
  missionTimeFromSliderValue,
  vehicleStateAtMissionTime,
} from '../../../utils/plan-timeline.util';
import {
  computeEventProgresses,
  mergeEventProgressSteps,
  snapToNearestEventProgress,
  snapToPreviousEventProgress,
} from '../../../utils/simulation-event.util';
import { DeployAreaCardComponent } from './deploy-area-card/deploy-area-card.component';

interface SavedRoute {
  waypoints: Coordinate[];
  color: string;
}

interface VehicleRuntime {
  planKey: string;
  shape: MarkerShape;
  speedKmh: number;
  startingDate: Date;
  line: LineString;
  progress: number;
  fuelLiters: number;
  finished: boolean;
  feature: Feature<Point>;
  eventProgresses: number[];
}

interface DeployDragState {
  pointerStart: Coordinate;
  areaSnapshot: DeployArea;
  reshapeVertexIndex?: number;
}

interface DeployPointerPayload {
  coordinate: Coordinate;
  pixel: number[];
}

const PLAN_ROUTE_COLORS = ['#10b981', '#059669', '#34d399'];
const DRAFT_ROUTE_COLOR = '#6ee7b7';
const MIN_ELLIPSE_RADIUS_M = 80;
const DEFAULT_DEPLOY_RADIUS_X_M = 150_000;
const DEFAULT_DEPLOY_RADIUS_Y_M = 80_000;
const RESHAPE_VERTEX_COUNT = 8;

@Component({
  selector: 'app-aerial-device-map',
  imports: [DeployAreaCardComponent],
  templateUrl: './aerial-device-map.component.html',
  styleUrl: './aerial-device-map.component.scss',
  changeDetection: ChangeDetectionStrategy.Default,
})
export class AerialDeviceMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mapTarget', { static: true }) mapTarget!: ElementRef<HTMLDivElement>;
  @ViewChild('mapControls', { static: true }) mapControls!: ElementRef<HTMLDivElement>;

  @Input() routeSelectionEnabled = false;
  @Input() deployEditingEnabled = false;
  @Output() waypointAdded = new EventEmitter<WaypointAddedEvent>();
  @Output() simulationStateChange = new EventEmitter<VehicleSimulationState[]>();
  @Output() simulationFinished = new EventEmitter<void>();
  @Output() missionTimeChange = new EventEmitter<number>();

  deployCardVisible = false;
  deployMapHint = 'Click on the map to place or select a deploy area';
  activeDeployAction: DeployEditAction | null = null;

  private map?: OlMap;
  private dragPan?: DragPan;
  private baseLayer = createGeoServerBaseLayer();
  private routeSource = new VectorSource();
  private routeLayer = new VectorLayer({
    source: this.routeSource,
    style: (feature) => this.styleRouteFeature(feature),
  });
  private routeEventSource = new VectorSource();
  private routeEventLayer = new VectorLayer({
    source: this.routeEventSource,
    style: (feature) => this.styleRouteEventFeature(feature),
  });
  private deployAreaSource = new VectorSource();
  private deployAreaLayer = new VectorLayer({
    source: this.deployAreaSource,
    style: (feature) => this.styleDeployAreaFeature(feature),
  });
  private vehicleSource = new VectorSource();
  private vehicleLayer = new VectorLayer({
    source: this.vehicleSource,
    style: (feature) => this.styleVehicleFeature(feature),
  });
  private savedRoutes = new Map<string, SavedRoute>();
  private draftWaypoints: Coordinate[] = [];
  private deployAreas = new Map<string, DeployArea>();
  private deployAreaFeatures = new Map<string, Feature<Polygon>>();
  private reshapeHandleFeatures = new Map<number, Feature<Point>>();
  private selectedDeployAreaId: string | null = null;
  private deployAreaCounter = 0;
  private deployDragState?: DeployDragState;
  private deployPointerDown = false;
  private deployDragging = false;
  private suppressNextDeployClick = false;
  private clickKey?: EventsKey;
  private deployClickKey?: EventsKey;
  private deployDomCleanup: (() => void)[] = [];
  private vehicles: VehicleRuntime[] = [];
  private animationFrame?: number;
  private lastFrameTime?: number;
  private simulationRunning = false;
  private timelineStartMs: number | null = null;
  private timelineEndMs: number | null = null;
  private missionTimeMs: number | null = null;
  private activePlaybackMode: 'time' | 'event' = 'event';

  constructor(
    private readonly ngZone: NgZone,
    private readonly cdr: ChangeDetectorRef
  ) {}

  commitDraftRoute(planKey: string): [number, number][] {
    const route = this.draftWaypoints.map((coordinate) => toLonLat(coordinate) as [number, number]);

    if (route.length > 0) {
      const color = PLAN_ROUTE_COLORS[this.savedRoutes.size % PLAN_ROUTE_COLORS.length];
      this.savedRoutes.set(planKey, {
        waypoints: [...this.draftWaypoints],
        color,
      });
    }

    this.draftWaypoints = [];
    this.rebuildAllFeatures();

    return route;
  }

  restoreSavedRoute(planKey: string, route: RouteWaypoint[], colorIndex: number): void {
    if (route.length === 0) {
      return;
    }

    const waypoints = route.map((point) => fromLonLat([point.longitude, point.latitude]));
    const color = PLAN_ROUTE_COLORS[colorIndex % PLAN_ROUTE_COLORS.length];
    this.savedRoutes.set(planKey, { waypoints, color });
    this.rebuildAllFeatures();
    this.cdr.markForCheck();
  }

  removeSavedRoute(planKey: string): void {
    this.savedRoutes.delete(planKey);
    this.rebuildAllFeatures();
    this.cdr.markForCheck();
  }

  clearAllRoutes(): void {
    this.savedRoutes.clear();
    this.draftWaypoints = [];
    this.routeEventSource.clear();
    this.stopSimulation();
    this.rebuildAllFeatures();
    this.cdr.markForCheck();
  }

  setRouteEvents(events: RouteEvent[]): void {
    this.routeEventSource.clear();

    for (const event of events) {
      this.routeEventSource.addFeature(
        new Feature({
          geometry: new Point(fromLonLat([event.longitude, event.latitude])),
          kind: 'route-event',
          planKeys: event.planKeys,
        })
      );
    }
  }

  clearDeploySelection(): void {
    this.hideDeployCard();
    this.activeDeployAction = null;
    this.deployDragState = undefined;
    this.deployDragging = false;
    this.deployPointerDown = false;
    this.resetDeployMapHint();
    this.updateDeployCursorClasses();
    this.refreshDeployStyles();
    this.cdr.markForCheck();
  }

  onDeployDelete(): void {
    if (!this.selectedDeployAreaId) {
      return;
    }

    const feature = this.deployAreaFeatures.get(this.selectedDeployAreaId);
    if (feature) {
      this.deployAreaSource.removeFeature(feature);
    }

    this.deployAreas.delete(this.selectedDeployAreaId);
    this.deployAreaFeatures.delete(this.selectedDeployAreaId);
    this.clearReshapeHandles();
    this.activeDeployAction = null;
    this.hideDeployCard();
    this.cdr.markForCheck();
  }

  onDeployMove(): void {
    this.clearReshapeHandles();
    this.activeDeployAction = 'move';
    this.updateDeployCursorClasses();
    this.cdr.markForCheck();
  }

  onDeployResize(): void {
    this.clearReshapeHandles();
    this.activeDeployAction = 'resize';
    this.updateDeployCursorClasses();
    this.cdr.markForCheck();
  }

  onDeployReshape(): void {
    this.activeDeployAction = 'reshape';
    this.deployMapHint = 'Drag the points to reshape the area';

    if (this.selectedDeployAreaId) {
      const area = this.deployAreas.get(this.selectedDeployAreaId);
      if (area) {
        this.ensureReshapeVertices(area);
        this.updateDeployAreaFeature(area);
        this.updateReshapeHandles(area);
      }
    }

    this.updateDeployCursorClasses();
    this.cdr.markForCheck();
  }

  onDeployClose(): void {
    this.clearDeploySelection();
  }

  startPlanSimulation(plan: PlanSimulationConfig, autoStart = false): void {
    if (plan.route.length === 0 || this.vehicles.some((vehicle) => vehicle.planKey === plan.planKey)) {
      return;
    }

    const coordinates = plan.route.map((point) =>
      fromLonLat([point.longitude, point.latitude])
    );
    const line = new LineString(coordinates);
    const start = coordinates[0];
    const speedKmh = Math.max(1, Number(plan.speed) || 1);
    const feature = new Feature({
      geometry: new Point(start),
      shape: plan.shape,
      planKey: plan.planKey,
      color: this.savedRoutes.get(plan.planKey)?.color ?? '#10b981',
    });

    this.vehicleSource.addFeature(feature);
    this.vehicles.push({
      planKey: plan.planKey,
      shape: plan.shape,
      speedKmh,
      startingDate: plan.startingDate,
      line,
      progress: 0,
      fuelLiters: FUEL_CAPACITY_LITERS,
      finished: false,
      feature,
      eventProgresses: computeEventProgresses(line),
    });

    if (autoStart) {
      this.beginSimulationLoop();
    }

    this.emitSimulationState();
  }

  setTimelineBounds(start: Date | null, end: Date | null): void {
    this.timelineStartMs = start?.getTime() ?? null;
    this.timelineEndMs = end?.getTime() ?? null;
    this.missionTimeMs = this.timelineStartMs;
  }

  startSimulation(mode: 'time' | 'event' = 'event'): void {
    this.activePlaybackMode = mode;

    if (mode === 'time' && this.timelineStartMs != null && this.timelineEndMs != null) {
      if (this.missionTimeMs == null) {
        this.missionTimeMs = this.timelineStartMs;
      }
      this.beginTimeBasedLoop();
      return;
    }

    this.beginSimulationLoop();
  }

  pauseSimulation(snapToEvents = false): void {
    this.simulationRunning = false;
    if (this.animationFrame !== undefined) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = undefined;
    }

    if (!snapToEvents) {
      return;
    }

    for (const vehicle of this.vehicles) {
      if (vehicle.finished) {
        continue;
      }

      vehicle.progress = snapToPreviousEventProgress(vehicle.progress, vehicle.eventProgresses);
      this.syncVehicleToProgress(vehicle);
    }

    this.vehicleSource.changed();
    this.ngZone.run(() => this.emitSimulationState());
  }

  resumeSimulation(): void {
    if (this.vehicles.length === 0 || this.vehicles.every((vehicle) => vehicle.finished)) {
      return;
    }

    this.beginSimulationLoop();
  }

  resetSimulation(): void {
    this.pauseSimulation(false);

    for (const vehicle of this.vehicles) {
      vehicle.progress = 0;
      vehicle.fuelLiters = FUEL_CAPACITY_LITERS;
      vehicle.finished = false;
      this.syncVehicleToProgress(vehicle);
    }

    this.missionTimeMs = this.timelineStartMs;
    this.vehicleSource.changed();
    this.emitSimulationState();
    if (this.missionTimeMs != null) {
      this.missionTimeChange.emit(this.missionTimeMs);
    }
  }

  getTimelineEventSteps(): number[] {
    return mergeEventProgressSteps(this.vehicles.map((vehicle) => vehicle.eventProgresses)).map(
      (progress) => Math.round(progress * 100)
    );
  }

  setTimelineProgress(sliderValue: number, mode: 'time' | 'event'): void {
    if (this.vehicles.length === 0) {
      return;
    }

    if (
      mode === 'time' &&
      this.timelineStartMs != null &&
      this.timelineEndMs != null
    ) {
      const missionTime = missionTimeFromSliderValue(
        sliderValue,
        new Date(this.timelineStartMs),
        new Date(this.timelineEndMs)
      );
      this.applyMissionTime(missionTime.getTime());
      return;
    }

    let targetProgress = Math.min(1, Math.max(0, sliderValue / 100));

    if (mode === 'event') {
      const eventProgresses = mergeEventProgressSteps(
        this.vehicles.map((vehicle) => vehicle.eventProgresses)
      );
      targetProgress = snapToNearestEventProgress(targetProgress, eventProgresses);
    }

    for (const vehicle of this.vehicles) {
      vehicle.progress = targetProgress;
      this.syncVehicleToProgress(vehicle);
      vehicle.finished = targetProgress >= 1 - 1e-9 || vehicle.fuelLiters <= 0;
    }

    this.vehicleSource.changed();
    this.emitSimulationState();

    if (this.timelineStartMs != null && this.timelineEndMs != null) {
      const missionTime = missionTimeFromSliderValue(
        sliderValue,
        new Date(this.timelineStartMs),
        new Date(this.timelineEndMs)
      );
      this.missionTimeMs = missionTime.getTime();
      this.missionTimeChange.emit(this.missionTimeMs);
    }
  }

  stopSimulation(clearMarkers = true): void {
    this.pauseSimulation();
    if (clearMarkers) {
      this.vehicleSource.clear();
      this.vehicles = [];
      this.emitSimulationState();
    }
  }

  ngAfterViewInit(): void {
    this.map = new OlMap({
      target: this.mapTarget.nativeElement,
      layers: [
        this.baseLayer,
        this.routeLayer,
        this.routeEventLayer,
        this.deployAreaLayer,
        this.vehicleLayer,
      ],
      view: new View({
        center: fromLonLat([77.209, 28.6139]),
        zoom: 5,
      }),
      controls: defaultControls({ zoom: false, rotate: false }).extend([
        new Zoom({ target: this.mapControls.nativeElement }),
        new ScaleLine({ target: this.mapControls.nativeElement }),
      ]),
    });

    this.syncRouteSelectionHandler();
    this.syncDeployEditingHandler();
    this.updateDeployCursorClasses();

    for (const interaction of this.map.getInteractions().getArray()) {
      if (interaction instanceof DragPan) {
        this.dragPan = interaction;
        break;
      }
    }

    this.map.updateSize();
    requestAnimationFrame(() => this.map?.updateSize());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['routeSelectionEnabled']) {
      this.syncRouteSelectionHandler();
    }

    if (changes['deployEditingEnabled']) {
      this.syncDeployEditingHandler();
      this.updateDeployCursorClasses();

      if (!this.deployEditingEnabled) {
        this.clearDeploySelection();
        this.resetDeployMapHint();
      }

      this.setMapPanEnabled(!this.deployEditingEnabled);
    }
  }

  ngOnDestroy(): void {
    this.stopSimulation();
    this.detachClickHandler();
    this.detachDeployPointerHandlers();
    this.setMapPanEnabled(true);
    this.map?.setTarget(undefined);
    this.map?.dispose();
  }

  private beginTimeBasedLoop(): void {
    if (
      this.simulationRunning ||
      this.vehicles.length === 0 ||
      this.timelineStartMs == null ||
      this.timelineEndMs == null
    ) {
      return;
    }

    this.simulationRunning = true;
    this.lastFrameTime = performance.now();
    this.ngZone.runOutsideAngular(() => this.animateTimeBased());
  }

  private animateTimeBased = (): void => {
    if (!this.simulationRunning || this.timelineEndMs == null) {
      return;
    }

    const now = performance.now();
    const deltaMs = now - (this.lastFrameTime ?? now);
    this.lastFrameTime = now;

    const nextMissionTime = Math.min(
      this.timelineEndMs,
      (this.missionTimeMs ?? this.timelineStartMs ?? 0) + deltaMs
    );
    this.applyMissionTime(nextMissionTime);

    if (nextMissionTime >= this.timelineEndMs) {
      this.simulationRunning = false;
      this.ngZone.run(() => this.simulationFinished.emit());
      return;
    }

    this.animationFrame = requestAnimationFrame(this.animateTimeBased);
  };

  private applyMissionTime(missionTimeMs: number): void {
    this.missionTimeMs = missionTimeMs;
    const missionTime = new Date(missionTimeMs);

    for (const vehicle of this.vehicles) {
      const lineLength = getLength(vehicle.line);
      const state = vehicleStateAtMissionTime(
        vehicle.startingDate,
        vehicle.speedKmh,
        lineLength,
        missionTime
      );
      vehicle.progress = state.progress;
      vehicle.fuelLiters = state.fuelLiters;
      vehicle.finished = state.finished;
      this.syncVehicleToProgress(vehicle, false);
    }

    this.vehicleSource.changed();
    this.ngZone.run(() => {
      this.emitSimulationState();
      this.missionTimeChange.emit(missionTimeMs);
    });
  }

  private beginSimulationLoop(): void {
    if (
      this.simulationRunning ||
      this.vehicles.length === 0 ||
      this.vehicles.every((vehicle) => vehicle.finished)
    ) {
      return;
    }

    this.simulationRunning = true;
    this.lastFrameTime = performance.now();
    this.ngZone.runOutsideAngular(() => this.animate());
  }

  private animate = (): void => {
    if (!this.simulationRunning) return;

    const now = performance.now();
    const deltaMs = now - (this.lastFrameTime ?? now);
    this.lastFrameTime = now;
    const deltaMinutes = deltaMs / 60000;

    for (const vehicle of this.vehicles) {
      if (vehicle.finished) continue;

      vehicle.fuelLiters = Math.max(
        0,
        vehicle.fuelLiters - FUEL_CONSUMPTION_L_PER_MIN * deltaMinutes
      );

      if (vehicle.fuelLiters <= 0) {
        vehicle.finished = true;
        continue;
      }

      const lineLength = getLength(vehicle.line);
      const speedMs = (vehicle.speedKmh * 1000) / 3600;
      const progressDelta = lineLength > 0 ? (speedMs * (deltaMs / 1000)) / lineLength : 0;
      vehicle.progress = Math.min(1, vehicle.progress + progressDelta);

      const coordinate = vehicle.line.getCoordinateAt(vehicle.progress);
      (vehicle.feature.getGeometry() as Point).setCoordinates(coordinate);

      if (vehicle.progress >= 1) {
        vehicle.finished = true;
      }
    }

    this.vehicleSource.changed();
    this.ngZone.run(() => this.emitSimulationState());

    if (this.vehicles.every((vehicle) => vehicle.finished)) {
      this.simulationRunning = false;
      this.ngZone.run(() => this.simulationFinished.emit());
      return;
    }

    this.animationFrame = requestAnimationFrame(this.animate);
  };

  private emitSimulationState(): void {
    this.simulationStateChange.emit(
      this.vehicles.map((vehicle) => ({
        planKey: vehicle.planKey,
        shape: vehicle.shape,
        speed: vehicle.speedKmh,
        fuelLiters: Math.round(vehicle.fuelLiters * 10) / 10,
        progress: Math.round(vehicle.progress * 1000) / 10,
      }))
    );
  }

  private syncVehicleToProgress(vehicle: VehicleRuntime, updateFuelFromDistance = true): void {
    const coordinate = vehicle.line.getCoordinateAt(vehicle.progress);
    (vehicle.feature.getGeometry() as Point).setCoordinates(coordinate);

    if (!updateFuelFromDistance) {
      return;
    }

    const lineLength = getLength(vehicle.line);
    const distanceTraveled = lineLength * vehicle.progress;
    vehicle.fuelLiters = fuelRemainingForDistance(distanceTraveled, vehicle.speedKmh);
  }

  private syncRouteSelectionHandler(): void {
    if (this.routeSelectionEnabled) {
      this.attachClickHandler();
      return;
    }
    this.detachClickHandler();
  }

  private syncDeployEditingHandler(): void {
    this.detachDeployPointerHandlers();

    if (!this.deployEditingEnabled || !this.map) {
      return;
    }

    this.deployClickKey = this.map.on('singleclick', (event) => this.onDeploySingleClick(event));

    const viewport = this.map.getViewport();
    const downHandler = (nativeEvent: PointerEvent) => {
      if (!this.map) return;
      this.onDeployPointerDown({
        coordinate: this.map.getCoordinateFromPixel(this.map.getEventPixel(nativeEvent)),
        pixel: this.map.getEventPixel(nativeEvent),
      });
    };
    const moveHandler = (nativeEvent: PointerEvent) => {
      if (!this.map) return;
      this.onDeployPointerMove({
        coordinate: this.map.getCoordinateFromPixel(this.map.getEventPixel(nativeEvent)),
        pixel: this.map.getEventPixel(nativeEvent),
      });
    };
    const upHandler = (nativeEvent: PointerEvent) => {
      if (!this.map) return;
      this.onDeployPointerUp({
        coordinate: this.map.getCoordinateFromPixel(this.map.getEventPixel(nativeEvent)),
        pixel: this.map.getEventPixel(nativeEvent),
      });
    };

    viewport.addEventListener('pointerdown', downHandler);
    viewport.addEventListener('pointermove', moveHandler);
    viewport.addEventListener('pointerup', upHandler);
    this.deployDomCleanup = [
      () => viewport.removeEventListener('pointerdown', downHandler),
      () => viewport.removeEventListener('pointermove', moveHandler),
      () => viewport.removeEventListener('pointerup', upHandler),
    ];

    this.setMapPanEnabled(false);
  }

  private setMapPanEnabled(enabled: boolean): void {
    this.dragPan?.setActive(enabled);
  }

  private attachClickHandler(): void {
    if (!this.map || this.clickKey) return;

    this.clickKey = this.map.on('singleclick', (event) => this.onMapClick(event));
  }

  private detachClickHandler(): void {
    if (!this.clickKey) return;
    unByKey(this.clickKey);
    this.clickKey = undefined;
  }

  private detachDeployPointerHandlers(): void {
    if (this.deployClickKey) {
      unByKey(this.deployClickKey);
      this.deployClickKey = undefined;
    }

    for (const cleanup of this.deployDomCleanup) {
      cleanup();
    }
    this.deployDomCleanup = [];
  }

  private onMapClick(event: MapBrowserEvent<PointerEvent | KeyboardEvent | WheelEvent>): void {
    if (!this.routeSelectionEnabled) return;

    this.draftWaypoints.push(event.coordinate);
    this.rebuildAllFeatures();

    this.waypointAdded.emit({ count: this.draftWaypoints.length });
  }

  private onDeploySingleClick(event: MapBrowserEvent<PointerEvent | KeyboardEvent | WheelEvent>): void {
    if (!this.deployEditingEnabled) {
      return;
    }

    if (this.suppressNextDeployClick) {
      this.suppressNextDeployClick = false;
      return;
    }

    const hitAreaId = this.getDeployAreaAtPixel(event.pixel);

    if (hitAreaId) {
      this.selectDeployArea(hitAreaId);
      return;
    }

    if (this.activeDeployAction) {
      return;
    }

    this.addDeployArea(
      event.coordinate,
      DEFAULT_DEPLOY_RADIUS_X_M,
      DEFAULT_DEPLOY_RADIUS_Y_M,
      0
    );
    this.cdr.markForCheck();
  }

  private onDeployPointerDown(event: DeployPointerPayload): void {
    if (!this.deployEditingEnabled || !this.map) {
      return;
    }

    this.deployPointerDown = true;

    if (this.activeDeployAction && this.selectedDeployAreaId) {
      const area = this.deployAreas.get(this.selectedDeployAreaId);
      if (!area) {
        return;
      }

      if (this.activeDeployAction === 'reshape') {
        const vertexIndex = this.getReshapeVertexIndexAtPixel(event.pixel);
        if (vertexIndex === null) {
          this.deployPointerDown = false;
          return;
        }

        this.deployDragState = {
          pointerStart: event.coordinate,
          areaSnapshot: this.cloneAreaSnapshot(area),
          reshapeVertexIndex: vertexIndex,
        };
      } else {
        this.deployDragState = {
          pointerStart: event.coordinate,
          areaSnapshot: this.cloneAreaSnapshot(area),
        };
      }

      this.deployDragging = true;
      this.updateDeployCursorClasses();
    }
  }

  private onDeployPointerMove(event: DeployPointerPayload): void {
    if (!this.deployEditingEnabled) {
      return;
    }

    if (this.deployDragState && this.selectedDeployAreaId && this.deployPointerDown) {
      this.applyDeployDrag(event.coordinate);
    }
  }

  private onDeployPointerUp(_event: DeployPointerPayload): void {
    if (!this.deployEditingEnabled) {
      return;
    }

    if (this.deployDragState) {
      this.deployDragState = undefined;
      this.deployDragging = false;
      this.deployPointerDown = false;
      this.suppressNextDeployClick = true;
      this.updateDeployCursorClasses();
      return;
    }

    this.deployPointerDown = false;
  }

  private applyDeployDrag(current: Coordinate): void {
    if (!this.deployDragState || !this.selectedDeployAreaId || !this.activeDeployAction) {
      return;
    }

    const { pointerStart, areaSnapshot } = this.deployDragState;
    const area = this.deployAreas.get(this.selectedDeployAreaId);
    if (!area) {
      return;
    }

    const center = fromLonLat([areaSnapshot.longitude, areaSnapshot.latitude]);

    if (this.activeDeployAction === 'move') {
      const deltaX = current[0] - pointerStart[0];
      const deltaY = current[1] - pointerStart[1];
      const nextCenter: Coordinate = [center[0] + deltaX, center[1] + deltaY];
      const [longitude, latitude] = toLonLat(nextCenter);
      area.longitude = longitude;
      area.latitude = latitude;

      if (areaSnapshot.vertices?.length) {
        area.vertices = areaSnapshot.vertices.map(([lon, lat]) => {
          const vertex = fromLonLat([lon, lat]);
          return toLonLat([vertex[0] + deltaX, vertex[1] + deltaY]) as [number, number];
        });
      }
    }

    if (this.activeDeployAction === 'resize') {
      const initialDistance = Math.max(
        distanceMeters(toLonLat(center), toLonLat(pointerStart)),
        1
      );
      const currentDistance = Math.max(distanceMeters(toLonLat(center), toLonLat(current)), 1);
      const scale = currentDistance / initialDistance;

      if (areaSnapshot.vertices?.length) {
        area.vertices = areaSnapshot.vertices.map(([lon, lat]) => {
          const vertex = fromLonLat([lon, lat]);
          return toLonLat([
            center[0] + (vertex[0] - center[0]) * scale,
            center[1] + (vertex[1] - center[1]) * scale,
          ]) as [number, number];
        });
      } else {
        area.radiusX = Math.max(areaSnapshot.radiusX * scale, MIN_ELLIPSE_RADIUS_M);
        area.radiusY = Math.max(areaSnapshot.radiusY * scale, MIN_ELLIPSE_RADIUS_M);
        area.rotation = areaSnapshot.rotation;
      }
    }

    if (this.activeDeployAction === 'reshape') {
      const vertexIndex = this.deployDragState.reshapeVertexIndex;
      if (vertexIndex === undefined || !areaSnapshot.vertices?.length) {
        return;
      }

      area.vertices = cloneDeployVertices(areaSnapshot.vertices);
      area.vertices[vertexIndex] = toLonLat(current) as [number, number];
      this.updateReshapeHandles(area);
    }

    this.updateDeployAreaFeature(area);
    this.refreshDeployStyles();
  }

  private addDeployArea(
    center: Coordinate,
    radiusX: number,
    radiusY: number,
    rotation: number
  ): void {
    const [longitude, latitude] = toLonLat(center);
    const area: DeployArea = {
      id: `area-${++this.deployAreaCounter}`,
      longitude,
      latitude,
      radiusX,
      radiusY,
      rotation,
    };

    this.deployAreas.set(area.id, area);
    const feature = this.createDeployFeature(area);
    this.deployAreaFeatures.set(area.id, feature);
    this.deployAreaSource.addFeature(feature);
    this.deployMapHint = 'Click on the map to place or select a deploy area';
    this.selectDeployArea(area.id);
  }

  private createDeployFeature(area: DeployArea): Feature<Polygon> {
    return new Feature({
      geometry: createDeployAreaPolygon(area),
      kind: 'deploy-area',
      areaId: area.id,
    });
  }

  private updateDeployAreaFeature(area: DeployArea): void {
    const feature = this.deployAreaFeatures.get(area.id);
    if (!feature) {
      return;
    }

    feature.setGeometry(createDeployAreaPolygon(area));
    this.deployAreaSource.changed();
  }

  private ensureReshapeVertices(area: DeployArea): [number, number][] {
    if (area.vertices && area.vertices.length >= 3) {
      return area.vertices;
    }

    area.vertices = sampleEllipseVertices(area, RESHAPE_VERTEX_COUNT);
    return area.vertices;
  }

  private cloneAreaSnapshot(area: DeployArea): DeployArea {
    return {
      ...area,
      vertices: area.vertices ? cloneDeployVertices(area.vertices) : undefined,
    };
  }

  private updateReshapeHandles(area: DeployArea): void {
    if (!area.vertices?.length) {
      return;
    }

    for (let index = 0; index < area.vertices.length; index++) {
      const coordinate = fromLonLat(area.vertices[index]);
      let feature = this.reshapeHandleFeatures.get(index);

      if (!feature) {
        feature = new Feature({
          geometry: new Point(coordinate),
          kind: 'reshape-handle',
          vertexIndex: index,
        });
        this.reshapeHandleFeatures.set(index, feature);
        this.deployAreaSource.addFeature(feature);
      } else {
        (feature.getGeometry() as Point).setCoordinates(coordinate);
      }
    }

    for (const [index, feature] of this.reshapeHandleFeatures) {
      if (index >= area.vertices.length) {
        this.deployAreaSource.removeFeature(feature);
        this.reshapeHandleFeatures.delete(index);
      }
    }

    this.deployAreaSource.changed();
  }

  private clearReshapeHandles(): void {
    for (const feature of this.reshapeHandleFeatures.values()) {
      this.deployAreaSource.removeFeature(feature);
    }
    this.reshapeHandleFeatures.clear();
  }

  private resetDeployMapHint(): void {
    this.deployMapHint = 'Click on the map to place or select a deploy area';
  }

  private getReshapeVertexIndexAtPixel(pixel: number[]): number | null {
    if (!this.map || this.activeDeployAction !== 'reshape' || this.reshapeHandleFeatures.size === 0) {
      return null;
    }

    let vertexIndex: number | null = null;
    this.map.forEachFeatureAtPixel(
      pixel,
      (feature) => {
        if (feature.get('kind') === 'reshape-handle') {
          vertexIndex = feature.get('vertexIndex') as number;
          return true;
        }
        return false;
      },
      {
        layerFilter: (layer) => layer === this.deployAreaLayer,
        hitTolerance: 12,
      }
    );

    return vertexIndex;
  }

  private getDeployAreaAtPixel(pixel: number[]): string | null {
    if (!this.map) {
      return null;
    }

    let areaId: string | null = null;
    this.map.forEachFeatureAtPixel(
      pixel,
      (feature) => {
        if (feature.get('kind') === 'deploy-area') {
          areaId = feature.get('areaId') as string;
          return true;
        }
        return false;
      },
      {
        layerFilter: (layer) => layer === this.deployAreaLayer,
        hitTolerance: 4,
      }
    );

    return areaId;
  }

  private selectDeployArea(areaId: string): void {
    this.clearReshapeHandles();
    this.selectedDeployAreaId = areaId;
    this.deployCardVisible = true;
    this.activeDeployAction = null;
    this.updateDeployCursorClasses();
    this.refreshDeployStyles();
    this.cdr.markForCheck();
  }

  private hideDeployCard(): void {
    this.clearReshapeHandles();
    this.deployCardVisible = false;
    this.selectedDeployAreaId = null;
    this.refreshDeployStyles();
    this.cdr.markForCheck();
  }

  private refreshDeployStyles(): void {
    for (const feature of this.deployAreaFeatures.values()) {
      feature.set('selected', feature.get('areaId') === this.selectedDeployAreaId);
    }
    this.deployAreaSource.changed();
  }

  private updateDeployCursorClasses(): void {
    const element = this.mapTarget.nativeElement;
    element.classList.toggle('deploy-editing', this.deployEditingEnabled);
    element.classList.toggle('deploy-action-active', !!this.activeDeployAction);
    element.classList.toggle('deploy-reshape-active', this.activeDeployAction === 'reshape');
    element.classList.toggle('deploy-dragging', this.deployDragging);
  }

  private rebuildAllFeatures(): void {
    this.routeSource.clear();

    for (const [planKey, savedRoute] of this.savedRoutes) {
      this.addRouteFeatures(savedRoute.waypoints, savedRoute.color, planKey, false);
    }

    this.addRouteFeatures(this.draftWaypoints, DRAFT_ROUTE_COLOR, 'draft', true);
  }

  private addRouteFeatures(
    waypoints: Coordinate[],
    color: string,
    planKey: string,
    isDraft: boolean
  ): void {
    if (waypoints.length >= 2) {
      this.routeSource.addFeature(
        new Feature({
          geometry: new LineString(waypoints),
          kind: 'route',
          color,
          planKey,
          isDraft,
        })
      );
    }

    waypoints.forEach((coordinate, index) => {
      this.routeSource.addFeature(
        new Feature({
          geometry: new Point(coordinate),
          kind: 'waypoint',
          color,
          planKey,
          isDraft,
          index: index + 1,
        })
      );
    });
  }

  private styleRouteFeature(feature: FeatureLike): Style {
    if (!(feature instanceof Feature)) {
      return new Style();
    }

    const kind = feature.get('kind');
    const color = feature.get('color') as string;

    if (kind === 'route') {
      return new Style({
        stroke: new Stroke({
          color,
          width: 3,
          lineDash: feature.get('isDraft') ? [8, 8] : undefined,
        }),
      });
    }

    const index = feature.get('index') as number;

    return new Style({
      image: new Circle({
        radius: 8,
        fill: new Fill({ color }),
        stroke: new Stroke({ color: '#ffffff', width: 2 }),
      }),
      text: new Text({
        text: String(index),
        font: 'bold 11px sans-serif',
        fill: new Fill({ color: '#ffffff' }),
      }),
    });
  }

  private styleRouteEventFeature(feature: FeatureLike): Style {
    if (!(feature instanceof Feature)) {
      return new Style();
    }

    const planKeys = feature.get('planKeys') as [string, string];

    return new Style({
      image: new RegularShape({
        points: 4,
        radius: 9,
        angle: Math.PI / 4,
        fill: new Fill({ color: '#059669' }),
        stroke: new Stroke({ color: '#ffffff', width: 2 }),
      }),
      text: new Text({
        text: planKeys.join(' / '),
        offsetY: -16,
        font: '10px sans-serif',
        fill: new Fill({ color: '#334155' }),
        stroke: new Stroke({ color: '#ffffff', width: 2 }),
      }),
    });
  }

  private styleDeployAreaFeature(feature: FeatureLike): Style {
    if (!(feature instanceof Feature)) {
      return new Style();
    }

    if (feature.get('kind') === 'reshape-handle') {
      return new Style({
        image: new Circle({
          radius: 8,
          fill: new Fill({ color: '#ffffff' }),
          stroke: new Stroke({ color: '#10b981', width: 3 }),
        }),
        zIndex: 3,
      });
    }

    const isDraft = feature.get('kind') === 'deploy-area-draft';
    const isSelected = feature.get('selected') === true;

    return new Style({
      fill: new Fill({
        color: isDraft ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.22)',
      }),
      stroke: new Stroke({
        color: isSelected ? '#059669' : '#10b981',
        width: isSelected ? 3 : 2,
        lineDash: isDraft ? [8, 8] : undefined,
      }),
    });
  }

  private styleVehicleFeature(feature: FeatureLike): Style {
    if (!(feature instanceof Feature)) {
      return new Style();
    }

    const shape = feature.get('shape') as MarkerShape;
    const color = feature.get('color') as string;

    return new Style({
      image: this.createMarkerShape(shape, color),
    });
  }

  private createMarkerShape(shape: MarkerShape, color: string): RegularShape {
    switch (shape) {
      case 'triangle':
        return new RegularShape({
          points: 3,
          radius: 12,
          rotation: 0,
          fill: new Fill({ color }),
          stroke: new Stroke({ color: '#ffffff', width: 2 }),
        });
      case 'square':
        return new RegularShape({
          points: 4,
          radius: 10,
          angle: Math.PI / 4,
          fill: new Fill({ color }),
          stroke: new Stroke({ color: '#ffffff', width: 2 }),
        });
      case 'pentagon':
        return new RegularShape({
          points: 5,
          radius: 11,
          fill: new Fill({ color }),
          stroke: new Stroke({ color: '#ffffff', width: 2 }),
        });
    }
  }
}
