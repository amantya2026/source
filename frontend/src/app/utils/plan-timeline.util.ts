import {
  FUEL_CAPACITY_LITERS,
  FUEL_CONSUMPTION_L_PER_MIN,
} from '../models/plan.model';

export const FUEL_CAPACITY_MINUTES = FUEL_CAPACITY_LITERS / FUEL_CONSUMPTION_L_PER_MIN;

export interface PlanTimelineInput {
  startingDate: Date;
  distanceMeters: number;
  speed: number;
}

export interface SliderBounds {
  start: Date | null;
  end: Date | null;
}

export function travelMinutesForPlan(distanceMeters: number, speedKmh: number): number {
  const speedMs = Math.max(speedKmh, 1) * (1000 / 3600);
  const travelMinutes = distanceMeters / speedMs / 60;
  return Math.min(travelMinutes, FUEL_CAPACITY_MINUTES);
}

export function planEndTime(
  startingDate: Date,
  distanceMeters: number,
  speedKmh: number
): Date {
  return new Date(
    startingDate.getTime() + travelMinutesForPlan(distanceMeters, speedKmh) * 60_000
  );
}

export function computeSliderBounds(plans: PlanTimelineInput[]): SliderBounds {
  if (plans.length === 0) {
    return { start: null, end: null };
  }

  const start = new Date(
    Math.min(...plans.map((plan) => plan.startingDate.getTime()))
  );
  const end = new Date(
    Math.max(
      ...plans.map((plan) =>
        planEndTime(plan.startingDate, plan.distanceMeters, plan.speed).getTime()
      )
    )
  );

  return { start, end };
}

export function missionTimeFromSliderValue(
  value: number,
  start: Date,
  end: Date
): Date {
  const ratio = Math.min(100, Math.max(0, value)) / 100;
  return new Date(start.getTime() + ratio * (end.getTime() - start.getTime()));
}

export function sliderValueFromMissionTime(
  missionTime: Date,
  start: Date,
  end: Date
): number {
  const span = end.getTime() - start.getTime();
  if (span <= 0) {
    return 0;
  }

  return Math.round(((missionTime.getTime() - start.getTime()) / span) * 100);
}

export interface VehicleMissionState {
  progress: number;
  fuelLiters: number;
  finished: boolean;
}

export function vehicleStateAtMissionTime(
  startingDate: Date,
  speedKmh: number,
  lineLengthMeters: number,
  missionTime: Date
): VehicleMissionState {
  if (missionTime.getTime() < startingDate.getTime()) {
    return { progress: 0, fuelLiters: FUEL_CAPACITY_LITERS, finished: false };
  }

  const elapsedMinutes = (missionTime.getTime() - startingDate.getTime()) / 60_000;
  const speedMs = Math.max(speedKmh, 1) * (1000 / 3600);
  const maxTravelMinutes = Math.min(elapsedMinutes, FUEL_CAPACITY_MINUTES);
  const distanceTraveled = Math.min(lineLengthMeters, maxTravelMinutes * speedMs * 60);
  const progress = lineLengthMeters > 0 ? Math.min(1, distanceTraveled / lineLengthMeters) : 0;
  const fuelLiters = Math.max(
    0,
    Math.round((FUEL_CAPACITY_LITERS - elapsedMinutes * FUEL_CONSUMPTION_L_PER_MIN) * 10) / 10
  );
  const finished = progress >= 1 - 1e-9 || fuelLiters <= 0;

  return { progress, fuelLiters, finished };
}
