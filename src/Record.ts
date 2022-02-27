import { Aggregate } from "./Aggregate";
import { Aggregate_Interval } from "./Aggregate_Interval";
import { Attrib } from "./Attrib";
import { TimeData, TimeKey, TimeSeriesData } from "./TimeSeriesData";

import { Base } from "./Base";
import { CompareType } from "./Types";

export class Record {
  public readonly _id: string;

  public readonly data: any;

  // By default, each item is aggregated as 1
  // You can modify this with a non-negative value
  // Note that the aggregation currently works by summation only.
  public measure_Self = 1;

  public DOM: {
    record: any;
  };

  /** -- */
  constructor(d, idIndex) {
    this.data = d;
    this._id = d[idIndex];

    this.DOM = { record: undefined };
  }

  get id() {
    return this._id;
  }

  get label() {
    return this._id;
  }

  // Aggregates which this record falls under
  private _aggrCache: Aggregate[] = [];

  // The data that's used for mapping this item, used as a cache.
  // This is accessed by filterID, and used for getRecordValue
  private _valueCache: any[] = []; // caching the values this item was mapped toggle

  setValue(attrib: Attrib, v: any) {
    this._valueCache[attrib.attribID] = v;
  }
  getValue(attrib: Attrib): any {
    return this._valueCache[attrib.attribID];
  }

  // ********************************************************************
  // Filtering state
  // ********************************************************************

  // Cached filter state, indexed by attribute ID
  private _filterCache: boolean[] = [];

  // Wanted item / not filtered out
  private _filteredOut: boolean = false;
  get filteredOut(): boolean {
    return this._filteredOut;
  }
  get isIncluded(): boolean {
    return !this._filteredOut;
  }

  // If true, filter/wanted state is dirty and needs to be updated.
  private _filterCacheIsDirty = true;

  /** -- */
  setFilterCache(index: number, v: boolean): void {
    if (this._filterCache[index] === v) return;
    this._filterCache[index] = v;
    this._filterCacheIsDirty = true;
  }

  /** Updates isIncluded state, and notifies all related aggregates of the change
   *  Returns true iff the filtered stated is changed.
   **/
  refreshFilterCache(): boolean {
    if (!this._filterCacheIsDirty) return false;

    var prev = this.isIncluded;

    this._filteredOut = this._filterCache.some((f) => !f); // set to true iff at least one is false
    this._filterCacheIsDirty = false;

    if (this.isIncluded === prev) return false;

    if (this.measure_Self != null) {
      // may be zero or negative...
      var cntToAdd = this.isIncluded ? 1 : -1;
      var measureToAdd = cntToAdd * this.measure_Self; // Add : Remove value
      this._aggrCache.forEach((aggr) => {
        aggr.addToActive(measureToAdd, cntToAdd);
      });
    }

    this.DOM.record?.classList.toggle("isExcluded");

    return true;
  }

  // ********************************************************************
  // Selected state
  // ********************************************************************

  private selected = {
    Compare_A: false,
    Compare_B: false,
    Compare_C: false,
    Compare_D: false,
    Compare_E: false,
  };

  // if a specific compare type is given, looks that up. otherwise, checks if ANY is selected
  isSelected(cT: CompareType = null): boolean {
    if (cT) return this.selected[cT];
    return Base.Compare_List.some((cT) => this.selected[cT]);
  }
  /** -- */
  get activeComparisons() {
    return Base.Compare_List.filter((cT) => this.selected[cT]);
  }

  // ********************************************************************
  // Rank information (used externally)
  // ********************************************************************

  // Rank order of the record. Starts from zero
  // Used by the list view only TODO: Review
  public recordRank = 0;
  // assigned on data load, each record has a unique order position
  public recordOrder = 0;
  // negative if filtered out, positive if filtered in
  public recordRank_Unique = 0;

  // ********************************************************************
  // Used by other methods to track additional view-state
  // ********************************************************************

  /** -- */
  assignDOM(dom) {
    this.DOM.record = dom;
    if (!dom) return;

    this.DOM.record.classList[this.isIncluded ? "remove" : "add"]("isExcluded");
    Base.Compare_List.forEach((cT) => {
      this.DOM.record.classList[this.selected[cT] ? "add" : "remove"](
        "rec-selected-" + cT
      );
    });
  }

  /** -- */
  removeAggrFromCache(aggr: Aggregate) {
    this._aggrCache.splice(this._aggrCache.indexOf(aggr), 1);
  }

  /** -- */
  moveDOMtoTop() {
    if (this.DOM.record && navigator.userAgent.indexOf("Edge") <= 0) {
      this.DOM.record.parentNode.appendChild(this.DOM.record);
    }
  }

  /** -- */
  highlightRecord() {
    this.DOM.record?.classList.add("rec-selected-onRecord");
    // update visuals of aggregates that this record appears in
    this._aggrCache.forEach((aggr) => {
      aggr.DOM.aggrGlyph?.classList.add("withRecordHighlight");
      if (aggr instanceof Aggregate_Interval) {
        aggr.attrib.block.showRecordValue(this);
      }
    });
  }
  /** -- */
  unhighlightRecord() {
    this.DOM.record?.classList.remove("rec-selected-onRecord");
    this._aggrCache.forEach((aggr) => {
      aggr.DOM.aggrGlyph?.classList.remove("withRecordHighlight");
      if (aggr instanceof Aggregate_Interval) {
        aggr.attrib.block.hideRecordValue?.();
      }
    });
  }

  /** -- */
  flipSelected(f, cT) {
    this.DOM.record?.classList[this.selected[cT] === f ? "remove" : "add"](
      "rec-selected-" + cT
    );
  }

  /** -- */
  addToAggrMeasure(_type) {
    if (this.filteredOut) return;

    this._aggrCache.forEach((aggr) => {
      if (this.measure_Self === 0) return;
      aggr[_type].measure += this.measure_Self;
      aggr[_type].recCnt++;
    });
  }
  /** -- */
  removeFromAggrMeasure(_type) {
    if (this.filteredOut) return;

    this._aggrCache.forEach((aggr) => {
      if (this.measure_Self === 0) return;
      aggr[_type].measure -= this.measure_Self;
      aggr[_type].recCnt--;
    });
  }

  /** -- */
  setCompared(cT) {
    if (this.selected[cT]) return;
    this.selected[cT] = true;
    if (this.DOM.record) {
      this.DOM.record.classList.add("rec-selected-" + cT);
      // SVG geo area - move it to the bottom of parent so that border can be displayed nicely.
      // TO-DO: improve the conditional check!
      if (this.DOM.record.nodeName === "path")
        this.DOM.record.parentNode.appendChild(this.DOM.record);
    }
    this.addToAggrMeasure(cT);
  }

  /** -- */
  unsetCompared(cT) {
    if (!this.selected[cT]) return;
    this.selected[cT] = false;
    this.DOM.record?.classList.remove("rec-selected-" + cT);
    this.removeFromAggrMeasure(cT);
  }

  /** -- */
  getTimeKeys(): TimeKey[] {
    // collect ALL time keys / all attributes
    return (
      this._valueCache
        // only the timseries values
        .filter((_) => _ instanceof TimeSeriesData)
        // Keep TimeData only
        .map((ts: TimeSeriesData) => Object.values(ts._keyIndex))
        .flat()
        // filter to unique values
        .filter(
          (key, index, self: TimeData[]) =>
            self.findIndex(
              (t: TimeData) => t._time.getTime() === key._time.getTime()
            ) === index
        )
        // sort by _time (latest first)
        .sort((a, b) => b._time.getTime() - a._time.getTime())
    );
  }

  public _view: {
    inCluster?: any;
    _labelHidden?: any;
    _labelOverlap?: any;
    _labelPos?: any;
    hideTextLabel?: any;
    textBounds?: any;
    isInScatterPlot?: any;
    wasInScatterPlot?: any;
    isInRange?: any;
    viewBounds?: any;
    x?: any,
    y?: any,
  } = {};
}
