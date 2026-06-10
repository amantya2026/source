import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { ChartModule, UIChart } from 'primeng/chart';
import { FUEL_CAPACITY_LITERS, RouteEvent } from '../../../models/plan.model';
import {
  OpDashPlanInput,
  PlanFuelSummary,
  buildPlanFuelEventSeries,
  buildPlanFuelSummaries,
} from '../../../utils/plan-fuel.util';

const CHART_PRIMARY = '#10b981';
const CHART_PRIMARY_DARK = '#059669';
const CHART_PRIMARY_LIGHT = '#34d399';
const CHART_TEXT = '#334155';
const CHART_GRID = '#e2e8f0';

Chart.register(...registerables);

@Component({
  selector: 'app-op-dash-panel',
  imports: [ChartModule],
  templateUrl: './op-dash-panel.component.html',
  styleUrl: './op-dash-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpDashPanelComponent implements OnChanges, AfterViewInit {
  @Input({ required: true }) plans: OpDashPlanInput[] = [];
  @Input({ required: true }) routeEvents: RouteEvent[] = [];

  @Output() planSelect = new EventEmitter<{
    planKey: string;
    planeName: string;
    startingDate: Date | null;
  }>();

  @ViewChild('barChart') private barChart?: UIChart;
  @ViewChild('lineChart') private lineChart?: UIChart;

  private readonly cdr = inject(ChangeDetectorRef);

  selectedPlanKey: string | null = null;
  selectedPlanName = '';
  barChartData: { labels: string[]; datasets: unknown[] } | null = null;
  lineChartData: Record<string, unknown> | null = null;
  lineChartPlugins: unknown[] = [];
  private lineConsumptionLabels: string[] = [];

  readonly barChartOptions = {
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: { parsed: { y: number } }) =>
            `Total fuel: ${context.parsed.y} L`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: CHART_TEXT },
        grid: { color: CHART_GRID },
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Fuel (L)',
          color: CHART_TEXT,
        },
        ticks: { color: CHART_TEXT },
        grid: { color: CHART_GRID },
      },
    },
    onHover: (event: { native?: { target?: { style?: { cursor?: string } } } }, elements: unknown[]) => {
      if (event.native?.target?.style) {
        event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      }
    },
  };

  readonly lineChartOptions = {
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: { parsed: { y: number }; dataIndex: number }) => {
            const consumption = this.lineConsumptionLabels[context.dataIndex] ?? '0';
            return [`Fuel left: ${context.parsed.y} L`, `Consumed: ${consumption} L`];
          },
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Events',
          color: CHART_TEXT,
        },
        ticks: { color: CHART_TEXT },
        grid: { color: CHART_GRID },
      },
      y: {
        beginAtZero: true,
        max: FUEL_CAPACITY_LITERS,
        title: {
          display: true,
          text: 'Fuel remaining (L)',
          color: CHART_TEXT,
        },
        ticks: { color: CHART_TEXT },
        grid: { color: CHART_GRID },
      },
    },
  };

  private summaries: PlanFuelSummary[] = [];

  ngAfterViewInit(): void {
    this.scheduleChartRefresh();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['plans'] || changes['routeEvents']) {
      this.rebuildBarChart();
      if (this.selectedPlanKey) {
        this.rebuildLineChart(this.selectedPlanKey);
      }
      this.cdr.markForCheck();
      this.scheduleChartRefresh();
    }
  }

  onBarSelect(event: { element?: { index?: number } }): void {
    const index = event.element?.index;
    if (index === undefined || !this.summaries[index]) {
      return;
    }

    const summary = this.summaries[index];
    const plan = this.plans.find((entry) => entry.key === summary.planKey);

    this.selectedPlanKey = summary.planKey;
    this.selectedPlanName = summary.planeName;
    this.planSelect.emit({
      planKey: summary.planKey,
      planeName: summary.planeName,
      startingDate: plan?.startingDate ? new Date(plan.startingDate) : null,
    });
    this.rebuildBarChart();
    this.rebuildLineChart(summary.planKey);
    this.cdr.markForCheck();
    this.scheduleChartRefresh();
  }

  private rebuildBarChart(): void {
    this.summaries = buildPlanFuelSummaries(this.plans);

    if (this.summaries.length === 0) {
      this.barChartData = null;
      this.selectedPlanKey = null;
      this.selectedPlanName = '';
      this.lineChartData = null;
      return;
    }

    const backgroundColors = this.summaries.map((summary) =>
      summary.planKey === this.selectedPlanKey ? CHART_PRIMARY_DARK : CHART_PRIMARY
    );

    this.barChartData = {
      labels: this.summaries.map((summary) => summary.planeName),
      datasets: [
        {
          label: 'Total fuel (L)',
          data: this.summaries.map((summary) => summary.totalFuelLiters),
          backgroundColor: backgroundColors,
          borderColor: CHART_PRIMARY_DARK,
          borderWidth: 1,
          hoverBackgroundColor: CHART_PRIMARY_LIGHT,
        },
      ],
    };
  }

  private rebuildLineChart(planKey: string): void {
    const plan = this.plans.find((entry) => entry.key === planKey);
    if (!plan) {
      this.lineChartData = null;
      this.lineChartPlugins = [];
      return;
    }

    const series = buildPlanFuelEventSeries(plan, this.routeEvents);
    this.lineConsumptionLabels = series.map((point) => String(point.segmentFuelLiters));

    this.lineChartData = {
      labels: series.map((point) => point.label),
      datasets: [
        {
          label: 'Fuel remaining (L)',
          data: series.map((point) => point.fuelRemainingLiters),
          borderColor: CHART_PRIMARY,
          backgroundColor: 'rgba(16, 185, 129, 0.12)',
          fill: true,
          tension: 0.25,
          pointBackgroundColor: CHART_PRIMARY_DARK,
          pointBorderColor: '#ffffff',
          pointRadius: 5,
          pointHoverRadius: 7,
        },
      ],
    };

    this.lineChartPlugins = [this.buildConsumptionLabelPlugin(this.lineConsumptionLabels)];
    this.scheduleChartRefresh();
  }

  private scheduleChartRefresh(): void {
    setTimeout(() => {
      this.barChart?.refresh();
      this.lineChart?.refresh();
    });
  }

  private buildConsumptionLabelPlugin(labels: string[]) {
    return {
      id: 'consumptionPointLabels',
      afterDatasetsDraw: (chart: {
        ctx: CanvasRenderingContext2D;
        data: { datasets: { data: number[] }[] };
        getDatasetMeta: (index: number) => { data: { x: number; y: number }[] };
      }) => {
        const meta = chart.getDatasetMeta(0);
        const values = chart.data.datasets[0]?.data ?? [];

        chart.ctx.save();
        chart.ctx.font = 'bold 10px sans-serif';
        chart.ctx.fillStyle = CHART_PRIMARY_DARK;
        chart.ctx.textAlign = 'center';

        meta.data.forEach((point, index) => {
          const consumption = labels[index];
          if (!consumption || consumption === '0' || values[index] === undefined) {
            return;
          }

          chart.ctx.fillText(`${consumption}L`, point.x, point.y - 10);
        });

        chart.ctx.restore();
      },
    };
  }
}
