import { BreadCrumb } from "./UI/Breadcrumb";
import { Browser } from "./Browser";
import { Base } from "./Base";
import { Record } from "./Record";
import { Attrib } from "./Attrib";
import { i18n } from "./i18n";

/** -- */
export abstract class Filter_Base {
  protected readonly browser: Browser;
  protected readonly filterID: number;

  // Each filter has its own breadcrumb
  public breadcrumb: BreadCrumb = null;

  private _isFiltered: boolean = false;
  get isFiltered() {
    return this._isFiltered;
  }

  public how: "All" | "LessResults" | "MoreResults" = "All";

  /** -- */
  constructor(_browser: Browser) {
    this.browser = _browser;
    this.filterID = this.browser.filterCounter++;

    // Initialize all records to true (Not filtered) for current filter ID
    this.browser.records.forEach((record) =>
      record.setFilterCache(this.filterID, true)
    );

    this.browser.filters.push(this);
  }

  abstract get title(): string;
  abstract filterView_Detail(): string;
  abstract onClear(forceUpdate: boolean): void;
  abstract onFilter(): void;
  abstract importFilter(config: any): void;
  abstract exportFilter(): any;

  /** -- */
  setFiltered(update = true) {
    if (this.browser.singleFiltering) {
      // TODO check logic
      return;
    }

    this._isFiltered = true;

    if (!update) return;

    this.browser.refresh_filterClearAll();

    this.applyFilter();

    var stateChanged = false;

    var how = 0;
    if (this.how === "LessResults") how = -1;
    if (this.how === "MoreResults") how = 1;
    this.browser.records.forEach((record) => {
      if (how < 0 && record.filteredOut) return;
      if (how > 0 && !record.filteredOut) return;
      stateChanged = record.refreshFilterCache() || stateChanged;
    });

    if (stateChanged) {
      this.browser.updateRecordCount_Active();
      this.browser.updateAfterFilter();
    }
  }

  /* -- */
  applyFilter() {
    if(!this.breadcrumb){
      this.breadcrumb = this.browser.createNewCrumb();
    }

    this.onFilter();
    
    this.breadcrumb.showCrumb("Filter", this);
  }

  /** -- */
  getRichText() {
    return `${this.title}: ${this.filterView_Detail()}`;
  }
  /** -- */
  getRichText_flipped() {
    return `${this.filterView_Detail()} [${this.title}]`;
  }

  /** -- */
  clearFilter(forceUpdate = true) {
    if (!this._isFiltered) return false; // TO-DO: Does this break anything?
    this._isFiltered = false;

    this.browser.records.forEach((rec) =>
      rec.setFilterCache(this.filterID, true)
    );

    this.breadcrumb?.removeCrumb();
    this.breadcrumb = null;

    this.onClear(forceUpdate);

    if (forceUpdate !== false) {
      this.browser.records.forEach(
        (rec) => rec.filteredOut && rec.refreshFilterCache()
      );
      this.browser.updateRecordCount_Active();
      this.browser.updateAfterFilter(true);
    }

    if (!this.browser.isFiltered()) {
      this.browser.filters_wrap_letItWrap = false;
      this.browser.DOM.breadCrumbs_Filter.classed("collapsed", false);
    }

    return true;
  }
}

/** adds this attribute - these filters work on an individual attribute */
export abstract class Filter extends Filter_Base {
  public abstract readonly attrib: Attrib;

  public get noValueAggr(){
    return this.attrib.noValueAggr;
  }

  /** -- */
  constructor(_browser: Browser) {
    super(_browser);
  }

  /** -- */
  onFilter(): void {
    this.attrib.block?.refreshUIFiltered(true);

    // clear compare selections - these items cannot be within the filtered area
    if (this.attrib.isComparedAttrib()) {
      Base.Compare_List.forEach((cT) => {
        if (this.browser.selectedAggrs[cT]) {
          this.browser.clearSelect_Compare(cT, true, true);
        }
      });
    }
  }
  /** -- */
  onClear(forceUpdate = false) {
    this.attrib.block?.refreshUIFiltered(false);
    this.attrib.block?.onClearFilter(forceUpdate);
  }
}

/**
 * @constructor
 */
export class Filter_Record extends Filter_Base {
  private removedRecords: Record[];

  /** -- */
  constructor(browser: Browser) {
    super(browser);
    this.removedRecords = [];
  }

  /** -- */
  removeRecord(_record: Record) {
    _record.setFilterCache(this.filterID, false);
    this.removedRecords.push(_record);
    this.setFiltered();
  }

  /** -- */
  get title(): string {
    return `<i class='far fa-times-circle></i> ${i18n.Removed}`;
  }
  /** -- */
  onClear() {
    this.removedRecords = [];
  }
  /** -- */
  filterView_Detail() {
    return this.removedRecords.length + " " + this.browser.recordName;
  }
  /** -- */
  onFilter(): void {}

  /** -- */
  exportFilter(): string[] {
    return this.removedRecords.map((r) => r.id);
  }

  /** -- */
  importFilter(_: string[]): void {
    var recordIndex = Base.tables.get(this.browser.primaryTableName);
    if (!recordIndex) return;

    this.removedRecords = [];

    _.forEach((recID) => {
      var record = recordIndex[recID];
      if (record) {
        this.removedRecords.push(record);
        record.setFilterCache(this.filterID, false);
      }
    });

    if (this.removedRecords.length > 0) {
      this.setFiltered(false);
      this.applyFilter();
    }
  }
}

/** -- */
export class Filter_Text extends Filter_Base {
  private multiMode: "and" | "or" = "and";
  // This is the text query string, populated by user input
  private _queryString: string = null;
  // This is the parsed string (multiple components to match)
  private filterQuery: string[];

  /** -- */
  constructor(browser: Browser) {
    super(browser);
    this._queryString = null;
  }

  /** -- */
  get title(): string {
    return this.browser.recordDisplay.textAttrib_Brief.attribName;
  }
  /** -- */
  filterView_Detail() {
    return this._queryString;
  }

  /** -- */
  onClear() {
    this.browser.recordDisplay.DOM.recordTextSearch.classed("showClear", false);
    this.browser.recordDisplay.DOM.recordTextSearch
      .select("input")
      .node().value = "";
  }

  /** -- */
  onFilter(): void {
    this.browser.recordDisplay.DOM.recordTextSearch.classed("showClear", true);

    // go over all the records in the list, search each keyword separately
    var _summary = this.browser.recordDisplay.textAttrib_Brief;
    this.browser.records.forEach((record) => {
      var v = _summary.getRecordValue(record);
      var f = false;
      if (v) {
        let v2 = v.join(" ").toLowerCase();
        if (this.multiMode === "or") {
          f = !this.filterQuery.every((v_i) => v2.indexOf(v_i) === -1);
        } else if (this.multiMode === "and") {
          f = this.filterQuery.every((v_i) => v2.indexOf(v_i) !== -1);
        }
      }
      record.setFilterCache(this.filterID, f);
    });
  }

  /** -- */
  set queryString(v) {
    this._queryString = v.toLowerCase();
    // convert string to query pieces
    this.filterQuery = [];
    if (this._queryString !== "") {
      // split the input by " character
      this._queryString.split('"').forEach((block, i) => {
        if (i % 2 === 0) {
          block.split(/\s+/).forEach((q) => this.filterQuery.push(q));
        } else {
          this.filterQuery.push(block);
        }
      });
      // Remove the empty strings
      this.filterQuery = this.filterQuery.filter((v) => v !== "");
    }
  }
  get queryString(){
    return this._queryString;
  }

  /** -- */
  importFilter(_) {
    if (typeof _ === "string") _ = { query: _ };
    if (!_.query) return;
    this.queryString = _.query;
    if (_.multiMode) this.multiMode = _.multiMode;
    if (this.isFiltered) {
      this.browser.recordDisplay.DOM.recordTextSearch
        .select(".textSearchInput")
        .node().value = _.query;
      this.applyFilter();
    }
  }

  /** -- */
  exportFilter() {
    return {
      query: this._queryString,
      multiMode: this.multiMode,
    };
  }
}
