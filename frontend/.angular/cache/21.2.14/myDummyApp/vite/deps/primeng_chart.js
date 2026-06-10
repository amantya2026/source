import {
  Chart,
  registerables
} from "./chunk-B4A5MMGX.js";
import {
  BaseComponent
} from "./chunk-HFZ3IEIT.js";
import {
  Bind,
  BindModule
} from "./chunk-RTWT2CPK.js";
import {
  BaseStyle
} from "./chunk-7DJM2MRT.js";
import {
  SharedModule
} from "./chunk-T3AZFDUA.js";
import "./chunk-I6IMDBTQ.js";
import {
  CommonModule,
  isPlatformBrowser
} from "./chunk-7DXWZMBZ.js";
import "./chunk-INDBPLAG.js";
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Injectable,
  InjectionToken,
  Input,
  NgModule,
  NgZone,
  Output,
  ViewEncapsulation,
  booleanAttribute,
  inject,
  setClassMetadata,
  ɵɵHostDirectivesFeature,
  ɵɵInheritDefinitionFeature,
  ɵɵProvidersFeature,
  ɵɵattribute,
  ɵɵclassMap,
  ɵɵdefineComponent,
  ɵɵdefineInjectable,
  ɵɵdefineInjector,
  ɵɵdefineNgModule,
  ɵɵdirectiveInject,
  ɵɵelementEnd,
  ɵɵelementStart,
  ɵɵgetInheritedFactory,
  ɵɵlistener,
  ɵɵproperty,
  ɵɵstyleMap
} from "./chunk-V2ELB54K.js";
import "./chunk-WDMUDEB6.js";

// node_modules/chart.js/auto/auto.js
Chart.register(...registerables);
var auto_default = Chart;

// node_modules/primeng/fesm2022/primeng-chart.mjs
var inlineStyles = {
  root: ({
    instance
  }) => ({
    display: "block",
    position: "relative",
    width: instance.width,
    height: instance.height
  })
};
var classes = {
  root: "p-chart"
};
var ChartStyle = class _ChartStyle extends BaseStyle {
  name = "chart";
  classes = classes;
  inlineStyles = inlineStyles;
  static ɵfac = /* @__PURE__ */ (() => {
    let ɵChartStyle_BaseFactory;
    return function ChartStyle_Factory(__ngFactoryType__) {
      return (ɵChartStyle_BaseFactory || (ɵChartStyle_BaseFactory = ɵɵgetInheritedFactory(_ChartStyle)))(__ngFactoryType__ || _ChartStyle);
    };
  })();
  static ɵprov = ɵɵdefineInjectable({
    token: _ChartStyle,
    factory: _ChartStyle.ɵfac
  });
};
(() => {
  (typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(ChartStyle, [{
    type: Injectable
  }], null, null);
})();
var ChartClasses;
(function(ChartClasses2) {
  ChartClasses2["root"] = "p-chart";
})(ChartClasses || (ChartClasses = {}));
var CHART_INSTANCE = new InjectionToken("CHART_INSTANCE");
var UIChart = class _UIChart extends BaseComponent {
  el;
  zone;
  componentName = "Chart";
  $pcChart = inject(CHART_INSTANCE, {
    optional: true,
    skipSelf: true
  }) ?? void 0;
  bindDirectiveInstance = inject(Bind, {
    self: true
  });
  onAfterViewChecked() {
    this.bindDirectiveInstance.setAttrs(this.ptms(["host", "root"]));
  }
  /**
   * Type of the chart.
   * @group Props
   */
  type;
  /**
   * Array of per-chart plugins to customize the chart behaviour.
   * @group Props
   */
  plugins = [];
  /**
   * Width of the chart.
   * @group Props
   */
  width;
  /**
   * Height of the chart.
   * @group Props
   */
  height;
  /**
   * Whether the chart is redrawn on screen size change.
   * @group Props
   */
  responsive = true;
  /**
   * Used to define a string that autocomplete attribute the current element.
   * @group Props
   */
  ariaLabel;
  /**
   * Establishes relationships between the component and label(s) where its value should be one or more element IDs.
   * @group Props
   */
  ariaLabelledBy;
  /**
   * Data to display.
   * @group Props
   */
  get data() {
    return this._data;
  }
  set data(val) {
    this._data = val;
    this.reinit();
  }
  /**
   * Options to customize the chart.
   * @group Props
   */
  get options() {
    return this._options;
  }
  set options(val) {
    this._options = val;
    this.reinit();
  }
  /**
   * Callback to execute when an element on chart is clicked.
   * @group Emits
   */
  onDataSelect = new EventEmitter();
  isBrowser = false;
  initialized;
  _data;
  _options = {};
  chart;
  _componentStyle = inject(ChartStyle);
  constructor(el, zone) {
    super();
    this.el = el;
    this.zone = zone;
  }
  onAfterViewInit() {
    this.initChart();
    this.initialized = true;
  }
  onCanvasClick(event) {
    if (this.chart) {
      const element = this.chart.getElementsAtEventForMode(event, "nearest", {
        intersect: true
      }, false);
      const dataset = this.chart.getElementsAtEventForMode(event, "dataset", {
        intersect: true
      }, false);
      if (element && element[0] && dataset) {
        this.onDataSelect.emit({
          originalEvent: event,
          element: element[0],
          dataset
        });
      }
    }
  }
  initChart() {
    if (isPlatformBrowser(this.platformId)) {
      let opts = this.options || {};
      opts.responsive = this.responsive;
      if (opts.responsive && (this.height || this.width)) {
        opts.maintainAspectRatio = false;
      }
      this.zone.runOutsideAngular(() => {
        this.chart = new auto_default(this.el.nativeElement.children[0], {
          type: this.type,
          data: this.data,
          options: this.options,
          plugins: this.plugins
        });
      });
    }
  }
  getCanvas() {
    return this.el.nativeElement.children[0];
  }
  getBase64Image() {
    return this.chart.toBase64Image();
  }
  generateLegend() {
    if (this.chart) {
      return this.chart.generateLegend();
    }
  }
  refresh() {
    if (this.chart) {
      this.chart.update();
    }
  }
  reinit() {
    if (this.chart) {
      this.chart.destroy();
      this.initChart();
    }
  }
  onDestroy() {
    if (this.chart) {
      this.chart.destroy();
      this.initialized = false;
      this.chart = null;
    }
  }
  static ɵfac = function UIChart_Factory(__ngFactoryType__) {
    return new (__ngFactoryType__ || _UIChart)(ɵɵdirectiveInject(ElementRef), ɵɵdirectiveInject(NgZone));
  };
  static ɵcmp = ɵɵdefineComponent({
    type: _UIChart,
    selectors: [["p-chart"]],
    hostVars: 4,
    hostBindings: function UIChart_HostBindings(rf, ctx) {
      if (rf & 2) {
        ɵɵstyleMap(ctx.sx("root"));
        ɵɵclassMap(ctx.cx("root"));
      }
    },
    inputs: {
      type: "type",
      plugins: "plugins",
      width: "width",
      height: "height",
      responsive: [2, "responsive", "responsive", booleanAttribute],
      ariaLabel: "ariaLabel",
      ariaLabelledBy: "ariaLabelledBy",
      data: "data",
      options: "options"
    },
    outputs: {
      onDataSelect: "onDataSelect"
    },
    features: [ɵɵProvidersFeature([ChartStyle, {
      provide: CHART_INSTANCE,
      useExisting: _UIChart
    }]), ɵɵHostDirectivesFeature([Bind]), ɵɵInheritDefinitionFeature],
    decls: 1,
    vars: 5,
    consts: [["role", "img", 3, "click", "pBind"]],
    template: function UIChart_Template(rf, ctx) {
      if (rf & 1) {
        ɵɵelementStart(0, "canvas", 0);
        ɵɵlistener("click", function UIChart_Template_canvas_click_0_listener($event) {
          return ctx.onCanvasClick($event);
        });
        ɵɵelementEnd();
      }
      if (rf & 2) {
        ɵɵproperty("pBind", ctx.ptm("canvas"));
        ɵɵattribute("aria-label", ctx.ariaLabel)("aria-labelledby", ctx.ariaLabelledBy)("width", ctx.responsive && !ctx.width ? null : ctx.width)("height", ctx.responsive && !ctx.height ? null : ctx.height);
      }
    },
    dependencies: [CommonModule, SharedModule, BindModule, Bind],
    encapsulation: 2,
    changeDetection: 0
  });
};
(() => {
  (typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(UIChart, [{
    type: Component,
    args: [{
      selector: "p-chart",
      standalone: true,
      imports: [CommonModule, SharedModule, BindModule],
      template: `
        <canvas
            role="img"
            [attr.aria-label]="ariaLabel"
            [attr.aria-labelledby]="ariaLabelledBy"
            [attr.width]="responsive && !width ? null : width"
            [attr.height]="responsive && !height ? null : height"
            (click)="onCanvasClick($event)"
            [pBind]="ptm('canvas')"
        ></canvas>
    `,
      changeDetection: ChangeDetectionStrategy.OnPush,
      encapsulation: ViewEncapsulation.None,
      host: {
        "[class]": "cx('root')",
        "[style]": "sx('root')"
      },
      providers: [ChartStyle, {
        provide: CHART_INSTANCE,
        useExisting: UIChart
      }],
      hostDirectives: [Bind]
    }]
  }], () => [{
    type: ElementRef
  }, {
    type: NgZone
  }], {
    type: [{
      type: Input
    }],
    plugins: [{
      type: Input
    }],
    width: [{
      type: Input
    }],
    height: [{
      type: Input
    }],
    responsive: [{
      type: Input,
      args: [{
        transform: booleanAttribute
      }]
    }],
    ariaLabel: [{
      type: Input
    }],
    ariaLabelledBy: [{
      type: Input
    }],
    data: [{
      type: Input
    }],
    options: [{
      type: Input
    }],
    onDataSelect: [{
      type: Output
    }]
  });
})();
var ChartModule = class _ChartModule {
  static ɵfac = function ChartModule_Factory(__ngFactoryType__) {
    return new (__ngFactoryType__ || _ChartModule)();
  };
  static ɵmod = ɵɵdefineNgModule({
    type: _ChartModule,
    imports: [UIChart, SharedModule],
    exports: [UIChart, SharedModule]
  });
  static ɵinj = ɵɵdefineInjector({
    imports: [UIChart, SharedModule, SharedModule]
  });
};
(() => {
  (typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(ChartModule, [{
    type: NgModule,
    args: [{
      imports: [UIChart, SharedModule],
      exports: [UIChart, SharedModule]
    }]
  }], null, null);
})();
export {
  ChartClasses,
  ChartModule,
  ChartStyle,
  UIChart
};
//# sourceMappingURL=primeng_chart.js.map
