import { format } from "d3-format";
import { deviation } from "d3-array";

import { Aggregate_Interval_Numeric } from "./Aggregate_Interval";

import { Attrib_Interval } from "./Attrib_Interval";
import { Attrib_Timeseries } from "./Attrib_Timeseries";
import { TimeKey } from "./TimeSeriesData";

import { Block_Numeric } from "./Block_Numeric";
import { LinearOrLog, RecordVisCoding, SummarySpec } from "./Types";
import { Browser } from "./Browser";
import { Config } from "./Config";
import { i18n } from "./i18n";
import { Util } from "./Util";
import { Base } from "./Base";

const d3 = { format, deviation };

export class Attrib_Numeric extends Attrib_Interval<number> {
  protected _block: Block_Numeric;
  public get block(): Block_Numeric {
    return this._block;
  }

  hasTimeSeriesParent(): boolean {
    return this.parent?.type === "timeseries";
  }

  get timeseriesParent(): Attrib_Timeseries | null {
    return this.parent?.type === "timeseries"
      ? (this.parent as unknown as Attrib_Timeseries)
      : null;
  }

  // specialized method to consider/change behavior if with timeseries parent
  get groupPath() {
    return this.timeseriesParent?.attribName.split("->") || this.pathName;
  }
  
  readonly valueScaleType: Config<LinearOrLog | "auto">;

  // has floating numbers as data points

  private tickPrecision = 3;

  autoScaleType: LinearOrLog | null = null;

  constructor(browser: Browser, name: string, template: any) {
    super(
      browser,
      name,
      template,
      "numeric",
      "kshfSummary_Numeric",
      "far fa-hashtag"
    );

    this._block = new Block_Numeric(this);

    this.measurable = {
      metricFuncs: Base.defaultMetricFuncs,
    };

    this.valueScaleType = new Config<LinearOrLog | "auto">({
      cfgClass: "valueScaleType",
      cfgTitle: "BinScale",
      iconClass: "fa fa-arrows-h",
      parent: this,
      default: "auto",
      helparticle: "5e87eabc04286364bc97d0cf",
      itemOptions: [
        { name: "Auto", value: "auto" },
        { name: i18n.Linear + " " + i18n.LinearSequence, value: "linear" },
        { name: i18n.Log + " " + i18n.Log2Sequence, value: "log" },
      ],
      forcedValue: () => {
        if (this.timeseriesParent) return this.timeseriesParent.valueScaleType.get();
        if (this.stepTicks) return "linear";
        if (!this.supportsLogScale()) return "linear";
        if (this.valueScaleType._value === "auto") return this.autoScaleType;
      },
      onSet: async () => {
        if(!this.aggr_initialized) return;
        this.block.noRefreshVizAxis = true;
        await this.applyScaleType();
        this.block.noRefreshVizAxis = false;

        await this.browser.recordDisplay?.refreshAttribScaleType(this);
      },
    });

    this.finishTemplateSpecial();

    // TODO: maintain good order for UI, delete showHistogram index and add it at appropriate position
  }

  createAggregate(minV: number, maxV: number){
    return new Aggregate_Interval_Numeric(this, minV, maxV);
  }

  // ********************************************************************
  // Range and Scale...
  // ********************************************************************

  get isValueScale_Log() {
    return this.valueScaleType.is("log");
  }
  get isValueScale_Linear() {
    return this.valueScaleType.is("linear");
  }

  supportsLogScale(): boolean {
    return !this.hasNegativeValues();
  }

  sanitizeRange(minV: number, maxV: number): [number, number] {
    if (!this.hasFloat) {
      maxV = Math.round(maxV);
      minV = Math.round(minV);
    }
    return super.sanitizeRange(minV, maxV);
  }

  getRecordValueExtent(): [number, number] {
    if (this.valueDomain) {
      return [...this.valueDomain];
    }
    if (this.timeseriesParent?.valueDomain) {
      return [...this.timeseriesParent.valueDomain];
    }
    return super.getRecordValueExtent();
  }

  // ********************************************************************
  // Data & initialization
  // ********************************************************************

  private _hasFloat: boolean;
  get hasFloat(): boolean {
    return this._hasFloat;
  }

  /** -- */
  fillValueCache() {
    this._hasFloat = false;

    this.records.forEach((record) => {
      var v = this.template.func.call(record.data, record);
      if (v === undefined) v = null;
      if (isNaN(v)) v = null;
      if (v === 0 && this.skipZero) v = null;
      if (v !== null) {
        if (typeof v !== "number") {
          v = null;
        } else {
          this._hasFloat = this._hasFloat || v % 1 !== 0;
        }
      }
      record.setValue(this, v);
      if (v == null) {
        this.noValueAggr.addRecord(record);
      }
    });
  }

  /** -- */
  pofffff() {
    this.refreshScaleType();
  }

  // Also a method of Timeseries
  hasNegativeValues() {
    if (!this.aggr_initialized) return true; // unknown, assume it can have negative
    return this.rangeOrg[0] < 0;
  }

  /** -- */
  supportsRecordEncoding(_type: RecordVisCoding) {
    if (this.isEmpty()) return false;
    if (["text", "textBrief"].includes(_type)) return true;
    this.initializeAggregates();
    if (!this.isComparable.get()) return false;
    if (["sort", "scatterX", "scatterY", "color"].includes(_type)) return true;
    if (_type === "size") {
      return !this.hasNegativeValues();
    }
    return false;
  }

  /** -- */
  get canHaveMetricFuncs() {
    if (this.isIDAttrib()) return false;
    if (!this.aggr_initialized) return false;
    return true;
  }
  /** -- */
  get supportedMetricFuncs() {
    return this.canHaveMetricFuncs ? this._metricFuncs : [];
  }

  /** -- */
  private getTickPrecision() {
    return this.timeseriesParent?.tickPrecision ?? this.tickPrecision;
  }

  updateTickPrintFunc(){
    var t = d3.format("." + this.getTickPrecision() + "~s");
    if (this.getTickPrecision() === 0) {
      t = d3.format("~s");
    }

    this.intervalTickPrint = (v: number) => {
      if (!this.hasFloat) v = Math.round(v);
      var r = t(v);
      var _r = v.toLocaleString();
      // if value is 1021 and summary doesn't have float, formatted value returns "1,021k" - Stupid!
      if (_r.length <= r.length) return _r;
      if (r.substr(-1) === "m") {
        r = parseFloat(r) / 1000;
        r = Math.round((r + 0.000001) * 1000) / 1000;
      }
      return r;
    };

    if (this.stepTicks) {
      this.intervalTickPrint = d3.format("d");
    }
  }

  refreshValueScale(){
    super.refreshValueScale();

    if (!this.hasFloat) {
      this.intervalTicks = this.intervalTicks.filter((tick) => tick % 1 === 0);
    }
  }

  // if parent is timeseries, timeKey shows which time we are about...
  timeKey: TimeKey = null;

  /** -- */
  isPercentageUnit() {
    if (this.unitName !== "%") return false;
    if (this.hasNegativeValues()) return false;
    if (this.rangeOrg[1] > 100) return false;
    return true;
  }

  /** -- */
  refreshScaleType() {
    if (this.isEmpty()) return;

    this.setStepTicks(false);

    if (this.timeseriesParent) {
      this.timeseriesParent.initializeAggregates();
      return;
    }

    var domain = this.valueScale.domain();

    // decide scale type based on the filtered records
    var deviation = d3.deviation(this.sortedRecords, (record) => {
      var v = this.getRecordValue(record);
      if(v==null) return undefined;
      if(v >= domain[0] && v <= domain[1]) return v;
    });

    var range = this.valueScale.domain();
    var activeRange = range[1] - range[0];

    var optTicks = this.block.getScaleNicing();

    if (!this.hasFloat && optTicks >= activeRange) {
      // Apply step domain before you check for log - it has higher precedence
      this.setStepTicks(true);
    } else if (
      deviation / activeRange < 0.12 &&
      this.rangeOrg[0] > 0
    ) {
      // Log scale
      this.autoScaleType = "log";
      return;
    } else if (!this.hasFloat && optTicks >= activeRange) {
      // The scale can be linear or step after this stage
      this.setStepTicks(true);
    }
    this.autoScaleType = "linear";
  }

  getFormattedValue(v: any, isSVG: any = false): string {
    if (v == null) {
      v = "-";
    } else if (typeof v === "number") {
      if (!this.intervalTickPrint) this.refreshValueScale();
      v = this.intervalTickPrint(v);
    }
    return Util.addUnitName(v, this.unitName, isSVG);
  }

  /** -- */
  private keepOnlyPositiveRecords() {
    this.sortedRecords = this.records.filter((record) => {
      var isPositive = this.getRecordValue(record) > 0;
      if (!isPositive) {
        this.setRecordValueCacheToMissing(record);
      }
      return isPositive;
    });

    this.updatedRangeOrg();
  }

  /** -- */
  async applyScaleType() {
    if (!this.sortedRecords) return;

    this.initializeAggregates();

    // remove records with value:0 (because log(0) is invalid)
    if (this.isValueScale_Log && this.rangeOrg[0] <= 0) {
      this.keepOnlyPositiveRecords();
    }

    this.updateScaleAndBins();
    await this.browser.recordDisplay?.refreshAttribScaleType(this);
  }

  getValueScaleObj() {
    return Util.getD3Scale(this.isValueScale_Log);
  }
  getValuePosX(v: number) {
    return this.valueScale(v) + (this.stepTicks ? this.block.aggrWidth / 2 : 0);
  }

  getVizDomain(): [number, number] {
    if (this.timeseriesParent) {
      this.timeseriesParent.initializeAggregates();
      return this.timeseriesParent.timeSeriesScale_Value.domain();
    }
    return super.getVizDomain();
  }

  applyTemplateSpecial(): void {
    if (this.template.special === "TimePoint" && this.template.parent) {
      this.timeseriesParent.setTimepointAttrib(this.template.lastKey, this);
    } else if (this.template.special === "Hour") {
      this.unitName = ":00";
    }
  }

  skipZero: boolean = false;

  /** -- */
  setSkipZero() {
    if (!this.aggr_initialized) return;
    if (this.rangeOrg[0] > 0) return;
    if (this.skipZero) return;

    this.skipZero = true;

    this.keepOnlyPositiveRecords();

    this.refreshScaleType();
  }

  // ********************************************************************
  // Unit name access  & updates
  // ********************************************************************

  /** -- */
  get unitName(): string {
    return this.timeseriesParent?.unitName ?? this.measurable?.unitName ?? "";
  }

  /** -- */
  set unitName(v: string) {
    if (!v) v = "";
    if (this.unitName === v) return;
    if (this.timeseriesParent) {
      this.timeseriesParent.unitName = v;
      return;
    }

    super.unitName = v;

    this.block.refreshValueTickLabels();

    this.browser.recordDisplay.View?.refreshAttribUnitName(this);

    if (this.measureSummary === this) {
      this.browser.blocks.forEach((block) =>
        block.refreshMeasureLabelText("Active")
      );
      this.browser.DOM.activeRecordMeasure.html(
        this.browser.getGlobalActiveMeasure()
      );
    }
  }

  // ********************************************************************
  // Import / Export
  // ********************************************************************

  /** -- */
  async applyConfig(blockCfg: SummarySpec) {
    super.applyConfig(blockCfg);

    this.measurable.valueDomain = blockCfg.valueDomain;

    await this.block.showPercentiles.set(blockCfg.showPercentiles);
    await this.valueScaleType.set(blockCfg.valueScaleType);

    if (blockCfg.unitName) {
      this.unitName = blockCfg.unitName;
    }

    if (blockCfg.skipZero) {
      this.setSkipZero();
    }
  }

  // not exportable if this is just a timekey - it inherits properties from its parent
  isExportable(): boolean {
    return this.timeseriesParent === null;
  }

  /** -- */
  exportConfig() {
    var config = super.exportConfig();

    var c = {
      unitName: this.unitName,
      skipZero: this.skipZero,
      filter: this.summaryFilter.exportFilter()
    };

    return Object.assign(config, c);
  }
}
