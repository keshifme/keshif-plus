import { select, pointer } from "./d3_select";
import { scaleTime, scaleLinear } from "d3-scale";
import { extent } from "d3-array";
import { arc } from "d3-shape";

import { Base } from "./Base";
import { Config } from "./Config";
import { RecordDisplay } from "./RecordDisplay";
import { RecordView } from "./RecordView";
import { Attrib_Timestamp } from "./Attrib_Timestamp";
import { Attrib_Numeric } from "./Attrib_Numeric";
import { Util } from "./Util";
import { Record } from "./Record";
import { i18n } from "./i18n";
import { CompareType, RecordVisCoding } from "./Types";
import { Attrib } from "./Attrib";

const d3 = { select, pointer, scaleTime, scaleLinear, extent, arc };

export class RecordView_List extends RecordView {
  // ********************************************************************
  // Configurations
  // ********************************************************************

  list_showRank: Config<boolean>;
  list_sortVizRange: Config<"dynamic" | "static">;
  list_ViewType: Config<"List" | "Grid">;
  list_sortInverse: Config<boolean>;
  list_sortColWidth: Config<number>;
  list_sortVizWidth: Config<number>;
  list_sparklineVizWidth: Config<number>;
  list_gridRecordWidth: Config<number>;

  listSortVizScale: any; // d3 scale

  /** -- */
  async prepareAttribs() {
    if (!this.sortAttrib) {
      await this.rd.setAttrib("sort", this.rd.config.sortBy || 0);
    }
    return Promise.resolve(this.sortAttrib !== null);
  }

  constructor(rd: RecordDisplay, config) {
    super(rd);

    this.list_showRank = new Config<boolean>({
      cfgClass: "list_showRank",
      cfgTitle: "Ranking",
      iconXML: "⩔",
      default: false,
      parent: this,
      helparticle: "5e88d84d04286364bc97d40f",
      tooltip: `The ranking column`,
      itemOptions: [
        { name: "Hide", value: false },
        { name: "Show", value: true },
      ],
      onSet: () => {
        if (!this.initialized) return;
        this.refreshShowRank();
      },
    });

    this.list_sortVizRange = new Config<"dynamic" | "static">({
      cfgClass: "list_sortVizRange",
      cfgTitle: "Sorting Vis Axis",
      iconClass: "fa fa-long-arrow-right",
      default: "dynamic",
      parent: this,
      //helparticle: "5e88d84d04286364bc97d40f",
      tooltip: `The viz scale used for sorting column`,
      itemOptions: [
        { name: "Static", value: "static" },
        { name: "Dynamic", value: "dynamic" },
      ],
      onSet: () => {
        if (!this.initialized) return;
        this.refreshSortVizScale();
      },
    });

    this.list_ViewType = new Config<"List" | "Grid">({
      cfgClass: "list_ViewType",
      cfgTitle: "List Type",
      iconClass: "fa fa-list",
      default: "List",
      parent: this,
      helparticle: "5f107e492c7d3a10cbaacc43",
      itemOptions: [
        { name: "List <i class='fa fa-bars'></i>", value: "List" },
        { name: "Grid <i class='fa fa-th'></i>", value: "Grid" },
      ],
      onSet: async (v) => {
        this.DOM.root.attr("data-list_ViewType", v);
        if (!this.initialized) return;
        this.refreshWidthControls();
        if (v === "List") {
          await this.list_sortVizWidth?.reset();
          await this.list_sparklineVizWidth?.reset();
        } else {
          this.refreshSparklineViz();
        }
      },
    });

    this.list_sortInverse = new Config<boolean>({
      cfgClass: "list_sortInverse",
      cfgTitle: "Sorting Order",
      iconClass: "fa fa-sort-amount-asc",
      default: false,
      parent: this,
      helparticle: "5e87f08e2c7d3a7e9aea6081",
      itemOptions: [
        { name: "Large to small", value: false },
        { name: "Small to large", value: true },
      ],
      onSet: () => {
        if (!this.initialized) return;
        this.reverseOrder();
        this.DOM.root
          ?.select(".recordReverseSortButton")
          .classed("sortInverse", this.list_sortInverse.is(true));
      },
    });

    this.list_sortColWidth = new Config<number>({
      cfgClass: "list_sortColWidth",
      cfgTitle: "Sorting Value Width",
      iconClass: "fa fa-arrows-h",
      default: 60,
      parent: this,
      helparticle: "5f107eb904286306f806ec35",
      itemOptions: [
        { name: "<i class='fa fa-minus'></i>", value: -99, _type: "minus" },
        { _type: "_range_", minValue: 40, maxValue: 120 },
        { name: "<i class='fa fa-plus'></i>", value: -199, _type: "plus" },
      ],
      preSet: async (v, obj) => {
        if (v === -99) {
          v = obj._value - 5;
        } else if (v === -199) {
          v = obj._value + 5;
        }
        return Math.max(40, Math.min(120, v));
      },
      onSet: (v) => {
        this.browser.DOM.root
          .node()
          .style.setProperty("--list_sortColWidth", v + "px");
        this.refreshSortColumnWidth();
      },
    });

    this.list_sortVizWidth = new Config<number>({
      cfgClass: "list_sortVizWidth",
      cfgTitle: "Sorting Bar Width",
      iconClass: "fa fa-arrows-h",
      default: 80,
      parent: this,
      helparticle: "5e87f23c04286364bc97d0e3",
      itemOptions: [
        { name: "<i class='fa fa-minus'></i>", value: -99, _type: "minus" },
        { name: "Off", value: 0 },
        { _type: "_range_", minValue: 40, maxValue: 400 },
        { name: "<i class='fa fa-plus'></i>", value: -199, _type: "plus" },
      ],
      forcedValue: (obj) => {
        if (this.sortAttrib instanceof Attrib_Timestamp) return 0;
        if (this.list_ViewType.is("Grid") && obj._value !== 0)
          return this.list_gridRecordWidth.get() - 10;
      },
      preSet: async (v, obj) => {
        if (v === -99) {
          v = obj._value - 5;
        } else if (v === -199) {
          v = obj._value + 5;
        }
        if (v < 40) return 0;
        return Math.min(400, v);
      },
      onSet: (v) => {
        if (!this.initialized) return;
        this.browser.DOM.root
          .node()
          .style.setProperty("--list_sortVizWidth", v + "px");
        this.browser.DOM.root.classed("noAnim", true);

        this.refreshSortVizWidth();
        setTimeout(() => this.browser.DOM.root.classed("noAnim", false), 1000);
      },
    });

    this.list_sparklineVizWidth = new Config<number>({
      cfgClass: "list_sparklineVizWidth",
      cfgTitle: "Sparkline Width",
      iconClass: "far fa-chart-line",
      default: 120,
      parent: this,
      helparticle: "5e87f16904286364bc97d0e2",
      itemOptions: [
        { name: "<i class='fa fa-minus'></i>", value: -99, _type: "minus" },
        { name: "Off", value: 0 },
        { _type: "_range_", minValue: 50, maxValue: 300 },
        { name: "<i class='fa fa-plus'></i>", value: -199, _type: "plus" },
      ],
      forcedValue: (obj) => {
        if (!this.sortAttrib?.hasTimeSeriesParent()) return 0;
        if (this.list_ViewType.is("Grid") && obj._value !== 0)
          return this.list_gridRecordWidth.get() - 10;
      },
      preSet: async (v, obj) => {
        if (v === -99) {
          v = obj._value - 5;
        } else if (v === -199) {
          v = obj._value + 5;
        }
        if (v < 50) return 0;
        return Math.min(300, v);
      },
      onSet: (v) => {
        if (!this.initialized) return;
        this.browser.DOM.root
          .node()
          .style.setProperty("--list_sparklineVizWidth", v + "px");
        this.refreshSparklineVizWidth();
      },
    });

    this.list_gridRecordWidth = new Config<number>({
      cfgClass: "list_gridRecordWidth",
      cfgTitle: "Grid Record Width",
      iconClass: "fa fa-arrows-h",
      default: 200,
      parent: this,
      helparticle: "5f10800c04286306f806ee67",
      itemOptions: [
        { name: "<i class='fa fa-minus'></i>", value: -99, _type: "minus" },
        { _type: "_range_", minValue: 100, maxValue: 400 },
        { name: "<i class='fa fa-plus'></i>", value: -199, _type: "plus" },
      ],
      preSet: async (v, obj) => {
        if (v === -99) {
          v = obj._value - 5;
        } else if (v === -199) {
          v = obj._value + 5;
        }
        return Math.max(100, Math.min(500, v));
      },
      onSet: (v) => {
        if (!this.initialized) return;
        this.browser.DOM.root
          .node()
          .style.setProperty("--list_gridRecordWidth", v + "px");
        this.refreshSparklineViz();
      },
    });

    [
      "list_ViewType",
      "list_sortInverse",
      "list_showRank",
      "list_sortColWidth",
      "list_sortVizWidth",
      "list_sortVizRange",
      "list_sparklineVizWidth",
      "list_gridRecordWidth",
    ].forEach((t) => {
      this[t].set(config[t]);
      // copy config object to record display as well.
      this.rd.configs[t] = this[t];
      this.rd.recordConfigPanel.insertConfigUI(this[t]);
    });

    // Used in list view
    this.maxVisibleItems_Default =
      config.maxVisibleItems_Default || Base.maxVisibleItems_Default;
    this.maxVisibleRecords = this.maxVisibleItems_Default; // This is the dynamic property
  }

  /** -- */
  initView() {
    this.rd.refreshAttribOptions("sort");

    this.DOM.root.attr("data-list_ViewType", this.list_ViewType.get());

    this.refreshSortColumnWidth();
    this.refreshSortVizWidth();
    this.refreshSparklineVizWidth();

    this.DOM.kshfRecords = this.DOM.recordGroup_List.selectAll(".kshfRecord");

    this.updateRecordSortScale();

    this.refreshRecordVis();
  }

  async initView_DOM() {
    var browserRootStyle = this.browser.DOM.root.node().style;

    browserRootStyle.setProperty(
      "--list_sortColWidth",
      this.list_sortColWidth.get() + "px"
    );
    browserRootStyle.setProperty(
      "--list_sortVizWidth",
      this.list_sortVizWidth.get() + "px"
    );
    browserRootStyle.setProperty(
      "--list_sparklineVizWidth",
      this.list_sparklineVizWidth.get() + "px"
    );
    browserRootStyle.setProperty(
      "--list_gridRecordWidth",
      this.list_gridRecordWidth.get() + "px"
    );

    if (this.DOM.recordGroup_List) {
      this.DOM.recordGroup = this.DOM.recordGroup_List.select(".recordGroup");
      this.DOM.kshfRecords = this.DOM.recordGroup.selectAll(".kshfRecord");

      this.DOM.tableHeaderGroup
        .node()
        .insertBefore(
          this.DOM.sortControlGroup.node(),
          this.DOM.tableConfigGap.node()
        );

      return;
    }

    this.DOM.recordGroup_List = this.rd.DOM.recordDisplayWrapper
      .append("div")
      .attr("class", "recordGroup_List");

    this.DOM.tableHeaderGroup = this.DOM.recordGroup_List
      .append("div")
      .attr("class", "tableHeaderGroup");

    this.DOM.tableHeaderGroup
      .append("div")
      .attr("class", "showRecordRank")
      .append("span")
      .html("Rank");

    this.rd.DOM.sortControlGroup = this.DOM.tableHeaderGroup
      .append("span")
      .attr("class", "sortControlGroup attribControlGroup");

    this.rd.initDOM_AttribSelect("sort");

    this.rd.DOM.sortControlGroup
      .append("span")
      .attr("class", "recordReverseSortButton sortButton")
      .classed("sortInverse", this.list_sortInverse.is(true))
      .tooltip(i18n.ReverseOrder)
      .on("click", async () => await this.list_sortInverse.set(!this.list_sortInverse.get()) )
      .append("span")
      .attr("class", "fa");

    this.DOM.tableConfigGap = this.DOM.tableHeaderGroup
      .append("span")
      .attr("class", "gap");

    var addMoreVisibleItems = () => {
      this.maxVisibleRecords += this.maxVisibleItems_Default;
      this.rd.refreshRecordDOM();
    };

    this.DOM.recordGroup = this.DOM.recordGroup_List
      .append("div")
      .attr("class", "recordGroup")
      .on("scroll", () => {
        if (
          this.maxVisibleRecords <= this.browser.allRecordsAggr.recCnt("Active")
        ) {
          var DOM = this.DOM.recordGroup.node();
          if (!this._recordGroupScroll) {
            var s = window.getComputedStyle(DOM);
            if (s.overflowY === "hidden" && s.overflowX === "scroll")
              this._recordGroupScroll = "left-right";
            else if (s.overflowX === "hidden" && s.overflowY === "scroll")
              this._recordGroupScroll = "top-down";
          }

          if (this._recordGroupScroll === "left-right") {
            if (DOM.scrollWidth - DOM.scrollLeft - DOM.offsetWidth < 500)
              addMoreVisibleItems();
          }
          if (this._recordGroupScroll === "top-down") {
            if (DOM.scrollHeight - DOM.scrollTop - DOM.offsetHeight < 10)
              addMoreVisibleItems();
          }
        }
      });

    var adjustWidth = (event, configObj) => {
      if (event.which !== 1) return; // only respond to left-click
      var mouseDown_width = configObj.val - d3.pointer(event, document.body)[0];

      this.browser.activateWidthDrag(event.currentTarget, event, (event2) => {
        configObj.val = mouseDown_width + d3.pointer(event2, document.body)[0];
      });
    };

    this.DOM.adjustSortColumnWidth = this.DOM.recordGroup_List
      .append("div")
      .attr("class", "adjustSortColumnWidth dragWidthHandle")
      .on("mousedown", (event) => adjustWidth(event, this.list_sortColWidth));

    this.DOM.adjustSortVizWidth = this.DOM.recordGroup_List
      .append("div")
      .attr("class", "adjustSortVizWidth dragWidthHandle")
      .on("mousedown", (event) => adjustWidth(event, this.list_sortVizWidth));

    this.DOM.adjustSparklineVizWidth = this.DOM.recordGroup_List
      .append("div")
      .attr("class", "adjustSparklineVizWidth dragWidthHandle")
      .on("mousedown", (event) =>
        adjustWidth(event, this.list_sparklineVizWidth)
      );

    this.refreshSortVizWidth();
    this.refreshWidthControls();
  }

  /** -- */
  extendRecordDOM(newRecords) {
    if (this.animatedList) {
      newRecords.style(
        "transform",
        `translateY(${this.maxVisibleRecords * this.animatedRecordHeight}px)`
      );
    }

    // RANKINGS
    var _ = newRecords
      .append("span")
      .attr("class", "recordRank")
      .tooltip("-")
      .on("mouseenter", (event, record) => {
        event.currentTarget.setAttribute(
          "title",
          Util.ordinal_suffix_of(record.recordRank + 1)
        );
      })
      .append("span");
    this.refreshRecordRanks(_);
    this.DOM.recordRanks = this.DOM.recordGroup.selectAll(".recordRank > span");

    // RECORD CLICK CALLBACK - Used by multiple DOM nodes
    var onRecordClick = (_event, record) => {
      this.browser.recordDetailsPopup.updateRecordDetailPanel(record);
      if (
        this.sortAttrib instanceof Attrib_Numeric &&
        this.sortAttrib.timeKey
      ) {
        this.browser.recordDetailsPopup.updateFocusedTimeKey(
          this.sortAttrib.timeKey
        );
      }
    };

    // SORTING VALUE LABELS AND BARS

    newRecords.append("div").attr("class", "recordSparklineVizHost");
    newRecords
      .append("div")
      .attr("class", "recordSortValue")
      .on("click", onRecordClick);
    newRecords
      .append("div")
      .attr("class", "recordSortVizHost")
      .on("click", onRecordClick)
      .append("div")
      .attr("class", "recordSortViz");

    this.DOM.recordSortValue =
      this.DOM.recordGroup.selectAll(".recordSortValue");
    this.DOM.recordSortVizHost =
      this.DOM.recordGroup.selectAll(".recordSortVizHost");
    this.DOM.recordSortViz = this.DOM.recordGroup.selectAll(".recordSortViz");
    this.DOM.recordSparklineVizHost = this.DOM.recordGroup.selectAll(
      ".recordSparklineVizHost"
    );

    this.refreshSortViz(newRecords);
    this.refreshSparklineViz();

    this.refreshSortingLabels(newRecords);

    // Insert the content
    newRecords
      .append("div")
      .attr("class", "content")
      .html((record) => this.textAttrib.renderRecordValue(record))
      .on("click", onRecordClick);

    newRecords
      .append("svg")
      .attr("class", "compareBoxes")
      .attr("xmlns", "http://www.w3.org/2000/svg")
      .attr("xmlns:xlink", "http://www.w3.org/1999/xlink")
      .attr("viewBox", "-100 -100 200 200")
      .call((compareBoxes) => {
        Base.Compare_List.forEach((cT) => {
          compareBoxes.append("path").attr("class", "glyph_" + cT);
        });
      });

    // Fixes ordering problem when new records are made visible on the list
    // TO-DO: Try to avoid this.
    this.DOM.recordGroup
      .selectAll(".kshfRecord")
      .data(this.getRecordsForDOM(), (record: Record) => record.id)
      .order();
  }

  // temporary / internal
  private _recordGroupScroll: string = null;

  async finishSetAttrib(t: RecordVisCoding) {
    if (t === "sort") {
      this.sortRecords();

      this.refreshSortVizWidth();

      if (this.DOM.recordGroup_List) {
        this.rd.refreshRecordDOM();
        this.refreshRecordDOMOrder();
        this.refreshRecordRanks();
        this.refreshSortingLabels();
        this.refreshSparklineViz();
        if (this.rd.config.recordRefresh) {
          this.DOM.kshfRecords.each((r) => {
            this.rd.config.recordRefresh.call(r.data, r, this);
          });
        }
      }
    }
    if (t === "text") {
      this.DOM.kshfRecords
        .selectAll(".content")
        .html((record) => this.textAttrib.renderRecordValue(record));
    }
  }

  // ********************************************************************
  // Record sorting
  // ********************************************************************

  /** -- */
  reverseOrder() {
    this.browser.records.reverse();

    var arr = this.browser.records;
    var maxLoop = arr.length;
    for (var i = 0; i < maxLoop; i++) {
      var v = this.sortAttrib.getRecordValue(arr[0]);
      if (v === null || v === undefined) {
        arr.push(arr.shift());
      } else {
        break;
      }
    }

    this.refreshRecordVis();
    this.refreshRecordDOMOrder();
  }

  /** Sort all records given the active sort option
   *  Records are only sorted on init & when active sorting option changes.
   *  They are not resorted on filtering.
   */
  sortRecords() {
    var attrib = this.sortAttrib;
    if (!attrib) return;

    var sortFunc = this.getSortFunc(attrib.template.func);

    var inverse = this.list_sortInverse.is(true);

    this.browser.records.sort((record_A, record_B) => {
      var v_a = attrib.getRecordValue(record_A);
      var v_b = attrib.getRecordValue(record_B);

      if (v_a == null && v_b != null) return 1;
      if (v_b == null && v_a != null) return -1;
      if (v_b == null && v_a == null) return 0;

      // Don't move filtered-out records to end of the list, keep them in sorted order
      // This way, you don't need to re-order after filtering, which is a nice property to have.

      var dif = sortFunc(v_a, v_b);
      return inverse ? -dif : dif;
    });

    this.updateRecordRanks();
  }

  /** Returns the sort value type for given sort Value function */
  getSortFunc(sortValueFunc) {
    // 0: string, 1: date, 2: others
    var sortValueFunction = Util.sortFunc_List_Number;

    // find appropriate sortvalue type
    for (var k = 0, same = 0; true; k++) {
      if (same === 3 || k === this.browser.records.length) break;
      var item = this.browser.records[k];
      var f = sortValueFunc.call(item.data, item);
      if (f == null || f === "") continue;
      var sortValueType_temp2;
      switch (typeof f) {
        case "string":
          sortValueType_temp2 = Util.sortFunc_List_String;
          break;
        case "number":
          sortValueType_temp2 = Util.sortFunc_List_Number;
          break;
        case "object":
          if (f instanceof Date) sortValueType_temp2 = Util.sortFunc_List_Date;
          else sortValueType_temp2 = Util.sortFunc_List_Number;
          break;
        default:
          sortValueType_temp2 = Util.sortFunc_List_Number;
          break;
      }

      if (sortValueType_temp2 === sortValueFunction) {
        same++;
      } else {
        sortValueFunction = sortValueType_temp2;
        same = 0;
      }
    }
    return sortValueFunction;
  }

  // ********************************************************************
  // Record ranking
  // ********************************************************************

  private maxVisibleItems_Default: number;
  maxVisibleRecords: number;

  /** -- */
  updateRecordRanks() {
    var wantedRank = 0;
    var unwantedRank = -1;
    var lastValue = null;
    var lastRank = null;

    // records are sorted, and iterated from top to bottom
    this.browser.records.forEach((record: Record) => {
      var v = this.sortAttrib.getRecordValue(record);

      if (v instanceof Date) v = v.getTime();

      // Records with the same value have the same "rank".
      // Once there value changes, ranking resumes from "total" ranks, counting each same-rank record separately.
      record.recordRank = record.isIncluded
        ? v === lastValue
          ? lastRank
          : wantedRank
        : unwantedRank;

      record.recordRank_Unique = record.isIncluded ? wantedRank : unwantedRank;

      if (record.isIncluded && v !== lastValue) {
        lastValue = v;
        lastRank = record.recordRank;
      }

      if (record.isIncluded) {
        wantedRank++;
      } else {
        unwantedRank--;
      }
    });

    this.maxVisibleRecords = this.maxVisibleItems_Default;
  }

  /** -- */
  refreshShowRank() {
    this.DOM.root.classed("showRank", this.list_showRank.is(true));
    this.refreshRecordRanks();
    this.refreshWidthControls();
  }

  /** -- */
  refreshRecordRanks(d3_selection = null) {
    if (this.list_showRank.is(false)) return;
    if (d3_selection === null) d3_selection = this.DOM.recordRanks;
    d3_selection.text((record) =>
      record.recordRank < 0 ? "" : record.recordRank + 1
    );
  }

  /** -- */
  updateRecordVisibility() {
    this.DOM.kshfRecords.classed(
      "rankBeyondListRange",
      (record) =>
        record.recordRank < 0 || record.recordRank >= this.maxVisibleRecords
    );
  }

  /** -- */
  getRecordsForDOM() {
    return this.browser.records.filter(
      (record: Record) =>
        !record.filteredOut && record.recordRank < this.maxVisibleRecords
    );
  }

  /** -- */
  refreshWidthControls() {
    if (!this.rd.codeBy.sort) return;

    var w_Rank = this.list_showRank.is(true) ? Base.recordRankWidth : 0;
    var w_sortCol = this.list_sortColWidth.get();
    var w_sortViz = this.list_sortVizWidth.get();
    var w_sparkLine = this.list_sparklineVizWidth.get()
      ? this.list_sparklineVizWidth.get() + 8
      : 0;

    this.DOM.adjustSparklineVizWidth?.style(
      "transform",
      `translateX(${w_Rank + w_sparkLine}px`
    );
    this.DOM.adjustSortColumnWidth?.style(
      "transform",
      `translateX(${w_Rank + w_sparkLine + w_sortCol}px)`
    );
    this.DOM.adjustSortVizWidth?.style(
      "transform",
      `translateX(${w_Rank + w_sparkLine + w_sortCol + w_sortViz}px)`
    );

    var w = Math.max(
      150,
      Math.min(500, w_sparkLine + w_sortCol + w_sortViz + 2)
    ); // 2 pixel: margin
    if (this.list_ViewType.is("Grid")) {
      w = 200;
    }

    this.DOM.sortControlGroup?.select(".choices").style("width", w + "px");
  }

  /** -- */
  refreshSortVizScale() {
    var attrib = this.sortAttrib;
    if (!(attrib instanceof Attrib_Numeric)) {
      return; // invalid if not sorting using numeric attribute
    }

    this.listSortVizScale = d3
      .scaleLinear()
      .range([0, this.list_sortVizWidth.get()]);

    if (attrib.isPercentageUnit()) {
      // always 0-100 if percentage unit
      this.listSortVizScale.domain([0, 100]);
      //
    } else if (this.list_sortVizRange.is("dynamic")) {
      // dynamic - based on filtered data
      var [minV, maxV] = d3.extent(this.browser.records, (record) => {
        return record.filteredOut
          ? null
          : this.sortAttrib.getRecordValue(record);
      });
      this.listSortVizScale.domain([Math.min(0, minV), Math.max(0, maxV)]);
      //
    } else if (this.list_sortVizRange.is("static")) {
      // static - based on original domain
      this.listSortVizScale.domain(this.sortAttrib.rangeOrg);
    }

    this.refreshSortViz();
  }

  /** -- */
  refreshSelect_Compare(cT: CompareType = null, status: boolean = false) {
    if (!this.isComparable()) return;

    // Shows evenly spaces pies next to records, filling in colors of all comparisons
    var arcGen = d3.arc().innerRadius(10).outerRadius(100).padAngle(0.15);

    var records = this.DOM.kshfRecords.filter((record: Record) => {
      if (!record.isIncluded) return false;
      if (!record.DOM.record) return false;
      if (cT && record.isSelected(cT) !== status) return false;
      return true;
    });

    if (cT) {
      records = records.filter(
        (record: Record) => record.isSelected(cT) !== status
      );
    }

    records.each((record: Record) => {
      var numPies = record.activeComparisons.length || 1;

      var arcLen = (2 * Math.PI) / numPies;

      var d = d3.select(record.DOM.record);
      record.activeComparisons.forEach((cT, i) => {
        d.select(".glyph_" + cT).attr(
          "d",
          arcGen({
            startAngle: arcLen * i,
            endAngle: arcLen * (i + 1),
          })
        );
      });
    });
  }

  /** -- */
  refreshSortColumnWidth() {
    this.refreshWidthControls();
  }

  /** -- */
  refreshSortVizWidth() {
    this.refreshSortVizScale();

    this.DOM.root.classed("showSortBars", this.list_sortVizWidth.get() > 0);

    this.refreshWidthControls();
  }

  /** -- */
  refreshSparklineVizWidth() {
    if (!this.DOM.recordSparklineVizHost) return;
    this.DOM.recordSparklineVizHost.style(
      "display",
      this.list_sparklineVizWidth.get() === 0 ? "none" : null
    );

    this.refreshSparklineViz();
    this.refreshWidthControls();
  }

  /** -- */
  refreshRecordVis() {
    this.updateRecordRanks();
    this.rd.refreshRecordDOM();
    this.animateList();
    this.refreshRecordRanks();
    this.refreshSortViz();
    this.refreshSparklineViz();
  }

  /** -- */
  refreshSortViz(d3_selection = null) {
    var dom = d3_selection
      ? d3_selection.select(".recordSortViz")
      : this.DOM.recordSortViz;

    if (!dom || dom.nodes().length === 0) return;

    if (!(this.sortAttrib instanceof Attrib_Numeric)) {
      dom.style("width", "0px").style("left", null);
      return;
    }

    var zeroPos = this.listSortVizScale(0);

    dom.style("transform", (record) => {
      var v = this.sortAttrib.getRecordValue(record);
      return `translate(${
        v >= 0 ? zeroPos : this.listSortVizScale(v)
      }px, 0px) scale(${
        v == null ? 0 : Math.abs(this.listSortVizScale(v) - zeroPos)
      },1)`;
    });
  }

  refreshSparklineViz() {
    var attrib = this.sortAttrib;
    if (!attrib) return;
    if (!(attrib instanceof Attrib_Numeric)) return;
    if (!attrib.hasTimeSeriesParent()) return;
    if (!this.DOM.recordSparklineVizHost) return;

    this.DOM.recordSparklineVizHost.style(
      "display",
      this.list_sparklineVizWidth.get() === 0 ? "none" : null
    );
    if (this.list_sparklineVizWidth.get() === 0) return;

    var ts = attrib.timeseriesParent;

    var timeScale = d3
      .scaleTime()
      .domain(ts.timeSeriesScale_Time.domain())
      .range([0, this.list_sparklineVizWidth.get()]);

    var valueScale = d3
      .scaleLinear()
      .domain(ts.timeSeriesScale_Value.domain())
      .rangeRound([27, 3]);

    var activeTime = attrib.timeKey._time;

    var dotPosition = (record, i, nodes) => {
      var v = attrib.getRecordValue(record);
      if (v == null) return "translate(-1000,0)"; // not visible
      var x = timeScale(activeTime);
      var lineData = ts.getRecordValue(record);
      valueScale.domain(lineData.extent_Value_raw);
      var y = valueScale(v);
      nodes[i].classList[y > 13 ? "add" : "remove"]("upper");
      return `translate(${x},${y})`;
    };

    this.DOM.recordSparklineVizHost.selectAll("*").remove();
    var _ = this.DOM.recordSparklineVizHost
      .append("svg")
      .attr("xmlns", "http://www.w3.org/2000/svg")
      .on("mouseleave", (event) => {
        d3.select(event.currentTarget.children[1]).attr(
          "transform",
          dotPosition
        );
      })
      .on("mousemove", (event) => {
        var _time = timeScale.invert(d3.pointer(event, event.currentTarget)[0]);
        var currentDif = 9999999999999; // large number
        var nearestTimeKey = ts.timeKeys[0];
        ts.timeKeys.some((_key) => {
          // _keys are sorted from early to late
          var timeDif = Math.abs(+_key._time - +_time);
          if (timeDif > currentDif) return true; // difference increases, we had just found the right key
          currentDif = timeDif;
          nearestTimeKey = _key;
          return false;
        });
        d3.select(event.currentTarget.children[1]).attr(
          "transform",
          (record, i, nodes) => {
            var x = timeScale(nearestTimeKey._time);
            var _ = ts.getRecordValue(record);
            valueScale.domain(_.extent_Value_raw);
            var tk = _._timeseries_.find(
              (x) => x._time_src === nearestTimeKey._time_src
            );
            let v = tk ? tk._value : null;
            var y = valueScale(v);
            if (y == null) return "translate(-100,-100)"; // No value / no dot / out of screen
            var DOM = nodes[i];
            if (y > 13) DOM.classList.add("upper");
            else DOM.classList.remove("upper");
            return `translate(${x},${y})`;
          }
        );
        d3.select(event.currentTarget.children[1].children[1]).text(
          nearestTimeKey._time_src
        );
      });

    _.append("path")
      .attr("class", "timeline")
      .attr("d", (record) => {
        var lineData = ts.getRecordValue(record);
        if (!lineData || !lineData.extent_Value_raw) return;
        valueScale.domain(lineData.extent_Value_raw);
        return Util.getLineGenerator(
          timeScale,
          valueScale
        )(ts.getRecordValue(record)?._timeseries_);
      });

    var __ = _.append("g")
      .attr("transform", dotPosition)
      .on("click", async (event) => {
        var _time = timeScale.invert(
          d3.pointer(event, event.currentTarget.parentNode)[0]
        );
        var currentDif = 9999999999999; // large number
        var nearestTimeKey = ts.timeKeys[0];
        ts.timeKeys.some((_key) => {
          // _keys are sorted from early to late
          var timeDif = Math.abs(+_key._time - _time);
          if (timeDif > currentDif) return true; // difference increases, we had just found the right key
          currentDif = timeDif;
          nearestTimeKey = _key;
          return false;
        });
        await this.rd.currentTimeKey.set(nearestTimeKey);
      });

    __.append("circle").attr("class", "activeDot").attr("r", 3);
    __.append("text")
      .attr("class", "timekeyText")
      .attr("y", 15)
      .text(attrib.timeKey._time_src);
  }

  animatedList: boolean = false; // TEMP
  animatedRecordHeight: 40;

  /** -- */
  animateList() {
    if (!this.animatedList) return;
    this.DOM.recordGroup_List.classed("animatedList", true);
    this.DOM.kshfRecords.style(
      "transform",
      (record) =>
        `translateY(${record.recordRank_Unique * this.animatedRecordHeight}px)`
    );
  }

  /** -- */
  refreshRecordDOMOrder() {
    if (!this.animatedList) {
      this.DOM.kshfRecords = this.DOM.recordGroup
        .selectAll(".kshfRecord")
        .data(this.browser.records, (record) => record.id)
        .order();
    }
    Util.scrollToPos_do(this.DOM.recordGroup, 0);
    this.animateList();
  }

  /** -- */
  refreshSortingLabels(d3_selection = null) {
    if (!this.sortAttrib) return;
    var sortLabel = this.sortAttrib.sortLabel;
    var dom = d3_selection
      ? d3_selection.selectAll(".recordSortValue")
      : this.DOM.recordSortValue;
    if (!dom) return;
    dom.html((record) => {
      var v = sortLabel.call(this, record);
      return v === "" || v === null || v === "NaN" ? "N/A" : v;
    });
  }

  /** -- */
  updateAfterFilter() {
    this.DOM.recordGroup.node().scrollTop = 0;
    if (this.list_sortVizRange.is("dynamic")) {
      this.refreshSortVizScale();
    }
    this.refreshRecordVis();
  }

  /** -- */
  updateRecordSortScale() {
    this.DOM.root.attr(
      "sortAttribType",
      this.sortAttrib instanceof Attrib_Numeric ? "numeric" : "time"
    );
    this.DOM.root.classed(
      "sortAttribOnTimeseries",
      (this.sortAttrib instanceof Attrib_Numeric &&
        this.sortAttrib.timeseriesParent?.timeKeys.length > 1) ||
        null
    );
  }

  refreshAttribUnitName(attrib: Attrib) {
    if (
      attrib === this.sortAttrib ||
      (this.sortAttrib instanceof Attrib_Numeric &&
        attrib === this.sortAttrib.timeseriesParent)
    ) {
      this.refreshSortingLabels();
    }
  }

  // ********************************************************************
  // No-op's
  // ********************************************************************

  refreshViewSize(_delayMS: number): void {}
}
