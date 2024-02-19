import DOMPurify from "dompurify";
import { scaleLinear, scaleLog } from "d3-scale";
import { min, max } from "d3-array";

import { BreakdownType, Browser } from "./Browser";
import { i18n } from "./i18n";
import { Config } from "./Config";

import { Block } from "./Block";
import { Record } from "./Record";
import { Base } from "./Base";
import { Filter } from "./Filter";

import { Aggregate } from "./Aggregate";
import { Aggregate_NoValue } from "./Aggregate_NoValue";

import { AttribTemplate } from "./AttribTemplate";

import {
  BlockSpec,
  BlockType as AttribType,
  CompareType,
  LinearOrLog,
  MeasurableConfig,
  MeasureType,
  MetricFunc,
  RecordVisCoding,
  SummaryConfig,
  SummarySpec,
  MeasureFunc,
  NumberRange,
} from "./Types";
import { Attrib_Numeric } from "./Attrib_Numeric";

const d3 = {
  scaleLinear,
  scaleLog,
  min,
  max,
};

/** -- */
export abstract class Attrib {
  // ********************************************************************
  // Basic
  // ********************************************************************
  public readonly browser: Browser;
  public readonly type: AttribType;

  // Each attribute is assigned a unique number.
  // This number is not stable - any browser config change may change this.
  public readonly attribID: number;

  // The associated block (view) - null by default
  protected _block: Block = null;
  public get block(): Block {
    return this._block;
  }

  // ********************************************************************
  // Template system
  // ********************************************************************

  public template: AttribTemplate = null;
  applyTemplateSpecial(): void {}

  // ********************************************************************
  // Aggregation
  // ********************************************************************

  public _aggrs: Aggregate[] = [];
  public readonly noValueAggr: Aggregate_NoValue;
  public aggr_initialized: boolean = false;

  abstract initializeAggregates(): void;

  isEmpty() {
    if (this._aggrs.length === 0) return true;
    return this._aggrs.every((aggr: Aggregate) => aggr.records.length === 0);
  }

  // ********************************************************************
  // Filtering
  // ********************************************************************

  // The filter used to filter records. May be null
  public summaryFilter: Filter | null = null;
  isFiltered(): boolean {
    return this.summaryFilter?.isFiltered ?? false;
  }
  // cen be extended by sub-classes
  createSummaryFilter(): void {}

  // ********************************************************************
  // Other attributes (parent/derivative/child)
  // ********************************************************************

  // may have multiple derivatives, indexed by string keys
  public derivatives?: { [index: string]: Attrib } = {};

  // may have a single parent attribute
  protected _parent: Attrib = null;
  get parent(): Attrib {
    return this._parent || this.template?.parent;
  }

  // overwritten by numeric summary
  hasTimeSeriesParent(): boolean {
    return false;
  }

  createDerivedAttrib(_special: string, name: string = null) {
    if (this.derivatives[_special]) return;
    this.derivatives[_special] = this.browser.createAttrib(
      name || `${this.attribName}->${_special.replace("()", "")}`,
      `${this.template}->${_special}`
    );
    this.browser.refreshAttribList();
  }

  // ********************************************************************
  // Name (path, html formatted strings, etc.)
  // ********************************************************************

  // the string representation of the name. May include a path/group
  private _attribName: string = null;
  // aka blockName
  get attribName(): string {
    return this._attribName;
  }
  get printName(): string {
    return this._attribName.split("->").pop();
  }
  // name without last key item
  get pathName(): string[] {
    return this._attribName.split("->").slice(0, -1); // removes last item
  }
  // specialized method to consider/change behavior if with timeseries parent
  get groupPath() {
    return this.pathName;
  }
  get attribNameHTML() {
    return `<span class='blockName_Path ${
      this.pathName.length ? "visible" : ""
    }'>${this.pathName
      .map(
        (_) =>
          `<span class='groupName'>${_}</span><span class='fa fa-caret-right'></span>`
      )
      .join("")}</span><span class='blockName_Print'>${this.printName}</span>`;
  }
  set attribName(newName: string) {
    let curName = this._attribName;

    if (curName === newName) return;

    if (this.browser.attribWithName(newName)) return;

    this.browser.removeAttribFromGroupIndex(this); // remove it from previous newName index

    this._attribName = newName;

    this.browser.insertAttribIntoGroupIndex(this);

    this.browser.refreshAttribList();

    this.block?.refreshSummaryName_DOM();

    if (this.summaryFilter?.breadcrumb?.DOM) {
      this.addDOMBlockName(
        this.summaryFilter.breadcrumb.DOM.select(".crumbHeader")
      );
    }
  }

  // ********************************************************************
  // Description
  // ********************************************************************

  // The description of the variable or content block
  private _description: string = "";
  get description(): string {
    if (!this._description && this._parent) return this._parent.description;
    return this._description;
  }
  set description(v: string) {
    this._description = DOMPurify.sanitize(v, {}) || null;
    this.block?.updateDescription();
  }

  // ********************************************************************
  // Configuration objects TODO review
  // ********************************************************************

  public configs: { [key: string]: Config<any> } = {};
  refreshConfigs() {
    Object.values(this.configs).forEach((cfg) => cfg.refresh());
  }

  // ********************************************************************
  // ********************************************************************

  public readonly isComparable: Config<boolean>;

  /** -- */
  isIDAttrib() {
    return this.browser.idSummaryName === this.attribName;
  }
  isComparedAttrib() {
    return this === this.browser.comparedAttrib;
  }
  autoCompare(): void {}

  // TODO review
  public _metricFuncs: MetricFunc[] = Base.defaultMetricFuncs;
  get canHaveMetricFuncs() {
    return false;
  }
  get supportedMetricFuncs() {
    return []; // none supported by default
  }

  /** -- */
  addSupportedMetricFunc(t: MetricFunc) {
    if (this._metricFuncs.includes(t)) return;
    this._metricFuncs.push(t);
    this.browser.measureSummary.refresh();
  }
  /** -- */
  removeSupportedMetricFunc(t: MetricFunc) {
    if (!this._metricFuncs.includes(t)) return; // not included already
    this._metricFuncs = this._metricFuncs.filter((_) => _ != t);
    if (
      this.attribID === this.measureSummary?.attribID &&
      this.browser.measureFunc.is(t)
    ) {
      this.browser.measureFunc.set("Count");
      this.browser.measureFunc.refresh();
    } else {
      this.browser.measureSummary.refresh(); // drop-down options refresh
    }
  }

  // ********************************************************************
  // ********************************************************************

  // used to add class name to UI
  public readonly blockClassName: string;
  public readonly nuggetClassName: string;

  // Does not support record encoding by default, can be extended
  supportsRecordEncoding(_coding: RecordVisCoding): boolean {
    return false;
  }

  // ********************************************************************
  // Record value access
  // ********************************************************************

  getRecordValue(record: Record) {
    return record.getValue(this);
  }
  setRecordValueCacheToMissing(record) {
    // TO-DO: Remove record from its existing aggregate for this summary
    record.setValue(this, null);
    this.noValueAggr.addRecord(record);
  }

  getFormattedValue(_v, _isSVG): string {
    return "";
  }
  renderRecordValue(_v, _d3_selection): string {
    return "";
  }

  // ********************************************************************
  // ********************************************************************

  constructor(
    browser: Browser,
    name: string,
    template: AttribTemplate = null,
    _type: AttribType,
    blockClassName: string = "",
    nuggetClassName: string = ""
  ) {
    this.browser = browser;
    this._attribName = name;
    this.type = _type;

    this.attribID = this.browser.attribCounter++;
    this.blockClassName = blockClassName;
    this.nuggetClassName = nuggetClassName;

    this.browser.attribs.push(this);

    if (template instanceof AttribTemplate) {
      this.template = template;
    } else {
      this.template = new AttribTemplate(name, this.browser);
    }

    this.noValueAggr = new Aggregate_NoValue(this);
    this.browser.allAggregates.push(this.noValueAggr);

    this.isComparable = new Config<boolean>({
      parent: this,
      cfgClass: "isComparable",
      cfgTitle: "Select-Compare",
      UI: { disabled: true },
      default: true,
      itemOptions: [
        { name: "Enabled", value: true },
        { name: "Disabled", value: false },
      ],
      onSet: (v) => {
        if (!v) {
          // if not comparable, cannot be used to sum/avg data
          this._metricFuncs = [];
        }
        if (!v && this.isComparedAttrib()) {
          this.browser.clearSelect_Compare(this.browser.activeComparisons);
        }
        this.block?.DOM.root?.classed("disableCompareLock", !v);
      },
    });

    this.measureScaleType = new Config<LinearOrLog>({
      cfgClass: "measureScaleType",
      cfgTitle: "Axis Scale",
      parent: this,
      UISeperator: {
        title: "Axis",
      },
      default: "linear",
      iconClass: "fa fa-chart-line",
      helparticle: "5e88d63f04286364bc97d40b",
      itemOptions: [
        {
          name: i18n.Linear + " " + i18n.LinearSequence,
          value: "linear",
        },
        { name: i18n.Log + " " + i18n.Log10Sequence, value: "log" },
      ],
      forcedValue: () => {
        if (this.stackedCompare) return "linear";
        if (this.percentBreakdown) return "linear";
        if (this.browser.measureSumWithNegativeValues()) return "linear";
      },
      onSet: (v) => {
        this.refreshChartScale_Measure(v);
        this.block?.refreshViz_All();
      },
    });

    this.axisScaleType = new Config<"fit" | "sync" | "full">({
      cfgClass: "axisScaleType",
      cfgTitle: "Axis Extent",
      default: "fit",
      parent: this,
      iconClass: "fa fa-chart-line",
      helparticle: "5e893b562c7d3a7e9aea656e",
      itemOptions: [
        { name: "Fit", value: "fit" },
        { name: "Sync", value: "sync" },
        { name: "Full", value: "full" },
      ],
      forcedValue: () => {
        if (this.percentBreakdown && !this.browser.isCompared()) {
          return "fit";
        }
        if (
          this.browser.measureFunc_Avg &&
          this.axisScaleType._value === "full"
        ) {
          return "fit";
        }
      },
      onSet: () => {
        if (!this.aggr_initialized) return;
        this.updateChartScale_Measure(true);
        this.block?.refreshViz_All();
      },
    });
  }

  finishTemplateSpecial() {
    if (this.template.special) {
      // add to parent's derivatives automatically
      if (this.template.parent) {
        this.template.parent.derivatives[this.template.special] = this;
      }
      // customizations per attribute class.
      this.applyTemplateSpecial();
    }
  }

  destroy(): void {
    this.browser.destroyAttrib(this);
  }

  /** Utility method to inject HTML into DOM */
  addDOMBlockName(DOM): void {
    DOM.html(this.attribNameHTML);

    DOM.select(".blockName_Path")
      .tooltip(i18n["Show/Hide Path"])
      .on("click", (event) => {
        event.currentTarget.classList.toggle("visible");
        event.stopPropagation();
      });
  }

  // ********************************************************************
  // ********************************************************************

  // Shorthand access
  get records(): Record[] {
    return this.browser.records;
  }
  get breakdownMode(): BreakdownType {
    return this.browser.breakdownMode.get();
  }
  get relativeBreakdown(): boolean {
    return this.browser.relativeBreakdown;
  }
  get absoluteBreakdown(): boolean {
    return this.browser.absoluteBreakdown;
  }
  get dependentBreakdown(): boolean {
    return this.browser.dependentBreakdown;
  }
  get totalBreakdown(): boolean {
    return this.browser.totalBreakdown;
  }
  get percentBreakdown(): boolean {
    return this.browser.percentBreakdown;
  }
  get stackedCompare(): boolean {
    return this.browser.stackedCompare.is(true);
  }
  vizActive(key: CompareType): boolean {
    return this.browser.vizActive(key);
  }
  get measureFunc(): MeasureFunc {
    return this.browser.measureFunc.get();
  }
  get activeComparisons(): CompareType[] {
    return this.browser.activeComparisons;
  }
  get activeComparisonsCount(): number {
    return this.browser.activeComparisonsCount;
  }
  get measureSummary(): Attrib_Numeric {
    return this.browser.measureSummary.get();
  }

  // ********************************************************************
  // ********************************************************************

  public readonly measureScaleType: Config<LinearOrLog>;

  public chartScale_Measure_prev: any;
  public chartScale_Measure: any;

  abstract get measureRangeMax(): number;

  /** -- */
  get measureScale_Log(): boolean {
    return this.measureScaleType.is("log");
  }
  /** -- */
  get measureScale_Linear(): boolean {
    return this.measureScaleType.is("linear");
  }
  /** -- */
  get measureExtent_Self(): NumberRange {
    var maxMeasureValue = this.getPeakAggr(d3.max);

    var minMeasureValue = 0;
    if (this.absoluteBreakdown && this.browser.measureSumWithNegativeValues()) {
      minMeasureValue = Math.min(this.getPeakAggr(d3.min), 0); // just making sure it cannot be > 0
    }

    // if using log scale, minimum value cannot be zero or negative
    if (this.measureScale_Log && minMeasureValue <= 0) {
      minMeasureValue = Math.max(1, minMeasureValue);
    }

    // If min/max domain is set to zero, d3 puts zero-value in the middle of the range. prevent
    if (maxMeasureValue === 0 && minMeasureValue === 0) {
      maxMeasureValue = 0.001;
    }

    return [minMeasureValue, maxMeasureValue];
  }

  public readonly axisScaleType: Config<"fit" | "sync" | "full">;

  /** -- */
  get measureDomain_Final() {
    if (!this.block?.panel) {
      return this.measureExtent_Self;
    }

    if (this.axisScaleType.is("fit")) {
      return this.measureExtent_Self;
    }

    if (this.axisScaleType.is("full")) {
      if (this.absoluteBreakdown) {
        return [0, this.browser.allRecordsAggr.measure("Active")];
      } else {
        return [0, 100];
      }
    }

    if (this.axisScaleType.is("sync")) {
      return this.block?.panel.syncedMeasureExtent;
    }

    // fallback, just in case
    return this.measureExtent_Self;
  }

  public measureLogBase = 10;

  refreshChartScale_Measure(v = null) {
    v ??= this.measureScaleType.get();

    this.chartScale_Measure_prev =
      this.chartScale_Measure?.copy().clamp(false) ?? null;

    this.measureLogBase = 10;
    this.chartScale_Measure =
      v === "log" ? d3.scaleLog().base(this.measureLogBase) : d3.scaleLinear();
    this.chartScale_Measure.clamp(true);

    if (this.chartScale_Measure_prev) {
      var domain = this.chartScale_Measure_prev.domain();
      if (this.measureScale_Log) {
        if (domain[0] === 0) domain[0] = 1;
      } else {
        domain[0] = Math.min(0, domain[0]);
      }

      this.chartScale_Measure
        .domain(domain)
        .range(this.chartScale_Measure_prev.range()); // same range
    }
  }

  /** -- */
  updateChartScale_Measure(skipRefreshViz = false): void {
    if (!this.aggr_initialized || this.isEmpty()) {
      return; // nothing to do
    }

    this.chartScale_Measure_prev =
      this.chartScale_Measure?.copy().clamp(false) ?? null;

    var newDomain = this.measureDomain_Final;

    if (this.measureScale_Log && newDomain[0] === 0) {
      newDomain[0] = 1;
    }

    var hideActive = false;
    if (this.relativeBreakdown && this.browser.activeComparisonsCount > 0) {
      hideActive = newDomain[1] !== 100;
    }
    this.block?.DOM.root?.classed("hideActive", hideActive);

    this.chartScale_Measure.domain(newDomain).range([0, this.measureRangeMax]);

    if (!skipRefreshViz && this.chartScale_Measure_prev) {
      var oldDomain = this.chartScale_Measure_prev.domain();
      if (
        newDomain[0] !== oldDomain[0] ||
        newDomain[1] !== oldDomain[1] ||
        this.measureRangeMax !== this.chartScale_Measure_prev.range()[1]
      ) {
        this.block?.refreshViz_All();
      }
    }
  }

  // returns the maximum active aggregate value per row in chart data
  // peakFunc is d3.min or d3.max
  getPeakAggr(peakFunc, sT: MeasureType = null) {
    if (this.isEmpty()) return 0;

    if (typeof sT === "string") {
      return peakFunc(this._aggrs, (aggr: Aggregate) =>
        aggr.usedAggr ? this.browser.getChartValue(aggr, sT) : null
      );
    }

    // No comparisons. Max aggregate will be that of the active
    if (this.activeComparisonsCount === 0) {
      return this.getPeakAggr(peakFunc, "Active");
    }

    // Active will be max if visible & using count or positive-sum's
    if (
      (this.absoluteBreakdown || this.totalBreakdown) &&
      this.browser.showWholeAggr.is(true) &&
      this.browser.measureWithPositiveValues()
    ) {
      return this.getPeakAggr(peakFunc, "Active");
    }

    var activeComparisons = this.activeComparisons;
    if (this.browser.stackedChart) {
      // cannot add up separate maximums per selection, it needs to be accumulated per aggregate
      return peakFunc(this._aggrs, (aggr) =>
        aggr.usedAggr
          ? activeComparisons.reduce(
              (accum, sT) => accum + this.browser.getChartValue(aggr, sT),
              0
            )
          : null
      );
    } else {
      // pick the peak of all comparisons
      return peakFunc(
        activeComparisons.map((sT) => this.getPeakAggr(peakFunc, sT))
      );
    }
  }

  // ********************************************************************
  // Measurable configuration
  // ********************************************************************

  measurable: MeasurableConfig = null;

  // only sets it if the attribute has/is "measurable"
  set unitName(v: string) {
    if (this.measurable) {
      this.measurable.unitName = v;
      this.browser.recordDisplay.View?.refreshAttribUnitName(this);
    }
  }
  get unitName(): string {
    return this.measurable?.unitName || "";
  }
  get valueDomain(): [number, number] {
    return this.measurable?.valueDomain || null;
  }
  get metricFuncs(): MetricFunc[] {
    return this.measurable?.metricFuncs || Base.defaultMetricFuncs;
  }

  // ....
  get isMultiValued() {
    return false;
  }

  // ********************************************************************
  // Export & apply config
  // ********************************************************************

  /** -- */
  async applyConfig(blockCfg: SummarySpec) {
    if (blockCfg.noNugget) {
      this.browser.removeAttribFromGroupIndex(this);
    }

    if (blockCfg.isComparable === false) {
      await this.isComparable.set(false);
    }

    if (blockCfg.metricFuncs) {
      this._metricFuncs = blockCfg.metricFuncs;
    }

    await this.axisScaleType.set(blockCfg.axisScaleType);

    this.block?.setCollapsed(blockCfg.collapsed === true);
    this.description = blockCfg.description;

    this.initializeAggregates();
  }

  isExportable(): boolean {
    return true;
  }

  /** -- */
  exportConfig() {
    var cfg1: BlockSpec = {
      name: this._attribName,
      panel: this.block?.panel?.name || "none",
      description: this.description || undefined,
      collapsed: this.block?.collapsed,
      type: this.type,
      // TODO: nonugget
    };

    var cfg2: SummaryConfig = {
      value: this.template.str !== cfg1.name ? this.template.str : undefined,
      axisScaleType: this.axisScaleType.exportValue(),
      measureScaleType: this.measureScaleType.exportValue(),
      isComparable: this.isComparable.exportValue(),
      ...this.measurable,
    };

    return Object.assign({}, cfg1, cfg2);
  }
}
