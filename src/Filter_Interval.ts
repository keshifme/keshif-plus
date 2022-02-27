import { Aggregate_Interval } from "./Aggregate_Interval";
import { Attrib_Interval } from "./Attrib_Interval";
import { Browser } from "./Browser";
import { Filter_Interval_Spec, IntervalT } from "./Types";
import { Filter } from "./Filter";
import { i18n } from "./i18n";

/** Filtering based on intervals */
export class Filter_Interval<T extends IntervalT> extends Filter {
  public readonly attrib: Attrib_Interval<T>;

  public active: Aggregate_Interval<T>;

  /** -- */
  constructor(_browser: Browser, attrib: Attrib_Interval<T>) {
    super(_browser);
    this.attrib = attrib;
  }

  /** -- */
  get title(): string {
    return this.attrib.attribName;
  }
  /** -- */
  exportFilter(): Filter_Interval_Spec<T> {
    var _: Filter_Interval_Spec<T> = {};
    if (this.noValueAggr.filtered) {
      _.missing = this.noValueAggr.filtered;
    } else if(this.active) {
      _.min = this.active.minV;
      _.max = this.active.maxV;
    }
    return _;
  }
  /** -- */
  importFilter(_: Filter_Interval_Spec<T>) {
    if (_.missing) {
      this.noValueAggr.filtered = _.missing;
    } else {
      this.active = this.attrib.createAggregate(_.min, _.max);
    }
    this.setFiltered(false);
    this.applyFilter();
  }
  /** -- */
  onClear() {
    super.onClear();

    this.active = null;

    this.browser.recordDisplay?.filterStatusUpdated(this.attrib);
  }
  /** -- */
  onFilter(): void {
    this.browser.recordDisplay?.filterStatusUpdated(this.attrib);

    if (this.noValueAggr.filtered) {
      var c =
        this.noValueAggr.filtered === "in"
          ? (record) => this.attrib.getRecordValue(record) === null
          : (record) => this.attrib.getRecordValue(record) !== null;
      this.attrib.records.forEach((record) => {
        record.setFilterCache(this.filterID, c(record));
      });
      return;
    }

    var isFilteredCb;
    if (this.active.isMinLarger() && this.active.isMaxSmaller()) {
      if(this.active.isMaxIncluded){
        isFilteredCb = (v) => v >= this.active.minV && v <= this.active.maxV;
      } else {
        isFilteredCb = (v) => v >= this.active.minV && v < this.active.maxV;
      }
      //
    } else if (this.active.isMinLarger()) {
      isFilteredCb = (v) => v >= this.active.minV;
      //
    } else {
      if(this.active.isMaxIncluded){
        isFilteredCb = (v) => v <= this.active.maxV;
      } else {
        isFilteredCb = (v) => v < this.active.maxV;
      }
    }

    // TO-DO: Optimize: Check if the interval scale is extending/shrinking or completely updated...
    this.attrib.records.forEach((record) => {
      var v = this.attrib.getRecordValue(record);
      record.setFilterCache(
        this.filterID,
        v !== null ? isFilteredCb(v) : false
      );
    });

    this.attrib.block.DOM.zoomControl?.attr(
      "sign",
      this.attrib.block.zoomableStatus()
    );

    this.attrib.block.refreshIntervalSlider();

    super.onFilter();
  }

  filterView_Detail() {
    if (this.noValueAggr.filtered === "in") return `(${i18n.NoData})`;
    if (this.noValueAggr.filtered === "out") return `(${i18n.ValidData})`;
    return this.active.label;
  }
}

export class Filter_Numeric extends Filter_Interval<number> {}

export class Filter_Timestamp extends Filter_Interval<Date> {
  /** -- */
  importFilter(_: Filter_Interval_Spec<Date>) {
    if (_.missing) {
      this.noValueAggr.filtered = _.missing;
    } else {
      this.active = this.active = this.attrib.createAggregate(_.min, _.max);
      // if (this.attrib.type === "timestamp") {
      //   this.active.min = new Date(this.active.min);
      //   this.active.max = new Date(this.active.max);
      // }
    }
    this.setFiltered(false);
    this.applyFilter();
  }
}
