import { extent } from "d3-array";

import { BlockType, CompareType, IntervalT, SummarySpec } from "./Types";
import { Aggregate_Interval } from "./Aggregate_Interval";
import { Block_Interval } from "./Block_Interval";
import { Filter_Interval } from "./Filter_Interval";
import { Attrib } from "./Attrib";
import { Browser } from "./Browser";
import { Record } from "./Record";

const d3 = { extent };

export abstract class Attrib_Interval<T extends IntervalT> extends Attrib {
  public _aggrs: Aggregate_Interval<T>[] = [];

  protected _block: Block_Interval<T>;
  public get block(): Block_Interval<T> {
    return this._block;
  }

  public sortedRecords: Record[] = [];

  get attribName(): string {
    return super.attribName;
  }

  set attribName(name: string) {
    super.attribName = name;
    // name wasn't updated
    if (this.attribName === name) {
      this.browser.recordDisplay.refreshAttribOptions("sort");
    }
  }

  // ********************************************************************
  // Value scale and Ticks
  // ********************************************************************

  public intervalTicks: T[] = [];

  binMatch(bin: [T, T, any], aggr: Aggregate_Interval<T>) {
    return +bin[0] - +aggr.minV === 0 && +bin[1] - +aggr.maxV === 0;
  }

  // d3 scale object (linear / log / time
  // depends on whether it is numeric or timestamp attibute
  public valueScale: any = null;
  public valueScale_prev: any = null;

  // linear scale, log scale, time scale
  abstract getValueScaleObj(): any;
  // adjusts between linear and log (for numeric) - no-op for timestamp;
  abstract refreshScaleType(): any;

  // Printing
  abstract updateTickPrintFunc();
  // looks like a function, but created like a member in subclasses dynamically
  intervalTickPrint: (T) => string = null;

  // TODO: move to Block (View)
  abstract getValuePosX(v: T): number;

  // Resets the valueScale and intervalTicks based on 
  // active range (filtering/zoom), UI width, scale type
  refreshValueScale() {
    var nicing = this.block.getScaleNicing();

    this.valueScale = this.getValueScaleObj()
      .domain(this.rangeActive)
      .range([0, this.block.width_histogram])
      .nice(nicing);

    this.intervalTicks = this.valueScale.ticks(nicing);

    this.updateTickPrintFunc();
  }

  updateScaleAndBins(forceRenderUpdate = false) {
    if (this.isEmpty()) return;
    if (!this.aggr_initialized) return;

    this.valueScale_prev = this.valueScale.copy();

    // if the labels are updated (multiple rows), design needs update too.
    var height_labels_prev = this.block.height_Ticklabels;

    this.refreshValueScale();

    var ticks = this.intervalTicks;

    if (ticks.length === 0) return;

    this.block.aggrWidth =
      this.valueScale(ticks[1]) - this.valueScale(ticks[0]);

    // [ From , To (excluding), assign aggregate ]
    type Bin = [T, T, Aggregate_Interval<T>];

    // converts ticks to bins
    var bins: Bin[] = this.intervalTicks.reduce(
      (result: Bin[], value: T, index: number, array) => {
        if (index < array.length - 1) {
          result.push([value, array[index + 1], null]);
        }
        return result;
      },
      []
    );

    // Identify aggregates that don't match to a bin, clear their records, remove them from all aggreegate index
    this._aggrs = this._aggrs.filter((curAggr) => {
      // aggregate that matches one of the bins exists already. Do not modify...
      if (bins.some((bin) => this.binMatch(bin, curAggr))) {
        return true;
      }
      curAggr.clearRecords();
      this.browser.allAggregates.splice(
        this.browser.allAggregates.indexOf(curAggr),
        1
      );
      return false;
    });

    // keep only bins that do not have an existing aggregate
    bins = bins.filter(
      (bin: Bin) => !this._aggrs.some((curAggr) => this.binMatch(bin, curAggr))
    );

    // if there are new bins, create aggregates, and put records inside
    if (bins.length > 0) {
      // create new aggregate interval for each remaining bin
      bins.forEach((bin: Bin, i) => {
        let aggr = this.getAggregate(bin[0], bin[1]);
        if (i === bins.length - 1) {
          aggr.isMaxIncluded = true;
        }
        bin[2] = aggr; // indexing aggregate object for the bin
      });

      // sort aggregates by order of bin values, min to max
      this._aggrs = this._aggrs.sort((a, b) => +b.minV - +a.minV);

      // place records across bins
      this.records.forEach((record) => {
        var v = this.getRecordValue(record);
        if (v == null) return;
        // Add record into appropriate bin.
        // This iterates only over new bins
        bins.forEach((bin) => {
          if (v < bin[0]) return;
          var aggr = bin[2];
          if (v < bin[1] || (v == bin[1] && aggr.isMaxIncluded)) {
            aggr.addRecord(record);
          }
        });
      });
    }

    // RENDER UPDATES
    if (!this.block.DOM.inited) return;

    this.block.refreshIntervalSlider();

    if (bins.length > 0 || forceRenderUpdate) {
      this.block.insertVizDOM();

      if (height_labels_prev !== this.block.height_Ticklabels) {
        this.block.setHeight(this.block.getHeight());
      }

      this.updateChartScale_Measure();

      this.block.refreshViz_All(false); // no-axis
    }
  }

  // ********************************************************************
  // Step ticks
  // ********************************************************************

  private _stepTicks: boolean = false;
  get stepTicks() {
    return this._stepTicks;
  }
  setStepTicks(v) {
    this._stepTicks = v;
  }

  // ********************************************************************
  // Aggregates / bins
  // ********************************************************************

  abstract fillValueCache(): void;
  abstract pofffff(): void;

  initializeAggregates(): void {
    if (this.aggr_initialized) return;

    if (this.noValueAggr.records.length > 0) {
      this.noValueAggr.records = [];
      this.noValueAggr.resetAggregateMeasures();
    }

    this.fillValueCache();

    // remove records that map to null / undefined
    this.sortedRecords = this.records.filter(
      (record) => this.getRecordValue(record) != null
    );
    // Sort the items by their attribute value
    this.sortedRecords.sort((a: Record, b: Record) => {
      // +Date converts the date to a number, and the template system continues by conversion
      let a1 = +this.getRecordValue(a);
      let a2 = +this.getRecordValue(b);
      return a1 - a2;
    });

    this.updatedRangeOrg();

    this.refreshValueScale();

    this.pofffff();

    this.aggr_initialized = true;
  }

  abstract createAggregate(minV: T, maxV: T): Aggregate_Interval<T>;

  getAggregate(minV: T, maxV: T): Aggregate_Interval<T> {
    var newAggr = this.createAggregate(minV, maxV);
    this._aggrs.push(newAggr);
    this.browser.allAggregates.push(newAggr);
    return newAggr;
  }

  // ********************************************************************
  // Filtering and Range
  // ********************************************************************

  public summaryFilter: Filter_Interval<T>;
  createSummaryFilter() {
    this.summaryFilter = new Filter_Interval(this.browser, this);
  }

  // original data scale
  rangeOrg: [T, T];
  updatedRangeOrg() {
    this.rangeOrg = this.getRecordValueExtent();
  }

  // returns filtered range if filtered. Otherwise, original range
  get rangeActive(): [T, T] {
    return (this.summaryFilter.isFiltered && this.block.zoomed.is(true))
      ? [this.summaryFilter.active.minV, this.summaryFilter.active.maxV]
      : this.rangeOrg;
  }

  // in numbers, if time-series key, uses timeseries extent automatically
  getRecordValueExtent(): [T, T] {
    return d3.extent(this.sortedRecords, (record: Record) =>
      this.getRecordValue(record)
    );
  }

  // if time-series time key, returns timeserie's scale domain.
  getVizDomain(): [T, T] {
    this.initializeAggregates();
    return this.valueScale.domain();
  }

  rangeFilterTimer: number = 0;

  // creates new aggregate, and uses a timer to run the filtering
  setRangeFilter_Custom(minV, maxV) {
    var aggr = this.createAggregate(minV, maxV);
    aggr.validateMinMax();
    this.setRangeFilter(aggr, true);
  }

  setRangeFilter(aggr: Aggregate_Interval<T>, useTimer = false) {
    aggr.validateMinMax();

    this.summaryFilter.active = aggr;

    this.summaryFilter.noValueAggr.filtered = false;

    this.block.refreshIntervalSlider();

    if (this.rangeFilterTimer) window.clearTimeout(this.rangeFilterTimer);
    this.rangeFilterTimer = window.setTimeout(
      () => {
        this.summaryFilter.setFiltered();
        this.rangeFilterTimer = 0;
      },
      useTimer ? 250 : 0
    );
  }

  // ********************************************************************
  // Sort labels (when attribute is used for sorting)
  // ********************************************************************

  _sortLabel: (Record) => string = null;

  get sortLabel(): (Record) => string {
    if (this._sortLabel) {
      return (record) => this._sortLabel.call(record.data, record);
    }
    return (record) => {
      var s = this.getRecordValue(record);
      return s == null ? "" : this.getFormattedValue(s, false);
    };
  }

  set sortLabel(v) {
    this._sortLabel = v;
  }

  // ********************************************************************
  // Record / printing / access
  // ********************************************************************

  getRecordValue(record: Record): T {
    return record.getValue(this);
  }

  constructor(
    browser: Browser,
    name: string,
    template: any,
    _type: BlockType,
    blockClassName,
    nuggetClassName
  ) {
    super(
      browser,
      name,
      template,
      _type,
      "kshfSummary_Interval " + blockClassName, // adds "kshfSummary_Interval" to given class name
      nuggetClassName
    );

    this.createSummaryFilter();
  }

  updateChartScale_Measure(skipRefreshViz = false) {
    if (!this.block.isVisible()) return;
    super.updateChartScale_Measure(skipRefreshViz);

    this.block.refreshViz_Bins();
    this.block.refreshViz_All(false); // no-axis
  }

  get measureRangeMax(): number {
    return this.block.height_hist;
  }

  // if range is invalid, returns the same value in both pairs
  sanitizeRange(minV: T, maxV: T): [T, T] {
    var activeRanges = this.activeComparisons
      .filter((_: CompareType) => {
        return (
          this.browser.Compare_Highlight !== _ &&
          (this.browser.selectedAggrs[_] as Aggregate_Interval<T>).minV != null
        );
      })
      .map((_) => this.browser.selectedAggrs[_])
      .map((_: Aggregate_Interval<T>) => ({ minV: _.minV, maxV: _.maxV }));

    var r = activeRanges.reduce(
      (accum, curRange) => {
        // zero size range. no-op
        if (accum.minV === accum.maxV) return accum;
        // current range holds the input range. bad!
        if (curRange.minV <= accum.minV && accum.maxV <= curRange.maxV) {
          return { minV: minV, maxV: maxV }; // same value - signals invalid range
        }
        // input range holds the active range. bad!
        if (accum.minV <= curRange.minV && curRange.maxV <= accum.maxV) {
          return { minV: minV, maxV: maxV }; // same value - signals invalid range
        }
        // current range does not intersect with active range. Continue as-is
        if (curRange.minV > accum.maxV || curRange.maxV < accum.minV) {
          return accum;
        }
        // current range limits the active minimum value
        if (curRange.maxV > accum.minV && curRange.minV < accum.minV) {
          return { minV: curRange.maxV, maxV: accum.maxV };
        }
        // current range limits the active maximum value
        if (curRange.minV < accum.maxV && curRange.minV > accum.maxV) {
          return { minV: accum.minV, maxV: curRange.minV };
        }
        return accum;
      },
      { minV: minV, maxV: maxV }
    );

    return [r.minV, r.maxV];
  }

  renderRecordValue(v, d3_selection): string {
    if (v instanceof Record) v = this.getRecordValue(v);

    if (v == null) {
      v = "-";
    } else if (this.type !== "timestamp") {
      v = v.toLocaleString();
    }
    let str = this.getFormattedValue(v, false);
    if (d3_selection) {
      d3_selection.html(str);
    } else {
      return str;
    }
  }

  /** -- */
  printAbbr(v: number, isSVG = false) {
    if (v == null) return "-";
    this.initializeAggregates();
    return this.getFormattedValue(this.intervalTickPrint(v), isSVG);
  }

  isEmpty() {
    return !this.aggr_initialized;
  }

  async applyConfig(blockCfg: SummarySpec) {
    super.applyConfig(blockCfg);

    await this.block.showHistogram.set(blockCfg.showHistogram);
    await this.block.optimumBinWidth.set(blockCfg.optimumBinWidth);
    await this.block.maxHeightRatio.set(blockCfg.maxHeightRatio);
    await this.measureScaleType.set(blockCfg.measureScaleType);
    await this.block.zoomed.set(blockCfg.zoomed);

    if (blockCfg.filter) {
      this.summaryFilter.importFilter(blockCfg.filter as any);
    } else if (this.isFiltered()) {
      this.summaryFilter.clearFilter();
    }
  }
}
