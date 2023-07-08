import "leaflet/dist/leaflet.css";
import "choices.js/public/assets/styles/choices.min.css";

import { max } from "d3-array";

import { Block_Categorical } from "./Block_Categorical";
import { Aggregate_Category } from "./Aggregate_Category";

import { Attrib } from "./Attrib";
import { Attrib_Set } from "./Attrib_Set";
import { Browser } from "./Browser";
import { i18n } from "./i18n";
import { Config } from "./Config";
import { Modal } from "./UI/Modal";
import { Base } from "./Base";
import { Util } from "./Util";
import { Record } from "./Record";
import { Filter_Categorical } from "./Filter_Categorical";
import {
  CatLabelSpec,
  CatSortSpec,
  RecordVisCoding,
  SummaryConfig_Categorical,
  SummarySpec,
} from "./Types";
import { AttribTemplate } from "./AttribTemplate";
import { MapData } from "./MapData";

const d3 = { max };

export class Attrib_Categorical extends Attrib {
  public _aggrs: Aggregate_Category[] = [];
  catTable_id: { [key: string]: Aggregate_Category } = {};
  private removedAggrs: Aggregate_Category[] = [];

  protected _block: Block_Categorical;
  public get block(): Block_Categorical {
    return this._block;
  }

  public readonly barHeight: Config<number>;
  public readonly minAggrSize: Config<number>;

  get measureRangeMax(): number {
    return this.block.width_CatBars;
  }

  applyTemplateSpecial(): void {
    if (this.template.special === "Year") {
      this.setSortingOption("id");
    } else if (this.template.special === "Month") {
      this.setSortingOption("id");
      this.setCatLabel(i18n.Lookup_Months);
    } else if (this.template.special === "WeekDay") {
      this.setSortingOption("id");
      this.setCatLabel(i18n.Lookup_DaysOfWeek);
    }
  }

  supportsRecordEncoding(coding: RecordVisCoding) {
    if (this.isEmpty()) return false;
    if (coding === "text") return true;
    if (coding === "textBrief") return true;
    return false;
  }

  constructor(browser: Browser, name: string, template: AttribTemplate) {
    super(
      browser,
      name,
      template,
      "categorical",
      "kshfSummary_Categorical",
      "far fa-font"
    );

    this.createSummaryFilter();

    this._block = new Block_Categorical(this);

    this.barHeight = new Config<number>({
      parent: this,
      cfgClass: "barHeight",
      cfgTitle: "RowHeight",
      iconClass: "fa fa-arrows-v",
      UISeperator: {
        title: "Size",
        className: "catSummary_ListOnly",
      },
      default: Base.defaultBarHeight,
      helparticle: "5e87d6d004286364bc97d079",
      itemOptions: [
        { name: "<i class='fa fa-minus'></i>", value: -99, _type: "minus" }, // special value
        { name: "1x", value: 18, max: 32 },
        { name: "2x", value: 32, max: 44 },
        { name: "3x", value: 44, max: 56 },
        { name: "4x", value: 56, max: 68 },
        { name: "5x", value: 68, max: 80 },
        { name: "6x", value: 80, max: 120 },
        { name: "<i class='fa fa-plus'></i>", value: -100, _type: "plus" }, // special value
      ],
      isActive: (d) =>
        d.value && d.value <= this.barHeight.get() && d.max > this.barHeight.get(),
      onDOM: (DOM) => {
        DOM.root.classed("catSummary_ListOnly", true);
      },
      preSet: async (v, opt) => {
        if (v === -99) {
          v = opt._value - 1;
        } else if (v === -100) {
          v = opt._value + 1;
        }
        return Math.min(85, Math.max(10, v));
      },
      onSet: () => {
        if (this.block.isView_List) {
          this.block.refreshHeight_Category();
        } else {
          this.block.heightRow_category_dirty = true;
        }
      },
    });

    let _timer;

    this.minAggrSize = new Config<number>({
      parent: this,
      cfgClass: "minAggrSize",
      cfgTitle: "Show",
      iconClass: "fa fa-eye-slash",
      default: 1,
      itemOptions: [
        { name: "All", value: 1 },
        {
          name: "More than one",
          value: 10,
        },
      ],
      UI: { disabled: true },
      isActive: (d) => d.value
        ? this.minAggrSize.get() > 1 
        : this.minAggrSize.get() === 1,
      onDOM: (DOM) => {
        DOM.root
          .select(".minAggrSizeInput")
          .attr("value", this.minAggrSize.get())
          .attr(
            "max",
            d3.max(this._aggrs, (_cat) => _cat.records.length)
          )
          .on("input", (event) => {
            if (_timer) window.clearTimeout(_timer);
            _timer = window.setTimeout(async () => {
              await this.minAggrSize.set( Math.max(2, 1 * event.currentTarget.value) );
            }, 500);
          });
      },
      preSet: async (v) => Math.max(1, v),
      onSet: (v) => this.setMinAggrSize(v),
    });

    this.setSortingOption();

    this.finishTemplateSpecial();
  }

  // TODO incomplete
  getAggrWithLabel(v: string): Aggregate_Category {
    return this.catTable_id[v];
  }

  getAggregate(v: string): Aggregate_Category {
    let aggr = this.catTable_id[v];
    if (!aggr) {
      aggr = new Aggregate_Category(this, v);
      if(this.catLabel_attr[v]){
        aggr.label = this.catLabel_attr[v];
      }
      this.catTable_id[v] = aggr;
      this._aggrs.push(aggr);
      this.browser.allAggregates.push(aggr);
    }
    return aggr;
  }

  initializeAggregates(): void {
    if (this.aggr_initialized) return;

    this.catTable_id = {};
    this._aggrs = [];
    this.removedAggrs = [];

    var maxDegree = 0;

    this.records.forEach((record) => {
      var catValues = this.template.func.call(record.data, record);

      // make catValues an array if it is not
      if (!Array.isArray(catValues)) catValues = [catValues];

      // trim whitespaces, remove invalid / empty string values
      catValues = catValues
        .map((e) => (e && e.trim ? e.trim() : e))
        .filter((e) => e != null && e !== "")
        .map((e) => "" + e); // convert to string

      catValues = new Set(catValues); // remove duplicates

      // Record is not mapped to any value (missing value)
      if (catValues.size === 0) {
        this.setRecordValueCacheToMissing(record);
        return;
      }

      let cats: string[] = [];
      catValues.forEach((id) => {
        cats.push(id);
        this.getAggregate(id).addRecord(record);
      });
      record.setValue(this, cats);

      maxDegree = Math.max(maxDegree, catValues.size);
    });

    this.maxValueDegree = maxDegree;

    this.aggr_initialized = true;
  }

  // Modified internal dataMap function - Skip rows with 0 active item count
  setMinAggrSize(minSize) {
    if (!this.aggr_initialized) return; // too early
    var newAggrs = 0;
    this.removedAggrs = this.removedAggrs.filter((cat) => {
      if (cat.records.length >= minSize) {
        this._aggrs.push(cat);
        cat.usedAggr = true;
        newAggrs++;
        return false;
      }
      return true;
    });
    this._aggrs = this._aggrs.filter((cat) => {
      if (cat.records.length >= minSize) {
        return true;
      }
      this.removedAggrs.push(cat);
      cat.usedAggr = false;
      cat.isActiveBefore = false;
      cat.isActive = false;
      cat.isVisibleBefore = false;
      cat.isVisible = false;
      delete cat.orderIndex;
      if (cat.DOM.aggrGlyph) {
        cat.DOM.aggrGlyph.remove();
        delete cat.DOM.aggrGlyph;
      }
      return false;
    });
    if (!this.block.DOM.inited) return;
    if (newAggrs) {
      this.block.insertCategoryGlyphs();
      this.block.refreshLabelWidth();
    }
    this.block.updateCats_IsActive();

    this.block.refreshHeight_Category();
    this.block.refreshConfigRowCount();
    this.block.updateCatSorting_now();
  }

  // ********************************************************************
  // Set summary / Maximum degree
  // ********************************************************************

  public setAttrib?: Attrib_Set | null = null;

  private _maxValueDegree = 1;
  get maxValueDegree() {
    return this._maxValueDegree;
  }
  get isMultiValued() {
    return this.maxValueDegree > 1;
  }
  set maxValueDegree(v) {
    var _pre = this.maxValueDegree || 1;
    this._maxValueDegree = v;

    if (this._maxValueDegree !== _pre) {
      this.block.DOM.root
        ?.classed("isMultiValued", this.isMultiValued)
        .classed("supportsSetMatrix", this.supportsSetMatrix);
      // not ideal, need to generate the full list for now.
      this.block.DOM.nugget
        ?.select(".fa-tags")
        .classed("active", this.isMultiValued);
    }
  }
  get supportsSetMatrix(): boolean {
    // TODO: make this a configurable option?
    return this.isMultiValued && this._aggrs.length >= 5;
  }

  showSetSummary() {
    if (this.setAttrib) {
      this.setAttrib.block.refreshPopupSide();
      return;
    }

    this.setAttrib = new Attrib_Set(this.browser, this);
    this.setAttrib.initializeAggregates();
  }

  onAggrClick(event, ctgry: Aggregate_Category) {
    if (this.browser.adjustMode) return;
    if (!this.isCatSelectable(ctgry)) return;

    if (event && event.altKey) {
      this.filterCategory(ctgry, "NOT");
      //
    } else if (event && event.shiftKey) {
      this.browser.setSelect_Compare(ctgry, null, false);
      this.browser.lockSelect_Compare();
      //
    } else if (this.dblClickTimer) {
      this.unselectAllCategories();
      this.filterCategory(ctgry, "AND", "All");
      //
    } else if (ctgry.isFiltered()) {
      this.filterCategory(ctgry, "NONE");
      //
    } else if (this.isMultiValued || this.summaryFilter.selected_None()) {
      this.filterCategory(ctgry, "AND");
      //
    } else {
      // category not filtered, summary not multi-valued, and has some selection - remove all other selections.
      this.summaryFilter.selected_AndOrNot().forEach((_) => _.set_NONE());

      this.filterCategory(ctgry, "AND", "All");
    }

    if (this.isMultiValued) {
      this.dblClickTimer = window.setTimeout(() => {
        this.dblClickTimer = null;
      }, 500);
    }
  }

  onAggrHighlight(aggr: Aggregate_Category) {
    if (this.browser.adjustMode) return;
    if (!this.isCatSelectable(aggr)) return;
    if (this.browser.mouseOverCompare.is(false)) return;

    aggr.DOM.matrixRow?.setAttribute("selection", "selected");

    // Comes after setting select type of the category - visual feedback on selection...
    if (!this.isMultiValued && this.summaryFilter.selected_AND.length !== 0)
      return;

    // Show the highlight
    if (aggr.filtered_NOT()) return;
    if (this.isMultiValued || this.summaryFilter.selected_AND.length === 0) {
      this.browser.setSelect_Compare(aggr);
    }
  }

  onAggrLeave(aggr: Aggregate_Category) {
    if (this.browser.adjustMode) return;
    if (aggr.locked) return;
    aggr.unselectAggregate();
    if (!this.isCatSelectable(aggr)) return;
    this.browser.clearSelect_Compare();
  }

  // ********************************************************************
  // Filtering
  // ********************************************************************

  public summaryFilter: Filter_Categorical | null = null;

  createSummaryFilter() {
    this.summaryFilter = new Filter_Categorical(this.browser, this);
  }

  // ********************************************************************
  // Sorting
  // ********************************************************************

  public catSortBy: CatSortSpec = "Active";
  public catSortInverse = false;
  public pleaseSort = false;

  private _dirtySort = true;
  set dirtySort(v) {
    this._dirtySort = v;
    this.block.DOM.catSortButton?.classed("resort", v);
  }
  get dirtySort() {
    return this._dirtySort || false;
  }

  setSortingOption(opt: CatSortSpec = "Active") {
    this.catSortBy = opt;
  }

  get catOrder_Dynamic(): boolean {
    if (typeof this.catSortBy === "string") {
      if (this.catSortBy === "alphanumeric") return false;
      if (this.catSortBy === "id") return false;
      return true; // "Active", "Compare_X"
    }
    return false;
  }
  get catOrder_Fixed() {
    return !this.catOrder_Dynamic;
  }
  setFixedCatOrder() {
    // generates array of strings, from categorical aggregates, with the order of orderIndex
    var m = this._aggrs.reduce((acc, aggr: Aggregate_Category) => {
      acc[aggr.orderIndex] = aggr.label;
      return acc;
    }, []);

    this.setSortingOption(m);
    this.block.updateCatSorting_now();
  }

  _sortCategories() {
    var compare_int = (a, b) => a - b;
    var compare_str = (a, b) => Util.sortFunc_List_String(a, b);
    var compare_func = (v) =>
      typeof v === "string" ? compare_str : compare_int;

    var theSortFunc: (a: Aggregate_Category, b: Aggregate_Category) => number =
      null;
    var valueFunc: Function = null;

    if (typeof this.catSortBy === "string") {
      if (this.catSortBy === "alphanumeric") {
        valueFunc = (aggr) => aggr.label;
      } else if (this.catSortBy === "id") {
        valueFunc = (aggr) => aggr.id;
      } else {
        // Active, Compare_X
        let getV = (aggr: Aggregate_Category) =>
          this.browser.getChartValue(aggr, this.catSortBy);

        // Dynamic sorting
        theSortFunc = (
          a: Aggregate_Category,
          b: Aggregate_Category
        ): number => {
          // selected on top of the list
          if (!a.isFiltered() && b.isFiltered()) return 1;
          if (a.isFiltered() && !b.isFiltered()) return -1;
          // usedAggr === false => on the bottom
          if (!a.usedAggr && b.usedAggr) return 1;
          if (a.usedAggr && !b.usedAggr) return -1;

          var x = getV(b) - getV(a);
          if (x === 0) x = b.measure("Total") - a.measure("Total");
          return x;
        };
      }
    } else {
      if (Array.isArray(this.catSortBy)) {
        // convert the array into a lookup table for sort-order of the category.
        var _lookup: { [index: string]: number } = {};
        this.catSortBy.forEach((s, i) => {
          _lookup[s] = i + 1;
        });
        valueFunc = (aggr) => _lookup[aggr.id] || 99999;
      } else {
        valueFunc = this.catSortBy.valueFunc;
        if (this.catSortBy.preSort) {
          this.catSortBy.preSort.call(this);
        }
      }
    }

    if (valueFunc) {
      let getV = (aggr: Aggregate_Category): number => valueFunc(aggr);

      var valueCompareFunc = compare_func(getV(this._aggrs[0])); // int or string comparison, based on first aggr

      theSortFunc = (a: Aggregate_Category, b: Aggregate_Category): number =>
        valueCompareFunc(getV(a), getV(b));
    }

    var idCompareFunc = compare_func(this._aggrs[0].label);

    this._aggrs.sort((a, b) => {
      var _ = theSortFunc(a, b);
      if (_ === 0) _ = idCompareFunc(a.label, b.label);
      return this.catSortInverse ? -_ : _;
    });

    this.dirtySort = false;
    this.pleaseSort = false;
  }

  doSortInverse() {
    if (this.dirtySort) {
      this.dirtySort = false; // will refresh sorting on next updateCatSorting call
    } else {
      this.catSortInverse = !this.catSortInverse;
    }
    this.pleaseSort = true;
    this.block.updateCatSorting(0); // no delay, animated
  }

  getSortMenuOpts() {
    return {
      name: "Sorting",
      items: [
        {
          id: "DynamicSort",
          name: "Active",
          iconClass: "fal fa-sort-amount-down",
          active: this.catSortBy === "Active",
          helparticle: "5e87dcde04286364bc97d08e",
          do: (summary, action) => {
            this.setSortingOption();
            this.pleaseSort = true;
            this.block.updateCatSorting(0, true); // no delay, with animation
          },
        },
        {
          id: "DynamicSort",
          name:
            i18n["Compared"] +
            ": " +
            (this.browser.comparedAttrib
              ? `<span class='comparedSummaryName'>${this.browser.comparedAttrib.attribName}</span>`
              : ""),
          iconClass: "fal fa-sort-numeric-down",
          active:
            typeof this.catSortBy === "string" &&
            this.catSortBy.startsWith("Compare"),
          helparticle: "5e87e12704286364bc97d09e",
          when: (_block) =>
            _block.browser.activeComparisonsCount > 0 &&
            (_block.attrib !== _block.browser.comparedSummary ||
              _block.attrib.isMultiValued),
          do: (_attrib, action) => {
            // TODO: Take the selected comparison AND the breakdown type/values into account
            this.setSortingOption(action);
            this.pleaseSort = true;
            this.block.updateCatSorting(0, true); // no delay, with animation
          },
          options: (_block) =>
            this.browser.activeComparisons.map((cT) => ({
              name: this.browser.selectedAggrs[cT].label,
              iconClass: "colorBox bg_" + cT,
              active: this.catSortBy === cT,
              value: cT,
            })),
        },
        {
          id: "AlphaNumSort",
          name: "Alphabetical",
          iconClass: "fal fa-sort-alpha-down",
          active: this.catSortBy === "alphanumeric",
          helparticle: "5e87df292c7d3a7e9aea6032",
          do: () => {
            this.setSortingOption("alphanumeric");
            this.pleaseSort = true;
            this.block.updateCatSorting(0, true); // no delay, with animation
          },
        },
        {
          id: "CustomSort",
          name: "Custom",
          active: Array.isArray(this.catSortBy),
          iconClass: "fal fa-sort-shapes-down",
          helparticle: "5e87ddbf2c7d3a7e9aea602e",
          do: () => {
            this.setFixedCatOrder();
          },
        },
        {
          id: "SetMatrixSort",
          name: "Relatedness",
          iconClass: "fa fa-th",
          when: (summary) => summary.setSummary && summary.show_set_matrix,
          do: () => {
            // Update sorting options of setListSummary (adding relatednesness metric...)
            this.setSortingOption({
              valueFunc: (aggr) => -aggr.MST?.order,
              preSort: () => this.setAttrib.updatePerceptualOrder(),
            });
            this.pleaseSort = true;
            this.block.updateCatSorting_now(); // no delay, no animation
          },
        },
        // *************************
        {
          id: "reverseSort",
          name: "Inverse",
          iconClass: "fal fa-exchange reverseSortIcon",
          active: this.catSortInverse,
          helparticle: "5e87e22904286364bc97d0a9",
          do: () => this.doSortInverse(),
        },
      ],
    };
  }

  // ********************************************************************
  // Filtering!
  // ********************************************************************

  unselectAllCategories() {
    this._aggrs.forEach((cat) => cat.set_NONE());
    this.summaryFilter.selected_All_clear();
    this.block.DOM.noValueAggr?.classed("filtered", false);
  }

  filterCategory(
    ctgry: Aggregate_Category,
    what: "AND" | "OR" | "NOT" | "NONE",
    how = null,
    update = true
  ) {
    if (!ctgry) {
      return;
    }

    if (this.browser.skipSortingSummary) {
      // you can now sort the last filtered summary, attention is no longer there.
      this.browser.skipSortingSummary.dirtySort = false;
    }

    this.browser.skipSortingSummary = this;
    this.dirtySort = true;

    if (
      this.summaryFilter.selected_OR.length > 0 &&
      (this.summaryFilter.selected_AND.length > 0 ||
        this.summaryFilter.selected_NOT.length > 0)
    ) {
      how = "All";
    }

    // if selection is in same mode, "undo" to NONE.
    if (what === "NOT" && ctgry.filtered_NOT()) what = "NONE";
    if (what === "AND" && ctgry.filtered_AND()) what = "NONE";
    if (what === "OR" && ctgry.filtered_OR()) what = "NONE";

    if (what === "NONE") {
      if (ctgry.filtered_AND() || ctgry.filtered_NOT()) {
        how = how ?? "MoreResults";
      }
      if (ctgry.filtered_OR()) {
        how = how ?? 
          this.summaryFilter.selected_OR.length === 0
            ? "MoreResults"
            : "LessResults";
      }
      ctgry.set_NONE();
      if (
        this.summaryFilter.selected_OR.length === 1 &&
        this.summaryFilter.selected_AND.length === 0
      ) {
        this.summaryFilter.selected_OR.forEach((a) => {
          a.set_NONE();
          a.set_AND(this.summaryFilter.selected_AND);
        });
      }
      if (!this.summaryFilter.selected_Any()) this.dirtySort = false;
      //
    } else if (what === "NOT") {
      if (!ctgry.isFiltered()) {
        if (
          ctgry.recCnt("Active") ===
          this.browser.allRecordsAggr.recCnt("Active")
        ) {
          Modal.alert(i18n.DialogEmptyResultSet);
          return;
        }
        how = how ?? "LessResults";
      } else {
        how = how ?? "All";
      }
      ctgry.set_NOT(this.summaryFilter.selected_NOT);
      //
    } else if (what === "AND") {
      if (ctgry.filtered_NOT() || ctgry.filtered_OR()) {
        how = how ?? "All"; // change from NOT to AND
      } else {
        how = how ?? "LessResults";
      }
      ctgry.set_AND(this.summaryFilter.selected_AND);
      //
    } else if (what === "OR") {
      if (!this.isMultiValued && this.summaryFilter.selected_NOT.length > 0) {
        var temp = [];
        this.summaryFilter.selected_NOT.forEach((a) => temp.push(a));
        temp.forEach((a) => a.set_NONE());
      }
      if (
        this.summaryFilter.selected_OR.length === 0 &&
        this.summaryFilter.selected_AND.length === 1
      ) {
        this.summaryFilter.selected_AND.forEach((a) => {
          a.set_NONE();
          a.set_OR(this.summaryFilter.selected_OR);
        });
      }
      ctgry.set_OR(this.summaryFilter.selected_OR);
      how = how ?? "MoreResults";
    }

    if (
      this.summaryFilter.selected_OR.length > 0 &&
      (this.summaryFilter.selected_AND.length > 0 ||
        this.summaryFilter.selected_NOT.length > 0)
    ) {
      how = "All";
    }
    if (this.noValueAggr.filtered === "in") {
      how = "All";
    }

    this.summaryFilter.how = how;

    if (this.summaryFilter.selectedCount_Total() === 0) {
      this.summaryFilter.clearFilter();
      return;
    }

    this.block.clearCatTextSearch();

    // if no-values were filtered in, this causes conflict, so reset to not filtered
    if (this.noValueAggr.filtered === "in") {
      this.noValueAggr.filtered = false;
    }

    this.block.DOM.root?.classed(
      "hasMultiAnd",
      this.summaryFilter.selected_AND.length > 1
    );

    this.summaryFilter.setFiltered(update);
  }

  isCatSelectable(category: Aggregate_Category) {
    if (category.isFiltered()) return true;
    if (category.recCnt("Active") !== 0) return true;
    // Show if multiple attributes are selected and the summary does not include multi value records
    if (this.isFiltered() && !this.isMultiValued) return true;
    // Hide
    return false;
  }

  dblClickTimer: number = 0;

  autoCompare() {
    var _autoCompare = () => {
      var _index = 0;
      Base.Compare_List.forEach((cT) => {
        if (this.browser.vizActive(cT)) return;
        var aggr;
        while (true) {
          aggr = this._aggrs[_index];
          if (!aggr) return;
          if (!aggr.locked && aggr.Active.measure > 0) break;
          _index++;
        }
        this.browser.setSelect_Compare(aggr, cT, false);
        this.browser.lockSelect_Compare(false);
      });

      this.browser.refreshConfigs();
    };

    if (this.browser.comparedAttrib && !this.isComparedAttrib()) {
      Modal.confirm(
        i18n.DialogChangeCompare(
          this.attribNameHTML,
          this.browser.comparedAttrib.attribNameHTML
        ),
        i18n.Confirm
      ).then(
        () => {
          this.browser.clearSelect_Compare(
            this.browser.activeComparisons,
            false,
            true
          ); // don't finalize yet
          _autoCompare();
        },
        () => {}
      );
    } else {
      _autoCompare();
    }
  }

  // ********************************************************************
  // Mapping
  // ********************************************************************

  public catGeo: string = null;

  private mapTable: MapData = null;

  public mapInitView: [number, number, number] = null;

  public mapConfig: any; // leaflet

  async loadMap() {
    if (this.mapTable) return;

    this.mapTable = Base.maps.get(this.catGeo);

    if (!this.mapTable) {
      throw new Error(i18n.Error_CannotFindMap(this.catGeo));
    }

    await this.mapTable.loadGeo();

    // Call mapping function to store category geometry
    this.catMap_storeCatGeo();

    // Abort if none of the categories match to map data.
    if (this._aggrs.length > 0 && this._aggrs.every((_cat) => !_cat._geo_)) {
      this.removeCatGeo();
      throw new Error(i18n.Error_CannotMatchMap(this.catGeo));
    }
  }

  hasMap(): boolean {
    return this.catGeo !== null;
  }

  catMap_storeCatGeo() {
    this._aggrs.forEach((aggr) => {
      aggr._geo_ =
        this.mapTable.getFeature(aggr.id.toUpperCase()) ||
        this.mapTable.getFeature(aggr.label.toUpperCase());

      if (
        // not found
        !aggr._geo_ ||
        // only accept geojson definitions. A crude approximation.
        typeof aggr._geo_ !== "object" ||
        typeof aggr._geo_.type === undefined
      ) {
        aggr._geo_ = null;
      }
    });
  }

  setCatGeo(template) {
    this.catGeo = template;
    this.block.DOM.root?.attr("hasMap", true);
  }

  removeCatGeo() {
    this.catGeo = null;
    this._aggrs.forEach((_cat) => {
      _cat._geo_ = null;
    });
    this.block.removeCatGeo();
    this.mapTable = null;
  }

  uniqueCategories() {
    return (
      !this.isEmpty() &&
      this._aggrs.length === this.browser.records.length && 
      !this.isMultiValued
    );
  }

  async setCatGeo_(template) {
    if (!this.uniqueCategories()) {
      this.setCatGeo(template);
      this.block.catViewAs("map");

    } else {
      // Per-record map: Define new summary
      this.browser.recordDisplay.setAttrib(
        "geo",
        this.browser.createAttrib(
          "_REGION",
          // replace [*] with [*.]
          template
            .replace("[*]", "[*." + this.template + "]")
            .replace("[UPPERCASE(*)]", "[UPPERCASE(*." + this.template + ")]"),
          "recordGeo"
        )
      );

      if (this.browser.recordChartType.is("none")) {
        await this.browser.recordChartType.set("map");
      }

      this.browser.refreshAttribList();
    }
  }

  // ********************************************************************
  // Cat labels
  // ********************************************************************

  public catLabel_attr: CatLabelSpec = {};

  setCatLabel(template: CatLabelSpec = {}) {
    this.catLabel_attr = template;
    this._aggrs.forEach((aggr) => {
      aggr.label = this.catLabel_attr[aggr.id] || "";
    });

    this.block?.DOM.catLabel?.html((aggr: Aggregate_Category) => aggr.label);
  }

  getRecordValue(record: Record): string[] {
    var r = record.getValue(this);
    if (r == null) return r;
    return r.map((_) => this.catLabel_attr[_] || _);
  }

  getFormattedValue(v: any, _isSVG: any): string {
    return this.renderRecordValue(v);
  }

  renderRecordValue(v, d3_selection = null): string {
    if (v instanceof Record) v = this.getRecordValue(v);

    var getHTML = (_url) => {
      var _href = _url.href;
      if (_url.protocol === "http:" || _url.protocol === "https:") {
        if (/\.(gif|jpg|jpeg|tiff|png|svg)$/i.test(_url.pathname)) {
          // show as image
          return `<img src='${_href}' class='autoDetectedImg'>`;
        }
        // show as link
        return `<a class='linkInData' href='${_href}' rel='noopener noreferrer' target='_blank'>" ${_href}</a>`;
      }
      return _href;
    };

    var _finalize = (_value) => {
      if (d3_selection) d3_selection.html(_value);
      else return _value;
    };

    var _value = v
      .map((_) => {
        if (this.catTable_id[_]) return this.catTable_id[_].label;
        if (_ == null) return "-";
        return _ + "";
      })
      .map((_) => {
        try {
          var _url = new URL(_);
          if (_url.protocol === "gs:" && (window as any).firebase) {
            return (window as any).firebase
              .storage()
              .refFromURL(_url.href)
              .getDownloadURL()
              .then((url) => {
                var __url = new URL(url);
                // update lookup table label to resolved URL
                if (this.catTable_id[_]) this.catTable_id[_].label = __url.href;

                return _finalize(getHTML(__url));
              });
          }
          _ = getHTML(_url);
        } catch (exception) {
        } finally {
          return _;
        }
      })
      .join("<br>");

    return _finalize(_value);
  }

  // ********************************************************************
  // Export / import
  // ********************************************************************

  async applyConfig(blockCfg: SummarySpec) {
    super.applyConfig(blockCfg);

    if (blockCfg.mapInitView) {
      this.mapInitView = blockCfg.mapInitView;
    }
    if (blockCfg.mapConfig) {
      this.mapConfig = blockCfg.mapConfig;
    }

    await this.measureScaleType.set(blockCfg.measureScaleType);
    await this.barHeight.set(blockCfg.barHeight);
    await this.minAggrSize.set(blockCfg.minAggrSize);

    if (blockCfg.catLabel) {
      this.setCatLabel(blockCfg.catLabel);
    }
    if (blockCfg.catGeo) {
      this.setCatGeo(blockCfg.catGeo);
    }
    if (blockCfg.invertedColorTheme) {
      this.block.catMap_invertColorTheme(blockCfg.invertedColorTheme);
    }

    if (blockCfg.splitOnSelfCompare === false) {
      this.block.splitOnSelfCompare = false;
    }

    if (["SingleSelect", "MultiSelect"].includes(blockCfg.dropdown_type)) {
      this.block.dropdown_type = blockCfg.dropdown_type;
    }

    if (blockCfg.filter) {
      this.summaryFilter.importFilter(blockCfg.filter);
    } else if (this.isFiltered()) {
      this.summaryFilter.clearFilter();
    }

    // SORTING RELATED CONFIGURATION
    if (blockCfg.catSortInverse) {
      this.catSortInverse = true;
    }
    if (blockCfg.catSortBy) {
      this.setSortingOption(blockCfg.catSortBy);
    }

    if (blockCfg.viewAs) {
      // map vs list
      this.block.catViewAs(blockCfg.viewAs);
    }
    if (blockCfg.showSetMatrix) {
      this.block.showSetMatrix(blockCfg.showSetMatrix);
    }
  }

  exportConfig() {
    var config = super.exportConfig();

    var t: SummaryConfig_Categorical = {
      viewAs: this.block.viewType,
      catGeo: this.catGeo,
      catLabel: this.catLabel_attr,
      catSortBy: this.catSortBy,
      catSortInverse: this.catSortInverse,
      invertedColorTheme: this.block.invertedColorTheme,
      barHeight: this.barHeight.exportValue(),
      splitOnSelfCompare: this.block.splitOnSelfCompare,
      dropdown_type: this.block.isView_Dropdown
        ? this.block.dropdown_type
        : undefined,
      filter: this.summaryFilter.exportFilter()
    };

    return Object.assign({}, config, t);
  }
}
