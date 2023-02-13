import { select, pointer } from "./d3_select";
import { scaleQuantize } from "d3-scale";
import { max } from "d3-array";
import { format } from "d3-format";
import { hsl } from "d3-color";
import { geoBounds, geoPath, geoTransform } from "d3-geo";

import DOMPurify from "dompurify/dist/purify.es";

import { Aggregate_Category } from "./Aggregate_Category";
import { Attrib_Categorical } from "./Attrib_Categorical";
import { Attrib_Set } from "./Attrib_Set";
import { Modal } from "./UI/Modal";
import { Block } from "./Block";
import { Base } from "./Base";
import { i18n } from "./i18n";
import { Util } from "./Util";

import {
  CompareType,
  DropdownType,
  MeasureType,
  SummaryCatView,
} from "./Types";

declare let L: any;

const d3 = {
  select,
  pointer,
  max,
  format,
  hsl,
  geoBounds,
  geoPath,
  geoTransform,
  scaleQuantize,
};

export class Block_Categorical extends Block {
  // specific attribute type
  public readonly attrib: Attrib_Categorical;
  constructor(attrib: Attrib_Categorical) {
    super(attrib);
  }

  get _aggrs(): Aggregate_Category[] {
    return this.attrib._aggrs;
  }

  get setAttrib(): Attrib_Set | null {
    return this.attrib.setAttrib;
  }

  // ********************************************************************
  // Collapse / add / remove pansl
  // ********************************************************************

  setCollapsed(v: boolean): void {
    super.setCollapsed(v);
    if (this.leafletAttrMap && !this.collapsed) {
      setTimeout(() => {
        this.leafletAttrMap.invalidateSize();
        this.catMap_zoomToActive();
      }, 500);
    }
    if (this.collapsed && this.setAttrib) {
      this.showSetMatrix(false);
    }
  }

  onCollapse() {
    if (!this.collapsed && this.DOM.root && this.isView_List) {
      if (this.attrib.dirtySort) {
        this.updateCatSorting_now();
        this.refreshViz_All();
      }
      this.refreshLabelWidth();
      this.catList_cullCategories();
    }
  }

  addToPanel(panel, index, force = false) {
    var _do = () => {
      super.addToPanel(panel, index);

      if (this.setAttrib) {
        if (this.panel.name === "left" || this.panel.name === "right") {
          this.setAttrib.block.refreshPopupSide();
        } else {
          this.hideSetMatrix();
        }
      }

      this.browser.updateLayout();
    };

    if (
      this._aggrs.length > 500 &&
      this.attrib.minAggrSize.get() === 1 &&
      !force
    ) {
      Modal.confirm(
        "<div style='text-align:center'>There are many (" +
          this._aggrs.length.toLocaleString() +
          ") " +
          "categories in " +
          this.attrib.attribName +
          ".<br>" +
          "Adding all can make your dashboard slower.<br><br>" +
          "Would you like to hide categories with 5 or less records?</div>",
        "Hide small categories",
        "Show all categories"
      )
        .then(async () => await this.attrib.minAggrSize.set(5))
        .finally(() => _do());
    } else {
      _do();
    }
  }

  // ********************************************************************
  // View type control
  // ********************************************************************

  public viewType: SummaryCatView = "list";

  get isView_Dropdown() {
    return this.viewType === "dropdown";
  }
  get isView_List() {
    return this.viewType === "list";
  }
  get isView_Map() {
    return this.viewType === "map";
  }

  async catViewAs(_type) {
    if (_type === "map") {
      try {
        if (!this.attrib.catGeo) throw new Error("No mapping specified");

        if (!(window as any).L) {
          await import("leaflet");
        }

        await this.attrib.loadMap();

        this.mapIsReady = false;
      } catch (error) {
        console.log(error);
        Modal.alert(error.message);
        this.catViewAs("list");
        return;
      }
    }

    this.viewType = _type;

    this.noRefreshVizAxis = this.isView_Dropdown;

    if (!this.DOM.inited) return;
    this.DOM.root.attr("viewType", this.viewType);
    this.DOM.root.selectAll(".summaryViewAs").classed("active", false);
    this.DOM.root
      .selectAll(".summaryViewAs_" + this.viewType)
      .classed("active", true);

    if (this.viewType === "list") {
      this.list_prepView();
    } else if (this.viewType === "map") {
      this.catMap_prepView();
    } else if (this.viewType === "dropdown") {
      this.dropdown_prepView();
    }
  }

  // ********************************************************************
  // Height
  // ********************************************************************

  private _height_Categories = 0;

  public heightRow_category_dirty = false;

  get height_Categories(): number {
    return this._height_Categories;
  }
  get height_Content(): number {
    if (!this.isVisible()) return 0;
    if (this.isView_Dropdown) return this.height_Dropdown;
    return (
      this._height_Categories + this.height_Config + this.height_Bottom + 1
    );
  }
  get height_RangeMin(): number {
    if (this.attrib.isEmpty()) return this.height_Header;
    if (this.isView_Dropdown) return this.height_Dropdown;
    if (this.isView_Map) return this.getWidth() * 0.2;
    return this.height_ListWithoutCats + 1.5 * this.heightCat;
  }
  get height_RangeMax(): number {
    if (this.attrib.isEmpty()) return this.height_Header;
    if (this.isView_Dropdown) return this.height_Dropdown;
    if (this.isView_Map) return this.getWidth() * 1.5;
    return this.height_ListWithoutCats + this._aggrs.length * this.heightCat;
  }
  get heightCat(): number {
    return this.attrib.barHeight.get();
  }
  get height_Dropdown(): number {
    return 42;
  }
  get height_ListWithoutCats(): number {
    return this.height_Header + this.height_Config + this.height_Bottom;
  }
  get height_VisibleAttrib(): number {
    return this.catCount_Active * this.heightCat;
  }
  get height_Config(): number {
    return 18 * (this.hasTextSearch() ? 1 : 0);
  }
  get height_bar_topGap(): number {
    return this.heightCat > 20 ? 4 : 2;
  }
  get barHeight_Full(): number {
    return this.heightCat - 2 * this.height_bar_topGap;
  }
  get height_Bottom(): number {
    if (
      !this.areAllCatsInDisplay() ||
      !this.panel.hiddenCatBars() ||
      this._aggrs.length > 4
    ) {
      this.DOM.summaryCategorical?.classed("nobottoms", false);
      return Base.height_CatBottom;
    }
    this.DOM.summaryCategorical?.classed("nobottoms", true);
    return 0;
  }
  /** -- */
  get catLabelFontSize() {
    var fontSize = this.heightCat - 2;
    if (this.heightCat > 15) fontSize = 13;
    if (this.heightCat > 25) fontSize = 15;
    if (this.heightCat > 30) fontSize = 17;
    if (this.heightCat > 35) fontSize = 19;
    return fontSize;
  }

  hasStaticHeight(): boolean {
    return this.isView_Dropdown;
  }

  setHeight(targetHeight: number): void {
    if (this.attrib.isEmpty()) return;
    // take into consideration the other components in the summary
    targetHeight -=
      this.height_Header + this.height_Config + this.height_Bottom;

    if (this.isView_Map) {
      this._height_Categories = targetHeight;
      setTimeout(() => {
        if (this.leafletAttrMap) this.leafletAttrMap.invalidateSize();
      }, 700);
      return;
    }

    this._height_Categories = Math.min(
      targetHeight,
      this.heightCat * this.catCount_Active - 1
    );
  }
  refreshHeight_Category() {
    if (!this.DOM.inited) return;
    if (!this.isView_List) return;

    this.heightRow_category_dirty = false;

    this.browser.updateLayout();

    this.DOM.aggrGlyphs.style("transform", (_cat) => _cat.transformPos);

    this.refreshHeight_Category_do();
  }
  /** -- */
  refreshHeight_Category_do() {
    this.DOM.aggrGlyphs.style("height", this.heightCat + "px");

    this.DOM.root
      .selectAll(".catLabel")
      .style("font-size", this.catLabelFontSize + "px");

    this.DOM.chartBackground.style("height", this.height_VisibleAttrib + "px");

    this.DOM.catChart.classed(
      "multiLine",
      this.heightCat >= 56 && // 4x
        this.DOM.root.node().style.webkitLineClamp !== undefined
    );

    this.refreshViz_All();
  }

  refreshHeight() {
    super.refreshHeight();
    if (this.attrib.isEmpty() || !this.inDashboard || !this.DOM.inited) return;
    if (this.isView_Dropdown) return;

    // It can be collapsed! - don't use "isVisible" fucntion here
    if (this.collapsed) {
      if (this.isView_Map) this.DOM.catMap_Base.style("height", "0px");
      return;
    }

    // update catCount_InDisplay
    var c = Math.floor(this._height_Categories / this.heightCat);
    if (c < 0) c = 1;
    if (c > this.catCount_Active) c = this.catCount_Active;
    if (this.catCount_Active <= 2) {
      c = this.catCount_Active;
    } else {
      c = Math.max(c, 2);
    }
    this.catCount_InDisplay = c + 1;
    this.catCount_InDisplay = Math.min(
      this.catCount_InDisplay,
      this.catCount_Active
    );

    this.refreshScrollDisplayMore(
      this.firstCatIndexInView + this.catCount_InDisplay
    );

    this.updateCats_IsVisible();
    this.catList_cullCategories();

    this.DOM.headerGroup.attr("allCatsInDisplay", this.areAllCatsInDisplay());

    if (this.isView_Map) {
      this.DOM.catMap_Base.style("height", null);
      if (this.leafletAttrMap) this.leafletAttrMap.invalidateSize();
    }
  }

  catList_cullCategories() {
    if (!this.isView_List) return;
    if (!this.DOM.aggrGlyphs) return;
    this.DOM.aggrGlyphs
      .style("display", (_cat) => (_cat.isVisible ? null : "none"))
      .style("opacity", (_cat) => (_cat.isVisible ? 1 : 0))
      .style("transform", (_cat) =>
        _cat.isVisible ? `translate(0px,${_cat.posY}px)` : null
      );

    if (this.setAttrib && !this.setAttrib.block.pausePanning) {
      this.setAttrib.block.refreshSVGViewBox();
    }
  }

  refreshConfigRowCount() {
    this.DOM.summaryControls?.style(
      "display",
      this.hasTextSearch() ? "block" : null
    );
    this.DOM.wrapper?.classed("showMeasureAxis_2", this.hasTextSearch());
    this.DOM.catTextSearch?.classed("active", this.hasTextSearch());
  }

  // ********************************************************************
  // Width
  // ********************************************************************

  get width_CatLabel() {
    return this.isVisible() ? this.panel.width_CatLabel : 0;
  }
  get width_CatMeasureLabel() {
    return this.isVisible() ? this.panel.width_CatMeasureLabel : 0;
  }
  get width_CatText() {
    return this.isVisible() ? this.panel.width_CatText : 0;
  }
  get width_CatChart() {
    return this.isVisible() ? this.panel.width_CatBars : 1;
  }
  refreshWidth(): void {
    if (!this.DOM.summaryCategorical) return;
    this.attrib.updateChartScale_Measure(); // refreshes viz axis if needed
    if (this.isView_List) {
      this.DOM.chartAxis_Measure.style("width", this.width_CatChart + 5 + "px");
    }
    if (this.isView_Map && this.mapIsReady) {
      this.leafletAttrMap.invalidateSize();
    }
  }

  // ********************************************************************
  // Text search
  // ********************************************************************

  skipTextSearchClear: boolean = false;

  hasTextSearch(): boolean {
    return this._aggrs.length >= 15;
  }

  initDOM_CatTextSearch() {
    var me = this;
    this.DOM.catTextSearch = this.DOM.summaryControls
      .append("div")
      .attr("class", "textSearchBox catTextSearch hasLabelWidth");

    this.DOM.catTextSearch.append("span").attr("class", "far fa-search");
    this.DOM.catTextSearch
      .append("span")
      .attr("class", "fa fa-times-circle")
      .tooltip(i18n.ClearTextSearch)
      .on("click", () => this.attrib.summaryFilter.clearFilter());
    this.DOM.catTextSearchInput = this.DOM.catTextSearch
      .append("input")
      .attr("class", "textSearchInput")
      .attr("type", "text")
      .attr("placeholder", "...")
      .tooltip(i18n.Search)
      .on("keydown", (event) => event.stopPropagation())
      .on("keypress", (event) => event.stopPropagation())
      .on("keyup", (event) => event.stopPropagation())
      .on("input", function () {
        this.tippy.hide();
        if (this.timer) clearTimeout(this.timer);
        var x = this;
        this.timer = setTimeout(function () {
          me.attrib.unselectAllCategories();
          var query = [];

          // split the query by " character
          var processed = x.value.toLowerCase().split('"');
          processed.forEach((block, i) => {
            if (i % 2 === 0) {
              block.split(/\s+/).forEach((q) => query.push(q));
            } else {
              query.push(block);
            }
          });

          // Remove the empty strings
          query = query.filter((v) => v !== "");

          if (query.length > 0) {
            me.DOM.catTextSearch.classed("showClear", true);
            me._aggrs.forEach((_cat) => {
              var catLabel = _cat.label.toString().toLowerCase();
              var f = query.every((query_str) => {
                if (catLabel.indexOf(query_str) !== -1) {
                  return true;
                }
                return false;
              });
              if (f) {
                _cat.set_OR(me.attrib.summaryFilter.selected_OR);
              } else {
                _cat.set_NONE();
              }
            });

            // All categories are process, and the filtering state is set. Now, process the summary as a whole
            if (me.attrib.summaryFilter.selectedCount_Total() === 0) {
              me.skipTextSearchClear = true;
              me.attrib.summaryFilter.clearFilter();
              me.skipTextSearchClear = false;
            } else {
              me.attrib.summaryFilter.how = "All";
              me.attrib.noValueAggr.filtered = false;
              me.attrib.summaryFilter.setFiltered();
            }
          } else {
            me.attrib.summaryFilter.clearFilter();
          }
        }, 750);
      });
  }

  clearCatTextSearch() {
    if (!this.hasTextSearch()) return;
    if (this.skipTextSearchClear) return;
    if (!this.DOM.catTextSearch) return;
    this.DOM.catTextSearch.classed("showClear", false);
    this.DOM.catTextSearchInput.node().value = "";
  }

  // ********************************************************************
  // Managing in-display / visible categories
  // ********************************************************************

  isCatActive(_cat: Aggregate_Category) {
    if (!_cat.usedAggr) return false;
    if (_cat.isFiltered()) return true;
    if (_cat.recCnt('Active') !== 0) return true;
    if (!this.attrib.isFiltered()) return _cat.recCnt('Active') !== 0;
    if (this.viewType === "map") return _cat.recCnt('Active') !== 0;
    // Hide if multiple options are selected and selection is and
    //        if(this.summaryFilter.selecttype==="SelectAnd") return false;
    // TO-DO: Figuring out non-selected, zero-active-item attribs under "SelectOr" is tricky!
    return true;
  }

  public catCount_InDisplay = 0;
  public catCount_Active: number;
  private firstCatIndexInView = 0;

  areAllCatsInDisplay() {
    return this.catCount_Active === this.catCount_InDisplay;
  }
  updateCats_IsActive() {
    this.catCount_Active = 0;
    this._aggrs.forEach((_cat) => {
      _cat.isActiveBefore = _cat.isActive;
      _cat.isActive = this.isCatActive(_cat);
      if (_cat.isActive) this.catCount_Active++;
    });
    if (this.attrib.catOrder_Fixed) {
      // if fixed, categories do not roll up on each other, the total count is still original count
      this.catCount_Active = this._aggrs.length;
    }
  }
  updateCats_IsVisible() {
    var maxVisibleNumCats = Math.ceil(
      (this.scrollTop_cache + this._height_Categories) / this.heightCat
    );
    this._aggrs.forEach((_cat) => {
      _cat.isVisibleBefore = _cat.isVisible;
      _cat.isVisible =
        this.viewType === "map"
          ? true
          : _cat.isActive &&
            _cat.orderIndex >= this.firstCatIndexInView &&
            _cat.orderIndex < maxVisibleNumCats;
    });
  }

  // ********************************************************************
  // Active / Compare visualizations
  // ********************************************************************

  vizSideBySide() {
    if (this.browser.stackedChart) return false;
    if (this.browser.activeComparisonsCount < 2) return false;
    if (!this.attrib.isComparedAttrib()) return true;
    return this.attrib.isMultiValued && this.splitOnSelfCompare;
  }

  refreshViz_Active() {
    if (!this.isVisible()) return;

    if (this.isView_Dropdown) return;
    if (!this.attrib.chartScale_Measure) return;

    if (this.isView_Map && this.mapIsReady) {
      this.catMap_refreshVis("Active");
      return;
    }

    if (this.isView_List) {
      var baseline = this.measureLineZero;

      this.refreshViz_Cache("Active", null);

      this.DOM.aggrGlyphs.classed(
        "NoActiveRecords",
        (aggr) => aggr.Active.measure === 0
      );

      this.DOM.measure_Active.style(
        "transform",
        (aggr) =>
          `translate(${baseline + aggr.offset("Active")}px, ${
            this.height_bar_topGap
          }px) ` + `scale(${aggr.scale("Active")}, ${this.barHeight_Full})`
      );

      this.refreshMeasureLabelText("Active");
      this.refreshMeasureLabelPos("Active", -1);
    }
  }

  refreshViz_Compare(cT: CompareType, curGroup, totalGroups, prevCts = []) {
    if (!this.isVisible()) return;

    if (this.isView_Dropdown) {
      this.dropdown_refreshCategories(); // might change the assigned colors
      return;
    }

    this.refreshMeasureLabelText(cT);

    if (cT === "Compare_A") {
      this.refreshViz_NoValueAggr();
    }

    if (this.isView_List) {
      var baseline = this.measureLineZero;
      var _translateY = this.height_bar_topGap;
      var barHeight = this.barHeight_Full;

      // adjust position if sidebyside
      if (this.vizSideBySide()) {
        barHeight = barHeight / totalGroups;
        _translateY += barHeight * curGroup;
      }

      this.refreshViz_Cache(cT, prevCts);
      this.refreshMeasureLabelPos(cT, curGroup);

      var onlySelectedNoSplit =
        true &&
        !this.browser.stackedChart &&
        this.attrib.isComparedAttrib() &&
        this.attrib.isMultiValued &&
        !this.splitOnSelfCompare;

      var _do = (scaleX) => {
        this.DOM["measure_" + cT].style(
          "transform",
          (aggr: Aggregate_Category) => {
            if (onlySelectedNoSplit) scaleX = aggr.compared === cT;

            return `translate(${
              baseline + aggr.offset(cT)
            }px, ${_translateY}px) scale(${
              scaleX ? aggr.scale(cT) : 0
            }, ${barHeight})`;
          }
        );
      };

      if (curGroup === totalGroups - 1 && this.browser.addedCompare) {
        _do(false); // sets scaleX to zero, - I believe this was for animation purposes
      }
      _do(true);
    }

    if (this.isView_Map && this.mapIsReady && this.attrib.vizActive(cT)) {
      if (this.attrib.isComparedAttrib() && !this.attrib.isMultiValued) return;
      this.catMap_refreshVis(cT);
    }
  }

  // Overwrites base class
  chartAxis_Measure_TickSkip(): number {
    var width = this.width_CatChart;
    var widthPerTick = 35;

    if (this.attrib.getPeakAggr(d3.max, "Active") > 100000) {
      widthPerTick += 12; // k,m etc
    }

    if (this.browser.percentBreakdown) {
      widthPerTick += 11; // %
    } else if (this.browser.measureFunc.get() !== "Count") {
      var unitName = this.browser.measureSummary.get()?.unitName;
      if (unitName) widthPerTick += 2 + unitName.length * 9;
    }

    return width / widthPerTick;
  }

  // ********************************************************************
  // Set matrix - multi valuied control
  // ********************************************************************

  private show_set_matrix = false;
  public splitOnSelfCompare = true;

  showSetMatrix(v: boolean) {
    if (!this.isView_List && v === true) {
      return;
    }
    this.show_set_matrix = v;
    this.refreshShowSetMatrix();
  }
  hideSetMatrix() {
    this.showSetMatrix(false);
  }

  refreshShowSetMatrix() {
    this.DOM.root?.classed("show_set_matrix", this.show_set_matrix);

    if (this.show_set_matrix) {
      this.attrib.showSetSummary();
    } else if (this.setAttrib) {
      this.attrib.setSortingOption("Active"); // back to dynamic order
      this.updateCatSorting(0); // no delay, animated
    }
  }

  initDOM(beforeDOM): boolean {
    this.attrib.initializeAggregates();
    if (this.attrib.isEmpty()) return false;
    if (this.DOM.inited) return true;

    this.insertRoot(beforeDOM);

    this.DOM.root
      .attr("viewType", this.viewType)
      .classed("hasMultiAnd", this.attrib.summaryFilter.selected_AND.length > 1)
      .classed("isMultiValued", this.attrib.isMultiValued)
      .classed("supportsSetMatrix", this.attrib.supportsSetMatrix)
      .attr("hasMap", this.attrib.catGeo !== null);

    this.DOM.summaryCategorical = this.DOM.wrapper
      .append("div")
      .attr("class", "summaryCategorical");

    if (!this.isView_Dropdown) {
      this.init_DOM_Cat();
    }

    this.setCollapsed(this.collapsed);

    this.DOM.inited = true;
    this.catViewAs(this.viewType);

    this.refreshShowSetMatrix();

    return true;
  }

  // ********************************************************************
  // Main block setup (header / root)
  // ********************************************************************

  insertHeader() {
    super.insertHeader();
    [
      [
        "summaryViewAs setMatrixButton",
        "ViewSetMatrix",
        "far fa-tags",
        () => this.showSetMatrix(!this.show_set_matrix),
      ],
      [
        "summaryViewAs summaryViewAs_list",
        "ViewAsList",
        "far fa-list-ul",
        () => this.catViewAs("list"),
      ],
      [
        "summaryViewAs summaryViewAs_map",
        "ViewAsMap",
        "fal fa-globe",
        () => this.catViewAs("map"),
      ],
    ].forEach((button: any[], i, arr) => {
      this.DOM.summaryIcons
        .append("span")
        .attr("class", button[0])
        .tooltip(i18n[button[1]], { placement: "bottom" })
        .on("click", button[3])
        .append("div")
        .attr("class", button[2]);
    });
  }

  // ********************************************************************
  // Filtering
  // ********************************************************************

  onClearFilter(forceUpdate) {
    this.attrib.noValueAggr.filtered = false;
    this.attrib.unselectAllCategories();
    this.clearCatTextSearch();
    if (forceUpdate !== false && this.isView_Dropdown) {
      this.dropdown_refreshCategories();
    }
    this.DOM.root?.classed("hasMultiAnd", false);
  }

  updateAfterFilter(refreshViz = true): void {
    if (!this.isVisible()) {
      this.attrib.dirtySort = true;
      return;
    }

    if (this.isView_Dropdown) {
      if (!this.attrib.dirtySort) this.updateCatSorting_now();
      this.dropdown_refreshCategories();
      return;
    }

    this.refreshViz_NoValueAggr();
    this.refreshMeasureLabelText("Active");

    if (this.isView_Map) {
      this.attrib.updateChartScale_Measure(true); // skep refresh viz
      this.updateCats_IsActive();
      this.refreshViz_Active(); // maps can only visualize "active" selection.
      return;
    }

    if (this.show_set_matrix) this.attrib.dirtySort = true;

    if (!this.attrib.dirtySort) this.updateCatSorting();

    if (refreshViz) {
      this.attrib.updateChartScale_Measure(true); // skep refresh viz
      this.refreshViz_All();
    }
  }

  refreshLabelWidth() {
    if (!this.isVisible()) return;
    if (!this.DOM.summaryCategorical) return;
    if (!this.isView_List) return;

    this.DOM.chartCatLabelResize.style("left", `${this.width_CatLabel}px`);

    this.DOM.summaryCategorical
      .selectAll(".hasLabelWidth")
      .style("width", `${this.width_CatLabel}px`);

    this.DOM.measureLabelGroup.style(
      "width",
      `${this.width_CatMeasureLabel}px`
    );

    this.DOM.chartAxis_Measure.style(
      "transform",
      `translateX(${this.width_CatText}px)`
    );
  }

  refreshScrollDisplayMore(bottomItem) {
    if (!this.isView_List) {
      return;
    }
    this.DOM.catSortButton.style(
      "display",
      this._aggrs.length === 1 ? "none" : null
    );
    if (this.catCount_Active <= 4) {
      this.DOM.scroll_display_more.style("display", "none");
      return;
    }
    var below = this.catCount_Active - bottomItem;
    var moreTxt = `<span class='rowCount ${below ? " hasMore" : ""}'>${
      this.catCount_Active
    } ${i18n.Rows}</span>`;
    if (below > 0)
      moreTxt += ` <span class='belowCount'>${below} ${i18n.More} <span class='far fa-angle-double-down'></span></span>`;
    this.DOM.scroll_display_more.html(moreTxt);
  }

  // ********************************************************************
  // Mapping
  // ********************************************************************

  private leafletAttrMap: any = null;
  private mapIsReady: any;
  public invertedColorTheme: any;
  private mapColorScale: any;
  private mapBounds_Active: any;
  private geoPath: any;
  private mapConfig: any; // todo

  removeCatGeo() {
    if (this.viewType === "map") {
      this.catViewAs("list");
    }
    this.DOM.root?.attr("hasMap", false);
    this.leafletAttrMap?.remove();
    this.leafletAttrMap = null;
  }

  catMap_projectCategories() {
    if (!this.panel) return;
    // the following is temporary
    var missingRegions = [];
    this.DOM.measure_Active.attr("d", (aggr, i, nodes) => {
      if (!aggr._geo_) {
        missingRegions.push(aggr.label);
        nodes[i].parentNode.style.display = "none";
        return;
      }
      return this.geoPath(aggr._geo_);
    });

    this.DOM.root
      .select(".mapView-UnmatchedData")
      .classed("active", missingRegions.length > 0);

    this.DOM.measureLabel
      .attr("transform", (_cat) => {
        var centroid = this.geoPath.centroid(_cat._geo_);
        return `translate(${centroid[0]},${centroid[1]})`;
      })
      .style("display", (_cat) => {
        var bounds = this.geoPath.bounds(_cat._geo_);
        var width = Math.abs(bounds[0][0] - bounds[1][0]);
        return width < this.width_CatMeasureLabel ? "none" : "block";
      });
  }

  catMap_refreshBounds_Active() {
    this.mapBounds_Active = this.catMap_getBounds(true);
  }

  catMap_zoomToActive(fly = false) {
    if (this.attrib.mapInitView) {
      this.leafletAttrMap.setView(
        L.latLng(this.attrib.mapInitView[0], this.attrib.mapInitView[1]),
        this.attrib.mapInitView[2]
      );
      this.attrib.mapInitView = null;
      return;
    }

    if (fly) {
      this.leafletAttrMap.flyToBounds(
        this.mapBounds_Active,
        this.mapConfig.flyConfig
      );
    } else {
      this.leafletAttrMap.fitBounds(this.mapBounds_Active);
      // there's a bug that makes the map not set the bounds correctly first time
      //window.setTimeout(() => this.leafletAttrMap.fitBounds(this.mapBounds_Active), 100);
    }
  }

  catMap_setMaxBounds() {
    this.leafletAttrMap.setMaxBounds(this.catMap_getBounds());
  }

  catMap_getBounds(onlyActive = false) {
    var bs = [];
    // Insert the bounds for each record path into the bs
    this._aggrs.forEach((_cat) => {
      if (!_cat._geo_) return;
      if (onlyActive && !_cat.isActive) return;
      // get bounding box, cached in _geo_ property
      var b = _cat._geo_._bounds;
      if (b === undefined) {
        b = d3.geoBounds(_cat._geo_);
        if (isNaN(b[0][0])) {
          b = null;
        }
        _cat._geo_._bounds = b;
      }
      if (b === null) return;
      var p1 = L.latLng(b[0][1], b[0][0]);
      var p2 = L.latLng(b[1][1], b[1][0]);
      bs.push(p1);
      bs.push(p2);
    });
    if (bs.length === 0) {
      return this.catMap_getBounds(false); // not only active.
    }
    return Util.addMarginToBounds(new L.latLngBounds(bs));
  }

  catMap_invertColorTheme(v = null) {
    if (v === null) v = !this.invertedColorTheme; // invert
    this.invertedColorTheme = v;
    if (this.mapColorScale) {
      this.mapColorScale.range(this.invertedColorTheme ? [9, 0] : [0, 9]);
      this.catMap_refreshColorScale();
      this.refreshViz_All();
      this.DOM.root
        .select(".editColorTheme.fa-adjust")
        .classed("rotatedY", this.invertedColorTheme);
    }
  }

  catMap_refreshColorScale() {
    if (!this.DOM.mapColorBlocks) return;
    var colorTheme = this.browser.colorTheme.getDiscrete(9);
    if (this.invertedColorTheme) {
      colorTheme = colorTheme.reverse();
    }

    this.DOM.mapColorBlocks
      .style("background-color", (d) => colorTheme[d])
      .style("transform", (d) => {
        var left = (100 * d) / 9;
        var right = (100 * (d + 1)) / 9;
        return (
          "translateX(" +
          left +
          "%) scaleX(" +
          Math.abs(right - left) / 100 +
          ")"
        );
      });
  }

  catMap_prepView() {
    if (this.setAttrib) this.showSetMatrix(false);

    if (this.leafletAttrMap) {
      // The map view was already initialized

      this.leafletAttrMap.invalidateSize();

      this.DOM.aggrGroup = this.DOM.summaryCategorical.select(
        ".catMap_SVG > .aggrGroup"
      );
      this.refreshDOMcats();

      this.mapIsReady = true;

      //  No longer resetting the zoom after switching back to an already existing map.
      //  this.catMap_refreshBounds_Active();
      //  this.catMap_zoomToActive();

      this.catMap_projectCategories();
      this.refreshViz_Active();
      this.refreshViz_All();
      return;
    }

    this.mapConfig = Util.mergeConfig(Base.map, this.attrib.mapConfig || {});

    var me = this;
    this.leafletAttrMap = L.map(
      this.DOM.catMap_Base.node(),
      this.mapConfig.leafConfig
    )
      .addLayer(
        new L.TileLayer(this.mapConfig.tileTemplate, this.mapConfig.tileConfig)
      )
      .on("viewreset", () => this.catMap_projectCategories())
      .on("movestart", function () {
        me.browser.DOM.root.classed("noPointerEvents", true);
        this._zoomInit_ = this.getZoom();
        me.DOM.catMap_SVG.style("opacity", 0.3);
      })
      .on("moveend", function () {
        me.browser.DOM.root.classed("noPointerEvents", false);
        me.DOM.catMap_SVG.style("opacity", null);
        if (this._zoomInit_ !== this.getZoom()) me.catMap_projectCategories();
      });

    this.leafletAttrMap.attributionControl.setPosition("topright");

    this.geoPath = d3.geoPath().projection(
      d3.geoTransform({
        // Use Leaflet latLngToLayerPoint to implement a D3 geometric transformation.
        point: function (x, y) {
          var point = me.leafletAttrMap.latLngToLayerPoint(L.latLng(y, x));
          this.stream.point(point.x, point.y);
        },
      })
    );

    this.DOM.catMap_SVG = d3
      .select(this.leafletAttrMap.getPanes().overlayPane)
      .append("svg")
      .attr("xmlns", "http://www.w3.org/2000/svg")
      .attr("class", "catMap_SVG");

    // The fill pattern definition in SVG, used to denote geo-objects with no data.
    // http://stackoverflow.com/questions/17776641/fill-rect-with-pattern
    this.DOM.catMap_SVG
      .append("defs")
      .append("pattern")
      .attr("id", "diagonalHatch")
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 4)
      .attr("height", 4)
      .append("path")
      .attr("d", "M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2")
      .attr("stroke", "gray")
      .attr("stroke-width", 1);

    // Add custom controls

    var X;
    X = this.DOM.summaryCategorical
      .append("div")
      .attr("class", "visViewControl ViewControlGroup");

    X.append("div")
      .attr("class", "visViewControlButton far fa-plus")
      .tooltip(i18n.ZoomIn)
      .on("click", () => this.leafletAttrMap.zoomIn());
    X.append("div")
      .attr("class", "visViewControlButton far fa-minus")
      .tooltip(i18n.ZoomOut)
      .on("click", () => this.leafletAttrMap.zoomOut());
    X.append("div")
      .attr("class", "visViewControlButton viewFit far fa-expand-arrows-alt")
      .tooltip(i18n.ZoomToFit)
      .on("click", (event) => {
        this.catMap_refreshBounds_Active();
        this.catMap_zoomToActive(true);
        event.preventDefault();
        event.stopPropagation();
      });

    X.append("div")
      .attr(
        "class",
        "visViewControlButton mapView-UnmatchedData fa fa-exclamation"
      )
      .tooltip(i18n.MissingLocations)
      .on("click", () => {
        var missingRegions = [];
        this._aggrs.forEach((_cat) => {
          if (_cat._geo_ === undefined)
            missingRegions.push(
              _cat.label +
                ` <span style='color: gray; font-weight:300; font-size: 0.9em;'>[${_cat.recCnt(
                  "Total"
                )} ${this.browser.recordName}"]</span>`
            );
        });
        Modal.alert(
          "The following regions do not appear on the map.<br><br>" +
            missingRegions.join(", ") +
            "<br><br>" +
            "<span style='font-size: 0.9em; color: gray; font-weight: 300'>" +
            "Please see the list of standard region names " +
            "<a style='color: gray; text-decoration: underline;' href='https://docs.google.com/spreadsheets/d/1DKNXwsJy6_Mdy3ofwbBIZeBGrxSItYOJXNZgLyu0IM4' target='_blank'>here</a>.<br>" +
            "If the place names above are misspelled, please update your data source.<span>"
        ).then(() => {
          this.DOM.root
            .select(".mapView-UnmatchedData")
            .classed("active", false);
        });
      });

    X = this.DOM.summaryCategorical
      .append("div")
      .attr("class", "mapGlyphColorSetting");

    var XX = X.append("div")
      .attr("class", "colorOptions")
      .classed("active", true);

    this.DOM.aggrGroup = this.DOM.catMap_SVG
      .append("g")
      .attr("class", "leaflet-zoom-hide aggrGroup");

    // This will insert map svg component
    this.insertCategoryGlyphs();

    this.DOM.mapColorScaleGroup = XX.append("div").attr(
      "class",
      "mapColorScaleGroup"
    );

    this.DOM.mapColorHighlightedValue = this.DOM.mapColorScaleGroup
      .append("span")
      .attr("class", "mapColorHighlightedValue fa fa-caret-down");

    this.DOM.mapColorBlocks = this.DOM.mapColorScaleGroup
      .append("div")
      .attr("class", "mapColorScaleBins")
      .selectAll(".mapColorThemeBin")
      .data([0, 1, 2, 3, 4, 5, 6, 7, 8])
      .enter()
      .append("div")
      .attr("class", "mapColorThemeBin")
      .tooltip("", { placement: "bottom" })
      .on("mouseenter", (event, d) => {
        var _minValue = Math.round(this.mapColorScale.invert(d));
        var _maxValue = Math.round(this.mapColorScale.invert(d + 1));
        event.currentTarget.tippy.setContent(
          Math.round(_minValue) + " &mdash; " + Math.round(_maxValue)
        );
      });

    this.DOM.mapColorScaleGroup
      .append("div")
      .attr("class", "mapColorScaleLabels")
      .call((mapColorScaleLabels) => {
        mapColorScaleLabels
          .selectAll(".asdsd")
          .data([0, 3, 6, 9])
          .enter()
          .append("div")
          .attr("class", "mapColorScaleLabel")
          .style("left", (i) => (100 * i) / 9 + "%")
          .call((ticks) => {
            ticks.append("div").attr("class", "tickLine");
            ticks.append("div").attr("class", "tickLabel");
          });
      });

    this.DOM.mapColorScaleGroup
      .append("div")
      .attr("class", "measureDescrLabel");
    this.refreshMeasureDescrLabel();

    XX.append("div")
      .attr("class", "colorThemeOptions")
      .append("div")
      .attr("class", "editColorTheme far fa-adjust")
      .tooltip(i18n["InvertColorTheme"])
      .on("click", () => this.catMap_invertColorTheme());

    this.mapIsReady = true;

    this.leafletAttrMap.invalidateSize();

    this.catMap_refreshBounds_Active();
    this.catMap_zoomToActive();
    this.catMap_setMaxBounds();
    this.catMap_projectCategories();
    this.refreshMeasureLabelText("Active");
    this.refreshMapColorScaleBounds();
    this.refreshViz_Active();
    this.catMap_refreshColorScale();
    this.refreshHeight();
  }

  refreshMapColorScaleBounds(_type = "Active") {
    this.mapColorScale = this.attrib.chartScale_Measure
      .copy()
      .range(this.invertedColorTheme ? [9, 0] : [0, 9]);

    this.DOM.mapColorScaleGroup
      .selectAll(".mapColorScaleLabels > .mapColorScaleLabel > .tickLabel")
      .html((d, i) =>
        this.browser.getValueLabel(
          this.mapColorScale.invert((this.invertedColorTheme ? 3 - i : i) * 3)
        )
      );
  }

  catMap_refreshVis(sT) {
    this.DOM.root.select(".editColorTheme").attr("data-color", sT);

    this.refreshMapColorScaleBounds(sT);

    var mapColorQuantize = d3
      .scaleQuantize()
      .domain([0, 9])
      .range(this.browser.colorTheme.getDiscrete(9));

    this.DOM.measure_Active.each((aggr, i, nodes) => {
      var _visV = this.browser.getChartValue(aggr, sT);
      if (aggr[sT].recCnt === 0) _visV = null;
      var DOM = nodes[i];
      var _fill = "url(#diagonalHatch)";
      var _stroke = "#111111";
      if (_visV != null) {
        _fill = mapColorQuantize(this.mapColorScale(_visV));
        _stroke = d3.hsl(_fill).l > 0.5 ? "#111111" : "#EEEEEE";
      }
      DOM.style.fill = _fill;
      DOM.style.stroke = _stroke;
      DOM.classList[_visV == null ? "add" : "remove"]("noData");
    });
  }

  // ********************************************************************
  // List
  // ********************************************************************

  list_prepView() {
    this.DOM.aggrGroup = this.DOM.aggrGroup_list;
    this.insertCategoryGlyphs();
    if (this.heightRow_category_dirty) this.refreshHeight_Category();
    this.updateCats_IsActive();
    this.updateCatSorting_now();
    this.refreshLabelWidth();
    this.refreshViz_All();
    this.refreshHeight();
    this.refreshLabelWidth();
    this.DOM.measureLabel.style("display", null); // default is visible
  }

  init_DOM_Cat() {
    this.DOM.summaryControls = this.DOM.summaryCategorical
      .append("div")
      .attr("class", "summaryControls");
    this.initDOM_CatTextSearch();

    this.refreshConfigRowCount();

    this.DOM.catChart = this.DOM.summaryCategorical
      .append("div")
      .attr("class", "catChart");

    this.DOM.aggrGroup = this.DOM.catChart
      .append("div")
      .attr("class", "aggrGroup")
      .on("mousedown", (event) => {
        event.stopPropagation();
        event.preventDefault();
      })
      .on("scroll", () => {
        if (Util.ignoreScrollEvents === true) return;
        this.scrollTop_cache = this.DOM.aggrGroup.node().scrollTop;

        this.DOM.chartCatLabelResize.style("top", "0px");
        this.firstCatIndexInView = Math.floor(
          this.scrollTop_cache / this.heightCat
        );
        this.refreshScrollDisplayMore(
          this.firstCatIndexInView + this.catCount_InDisplay
        );
        this.updateCats_IsVisible();
        this.catList_cullCategories();
        this.refreshMeasureLabelText("Active");
      });
    this.DOM.aggrGroup_list = this.DOM.aggrGroup;

    this.DOM.catMap_Base = this.DOM.catChart
      .append("div")
      .attr("class", "catMap_Base");

    // This makes sure that the (scrollable) div height is correctly set to visible number of categories
    this.DOM.chartBackground = this.DOM.aggrGroup
      .append("span")
      .attr("class", "chartBackground");

    this.DOM.chartCatLabelResize = this.DOM.catChart
      .append("span")
      .attr("class", "chartCatLabelResize dragWidthHandle")
      .tooltip(i18n["Adjust Label Width"])
      .on("mousedown", (event) => {
        var initWidth =
          this.width_CatLabel - d3.pointer(event, d3.select("body").node())[0];

        this.browser.activateWidthDrag(
          this.panel.DOM.root.node(),
          event,
          (event2) => {
            this.panel.width_CatText =
              initWidth +
              d3.pointer(event2, d3.select("body").node())[0] +
              this.width_CatMeasureLabel;
          }
        );
      });

    this.insertChartAxis_Measure(this.DOM.catChart);

    this.DOM.belowCatChart = this.DOM.summaryCategorical
      .append("div")
      .attr("class", "belowCatChart catSummary_ListOnly hasLabelWidth")
      .style("height", Base.height_CatBottom - 1 + "px"); // for some reason, chrome needs 1 more pixel for categories

    this.initDOM_CatSortButton();

    this.DOM.scroll_display_more = this.DOM.belowCatChart
      .append("div")
      .attr("class", "scroll_display_more")
      .on("click", () =>
        Util.scrollToPos_do(
          this.DOM.aggrGroup,
          this.DOM.aggrGroup.node().scrollTop + this.heightCat
        )
      );

    this.DOM.belowCatChart.append("div").attr("class", "gap");

    // move noValueAggr under belowChart
    // TODO: Fix. If it's map view or dropdown view, it shouldn't be moved under this dom element
    this.DOM.belowCatChart.node().appendChild(this.DOM.noValueAggr.node());
  }

  initDOM_CatSortButton() {
    this.DOM.catSortButton = this.DOM.belowCatChart
      .append("span")
      .attr("class", "catSortButton fa fa-sort catSummary_ListOnly") // alt icon: fa-bars
      .tooltip(i18n["Sorting"])
      .on("click", (event) =>
        Modal.popupMenu(event, this.attrib.getSortMenuOpts(), this, {
          placement: "top-start",
        })
      );
  }

  insertCategoryGlyphs() {
    var me = this;
    if (this.isView_Dropdown) {
      this.dropdown_refreshCategories();
      return;
    }

    if (!this.DOM.aggrGroup) return;

    var aggrGlyphSelection = this.DOM.aggrGroup
      .selectAll(".aggrGlyph")
      .data(this._aggrs, (aggr) => aggr.id);

    var DOM_cats_new = aggrGlyphSelection
      .enter()
      .append(this.viewType == "list" ? "span" : "g")
      .attr(
        "class",
        "aggrGlyph " + (this.viewType == "list" ? "cat" : "map") + "Glyph"
      ) // mapGlyph, catGlyph
      .tooltip((aggr: Aggregate_Category) => aggr.getTooltipHTML(), {
        theme: "dark kshf-tooltip kshf-record",
        placement: "right",
        animation: "fade",
        followCursor: this.isView_Map,
        offset: [0, this.isView_Map ? 15 : 0],
        trigger: "manual",
        // don't show the tooltip if the categorical chart is made up of unique categories.
        onShow: () => !this.attrib.uniqueCategories(),
      })
      .on("mouseenter", function (_event, aggr) {
        if (me.browser.adjustMode) return;
        this.highlightTimeout = window.setTimeout(() => {
          this.highlightTimeout = null;
          this.classList.add("catMouseOver");
          me.attrib.onAggrHighlight(aggr);
          // Do not change.
          // If trigger is automated (not manual), mouse-over automatically shows the tooltip
          //  but, the highliht/compare setting may be old (invalid) because of the delay to apply it.
          // So, we need to keep this manual
          this.tippy.show();
        }, me.browser.movingMouseDelay);
      })
      .on("mouseleave", function (_event, aggr) {
        if (this.tippy) {
          this.tippy.hide();
        }
        if (me.browser.adjustMode) return;
        this.classList.remove("catMouseOver");
        if (this.highlightTimeout) window.clearTimeout(this.highlightTimeout);
        me.attrib.onAggrLeave(aggr);
      })
      .on("click", (event, aggr) => {
        if (this.browser.adjustMode) return;
        this.attrib.onAggrClick(event, aggr);
      });

    this.updateCats_IsVisible();

    if (this.isView_List) {
      DOM_cats_new.style("height", this.heightCat + "px").style(
        "transform",
        "translateY(0px)"
      );

      DOM_cats_new.append("span").attr(
        "class",
        "catLabelGroup_BG hasLabelWidth"
      );

      var domAttrLabel = DOM_cats_new.append("span").attr(
        "class",
        "catLabelGroup hasLabelWidth"
      );

      domAttrLabel
        .append("span")
        .attr("class", "filterButton far fa-filter")
        .tooltip(i18n.Filter)
        .on("click", (event, _cat: Aggregate_Category) => {
          var menuConfig = { name: "Filter", items: [] };
          var _only = true,
            _and = !_cat.filtered_AND(),
            _or = !_cat.filtered_OR(),
            _not = !_cat.filtered_NOT(),
            _remove = _cat.isFiltered();
          var _Or_And =
            this.attrib.summaryFilter.selected_OR.length > 0 ||
            this.attrib.summaryFilter.selected_AND.length > 0;

          if (!this.attrib.isMultiValued) {
            _only = !_cat.filtered_AND();
            _and = false;
            _or = _or && _Or_And && !_cat.filtered_AND();
            _not = _not && (!_Or_And || _cat.filtered_AND());
          } else {
            _only = true;
            _and = _and && _Or_And;
            _or = _or && _Or_And;
          }

          var _label = `<span class='filterContextLabel'>${_cat.label}</span>`;

          if (_remove) {
            menuConfig.items.push({
              id: "filterOption_Remove",
              name: "<span class='filterContextOpt'>" + i18n.Clear + "</span>",
              helparticle: "5e88e80a2c7d3a7e9aea63ed",
              do: (_cat: Aggregate_Category) => this.attrib.filterCategory(_cat, "NONE"),
            });
          }

          if (_only) {
            menuConfig.items.push({
              id: "filterOption_Only",
              name: `<span class='filterContextOpt'>${i18n.Only}</span> ${_label}`,
              helparticle: "5e88e7bc2c7d3a7e9aea63e9",
              do: (_cat: Aggregate_Category) => {
                this.attrib.noValueAggr.filtered = null;
                this.attrib.summaryFilter
                  .selected_AndOrNot()
                  .forEach((_) => _.set_NONE());
                this.attrib.filterCategory(_cat, "AND", "All");
              },
            });
          }
          if (_and) {
            menuConfig.items.push({
              id: "filterOption_And",
              name:
                `<span class='filterContextOpt'>${i18n.And}</span> ${_label}`+
                ` <span class='filterContextMultiple'>[${i18n.Multiple}]</span>`,
              helparticle: "5e88e81a2c7d3a7e9aea63ee",
              do: (_cat: Aggregate_Category) => this.attrib.filterCategory(_cat, "AND"),
            });
          }
          if (_or) {
            menuConfig.items.push({
              id: "filterOption_Or",
              name:
              `<span class='filterContextOpt'>${i18n.Or}</span> ${_label}`+
              ` <span class='filterContextMultiple'>[${i18n.Multiple}]</span>`,
              helparticle: "5e88e7e22c7d3a7e9aea63ec",
              do: (_cat: Aggregate_Category) => this.attrib.filterCategory(_cat, "OR"),
            });
          }
          if (_not) {
            menuConfig.items.push({
              id: "filterOption_Not",
              name:
                "<span class='filterContextOpt'>" +
                i18n.Not +
                "</span> " +
                _label,
              helparticle: "5e88e7cf2c7d3a7e9aea63ea",
              do: (_cat: Aggregate_Category) => this.attrib.filterCategory(_cat, "NOT"),
            });
          }
          Modal.popupMenu(event, menuConfig, _cat, {
            placement: "bottom-start",
          });
          event.stopPropagation();
          event.preventDefault();
        });

      this.insertAggrLockButton(domAttrLabel, "bottom");

      domAttrLabel.append("span").attr("class", "catLabelGap");

      domAttrLabel
        .append("span")
        .attr("class", "AndOrNot AndOrNot_And")
        .text(i18n.And);
      domAttrLabel
        .append("span")
        .attr("class", "AndOrNot AndOrNot_Or")
        .text(i18n.Or);
      domAttrLabel
        .append("span")
        .attr("class", "AndOrNot AndOrNot_Not")
        .text(i18n.Not);

      domAttrLabel
        .append("span")
        .attr("class", "catLabelOrder fa fa-bars")
        .tooltip(i18n["Reorder"])
        .on("mousedown", (event, aggr: Aggregate_Category) => {
          var catNode = event.currentTarget.parentNode.parentNode;
          var catGroupNode =
            event.currentTarget.parentNode.parentNode.parentNode;
          me.browser.DOM.root.classed("noPointerEvents", true);
          var srcIndex = aggr.orderIndex;

          d3.select("body")
            .on("mousemove.reordercat", function (event2) {
              catNode.classList.add("draggedCategory");

              var targetPos = Math.min(
                Math.max(d3.pointer(event2, catGroupNode)[1], 0),
                me.heightCat * (me.catCount_Active - 1)
              );
              var targetIndex = Math.min(
                Math.max(Math.round(targetPos / me.heightCat), 0),
                me.catCount_Active - 1
              );
              var skip = { from: srcIndex, to: targetIndex };

              me.updateCatSorting(0, true, skip); // zero-delay, animated

              catNode.style.transform = `translate(0px, ${targetPos}px)`; // transition the moved cat directly
            })
            .on("mouseup.reordercat", function (event3) {
              catNode.classList.remove("draggedCategory");

              var targetPos = Math.min(
                Math.max(d3.pointer(event3, catGroupNode)[1], 0),
                me.heightCat * (me.catCount_Active - 1)
              );
              var targetIndex = Math.min(
                Math.max(Math.round(targetPos / me.heightCat), 0),
                me.catCount_Active - 1
              );
              var skip = { from: srcIndex, to: targetIndex, mult: undefined };

              if (skip.from > skip.to) {
                var _ = skip.to;
                skip.to = skip.from;
                skip.from = _;
                skip.mult = 1;
              } else {
                // from smaller than to
                skip.mult = -1;
              }

              // update orderIndex!
              aggr.orderIndex = targetIndex;
              me.DOM.aggrGlyphs
                .filter((_cat: Aggregate_Category) => _cat.label !== aggr.label) // all but the moved one
                .each((_cat: Aggregate_Category) => {
                  if (
                    _cat.orderIndex >= skip.from &&
                    _cat.orderIndex <= skip.to
                  )
                    _cat.orderIndex += skip.mult;
                });

              me.attrib.pleaseSort = true;
              // Save the ordering
              me.attrib.setFixedCatOrder();

              me.browser.DOM.root.classed("noPointerEvents", false);
              d3.select("body")
                .on("mousemove.reordercat", null)
                .on("mouseup.reordercat", null);
            });
        });

      domAttrLabel
        .append("span")
        .attr("class", "catLabelEdit fa fa-pencil")
        .tooltip("")
        .on("mouseenter", (event, d: Aggregate_Category) => {
          var info = "";
          if (me.attrib.catLabel_attr[d.id]) {
            // Show original value
            info = ` <span>(${d.id})</span>`;
            if (event.shiftKey) {
              event.currentTarget.tippy.setContent(
                "+Shift : " + i18n.Reset + info
              );
              return;
            }
          }
          event.currentTarget.tippy.setContent(i18n.EditTitle + info);
        })
        .on("click", function (event, d: Aggregate_Category) {
          this.tippy.hide();
          if (event.shiftKey) {
            delete me.attrib.catLabel_attr[d.id];
            this.nextSibling.innerHTML = DOMPurify.sanitize(d.id);
            return;
          }
          this.style.display = "none";
          this.previousSibling.style.display = "none";
          this.nextSibling.setAttribute("contenteditable", true);
          this.nextSibling.focus();
        });

      domAttrLabel
        .append("span")
        .attr("class", "catLabel")
        .html((aggr: Aggregate_Category) => aggr.label)
        .on("focus", function () {
          this._initValue = DOMPurify.sanitize(this.innerHTML);
          document.execCommand("selectAll", false, null);
        })
        .on("blur", function () {
          this.removeAttribute("contenteditable");
          this.blur();
          this.previousSibling.style.display = "";
          this.previousSibling.previousSibling.style.display = "";
        })
        .on("keydown", function (event, d: Aggregate_Category) {
          if (event.keyCode === 27) {
            // Escape key
            // Do not apply the new label
            this.blur();
            this.innerHTML = DOMPurify.sanitize(this._initValue);
            return;
          }
          if (event.key === "Enter") {
            event.stopPropagation();
            event.preventDefault();
            var newLabel = DOMPurify.sanitize(this.innerHTML);
            if (newLabel === "") {
              this.innerHTML = DOMPurify.sanitize(this._initValue);
              this.blur();
              return;
            }
            d.label = newLabel;
            me.attrib.catLabel_attr[d.id] = newLabel;
            this.blur();
          }
        });

      var labelGroup = DOM_cats_new.append("div").attr(
        "class",
        "measureLabelGroup"
      );
      Base.Active_Compare_List.forEach((m) => {
        labelGroup
          .append("span")
          .attr("class", "measureLabel measureLabel_" + m);
      });

      var measureGroup = DOM_cats_new.append("div").attr(
        "class",
        "measureGroup"
      );

      Base.Total_Active_Compare_List.forEach((t) => {
        measureGroup
          .append("span")
          .attr("class", `measure_${t} bg_${t}`)
          .on("mouseenter", (event, aggr: Aggregate_Category) => {
            aggr.DOM.aggrGlyph
              .querySelector(".measureLabel_" + t)
              .classList.add("forceShow");

            if (Base.Compare_List.find((_) => _ === t)) {
              this.browser.refreshAllMeasureLabels(t);
            }
            event.preventDefault();
            event.stopPropagation();
          })
          .on("mouseleave", (_event, aggr: Aggregate_Category) => {
            var labelDOM = aggr.DOM.aggrGlyph.querySelector(
              ".measureLabel_" + t
            );
            if (labelDOM) labelDOM.classList.remove("forceShow");
            if (Base.Compare_List.find((_) => _ === t)) {
              this.browser.refreshAllMeasureLabels("Active");
            }
          });
      });
      measureGroup.append("div").attr("class", "setMatrixLine");
    } else if (this.isView_Map) {
      DOM_cats_new.append("g")
        .attr("class", "measureGroup")
        .append("path")
        .attr("class", "measure_Active");
      // only "active" measure group right now

      // label on top of (after) all the rest (removed for now)
    }
    this.refreshDOMcats();
  }

  refreshMeasureLabelPos(sT: MeasureType = "Active", curGroup = 0) {
    if (!this.isVisible()) return;
    if (!this.isView_List) return;
    if (sT === "Other") return;

    var _top = this.height_bar_topGap;
    var barHeight = this.barHeight_Full;

    if (this.browser.stackedCompare.get() && !this.panel.hiddenCatBars()) {
      var baseline = this.measureLineZero;
      var maxWidth = this.width_CatChart;

      var endOfBar = !this.browser.isCompared();

      this.DOM["measureLabel_" + sT].each(
        (aggr: Aggregate_Category, i, nodes) => {
          var _width = aggr.scale(sT);
          var _left = baseline + aggr.offset(sT);
          var _right = _left + _width;

          var _hidden = this.browser.getMeasureValue(aggr, sT) == 0;

          if (!_hidden && this.browser.isCompared()) {
            _hidden = aggr.scale(sT) < this.width_CatMeasureLabel - 4;
          }

          // label alignment
          var _labelAlign =
            Math.abs(_left - baseline) < 2
              ? "left"
              : Math.abs(_right - maxWidth) < 2 &&
                this.browser.relativeBreakdown
              ? "right"
              : "middle";

          if (endOfBar) {
            _width = this.width_CatMeasureLabel;
            _left = Math.min(
              baseline + aggr.sumOffsetScale(sT),
              maxWidth - _width
            );
            _right = _left + _width;
            _labelAlign = _right + 10 < maxWidth ? "left" : "right";
            _hidden = aggr.recCnt(sT) === 0;
          }

          nodes[i].classList[_hidden ? "add" : "remove"]("hidden");

          nodes[i].setAttribute("labelAlign", _labelAlign);

          nodes[i].style.width = _width + "px";
          nodes[i].style.transform = `translate(${_left}px, ${_top}px)`;
        }
      );
    } else {
      if (this.vizSideBySide()) {
        barHeight = barHeight / this.browser.activeComparisonsCount;
        _top += barHeight * curGroup;
      }

      var onlySelectedNoSplit =
        true &&
        !this.browser.stackedChart &&
        this.attrib.isComparedAttrib() &&
        this.attrib.isMultiValued &&
        !this.splitOnSelfCompare;

      this.DOM["measureLabel_" + sT]
        .attr("labelAlign", null)
        .classed("hidden", (aggr) => {
          if (onlySelectedNoSplit) return aggr.compared !== sT;
          return (
            barHeight < 12 ||
            (this.attrib.isComparedAttrib() &&
              !this.attrib.isMultiValued &&
              (sT !== aggr.compared || this.browser.relativeBreakdown))
          );
        })
        .style("transform", `translateY(${_top}px)`)
        .style("width", null);
    }

    this.DOM["measureLabel_" + sT].style("line-height", barHeight + "px");
  }

  refreshDOMcats() {
    this.DOM.aggrGlyphs = this.DOM.aggrGroup
      .selectAll(".aggrGlyph")
      .each((aggr: Aggregate_Category, i, nodes) => {
        aggr.setAggrGlyph(nodes[i]);
      });

    this.DOM.measureLabelGroup =
      this.DOM.aggrGlyphs.selectAll(".measureLabelGroup");
    this.DOM.measureLabel = this.DOM.aggrGlyphs.selectAll(".measureLabel");

    Base.Active_Compare_List.forEach((t) => {
      this.DOM["measureLabel_" + t] = this.DOM.aggrGlyphs.selectAll(
        ".measureLabel_" + t
      );
    });

    Base.Total_Active_Compare_List.forEach((t) => {
      this.DOM["measure_" + t] = this.DOM.aggrGlyphs.selectAll(".measure_" + t);
    });

    if (this.isView_List) {
      this.DOM.catLabel = this.DOM.aggrGlyphs.selectAll(".catLabel");
      this.DOM.lockButton = this.DOM.aggrGlyphs.selectAll(".lockButton");
      this.refreshHeight_Category_do();
    }
  }

  // ********************************************************************
  // List - Sorting
  // ********************************************************************

  public scrollTop_cache = 0;

  updateCatSorting_now() {
    this.updateCatSorting(0, false); // no delay, not animated
  }

  updateCatSorting(sortDelay = 1000, animate = true, skip: any = false) {
    if (this._aggrs.length === 0) return; // no aggregates to sort
    if (this.attrib.uniqueCategories() && !this.panel) return; // Nothing to sort...

    if (!this.browser.finalized) animate = false;

    this.updateCats_IsActive();

    if (
      !skip &&
      (sortDelay === 0 || !this.attrib.catOrder_Fixed || this.attrib.pleaseSort)
    ) {
      this.attrib._sortCategories();
      // ************************************************
      // update orderIndex
      var lastRank = 0;
      this._aggrs.forEach((_cat) => {
        _cat.orderIndex = _cat.isActive ? lastRank++ : -lastRank - 1;
      });
    }

    this.updateCats_IsVisible();

    // No need to update UI if checks below fail
    if (!this.panel) return;
    if (!this.DOM.aggrGlyphs) return;
    if (!this.isView_List) return;

    // The rest deals with updating UI

    this.DOM.catChart.classed("catOrder_Fixed", this.attrib.catOrder_Fixed);

    if (!skip && this.setAttrib) {
      // need to handle some setAttrib updates when the categories are re-ordered
      var setAttrib = this.setAttrib;
      setAttrib.block.refreshRow();
      setAttrib.block.DOM.setPairGroup.attr("animate_position", false);
      setAttrib.block.refreshSetPair_Position();
      setTimeout(
        () => setAttrib.block.DOM.setPairGroup.attr("animate_position", true),
        1000
      );
    }

    // Categories outside the view are set "invisible"
    // Her, we expand the background box. This makes the scroll bar visible.
    this.DOM.chartBackground.style("height", this.height_VisibleAttrib + "px");

    // scroll to top when re-sorted
    if (this.scrollTop_cache !== 0) Util.scrollToPos_do(this.DOM.aggrGroup, 0);

    this.refreshScrollDisplayMore(
      this.firstCatIndexInView + this.catCount_InDisplay
    );

    if (!animate) {
      this.DOM.aggrGlyphs
        .each((_cat) => {
          _cat.posX = 0;
        })
        .style("opacity", 1)
        .style("transform", (_cat) => _cat.transformPos);
      this.catList_cullCategories();
      return;
    }

    // Exectued only when categories are reordered through GUI
    if (skip) {
      var selfOrder = skip.from;
      // from is less than to (like, from 2 to 5 ): make 2,3,4 skip
      if (skip.from > skip.to) {
        var _ = skip.to;
        skip.to = skip.from;
        skip.from = _;
        skip.mult = 1;
      } else {
        skip.mult = -1;
      }
      this.DOM.aggrGlyphs
        .filter((_cat) => _cat.orderIndex !== selfOrder)
        .transition()
        .duration(sortDelay)
        .style("transform", (_cat) => {
          var offset =
            _cat.orderIndex >= skip.from && _cat.orderIndex <= skip.to
              ? this.heightCat * skip.mult
              : 0;
          return `translate(${_cat.posX}px, ${_cat.posY + offset}px)`;
        });

      return;
    }

    var cats_NotActiveBeforeAndNow = this.DOM.aggrGlyphs.filter(
      (_cat) => !_cat.isActiveBefore && !_cat.isActive
    );
    var cats_Disappearing = this.DOM.aggrGlyphs.filter(
      (_cat) => _cat.isActiveBefore && !_cat.isActive
    );
    var cats_Appearing = this.DOM.aggrGlyphs.filter(
      (_cat) => !_cat.isActiveBefore && _cat.isActive
    );
    var cats_Active = this.DOM.aggrGlyphs.filter((_cat) => _cat.isActive);

    cats_NotActiveBeforeAndNow.style("display", "none");

    var xRemoveOffset = -100;

    // Disappear animation
    cats_Disappearing
      .transition()
      .duration(sortDelay)
      .on("end", function (aggr) {
        this.style.opacity = 0;
        aggr.posX = xRemoveOffset;
        this.style.transform = aggr.transformPos;
      })
      .transition()
      .duration(1000)
      .on("end", function () {
        this.style.display = "none";
      });

    // Appear animation (initial position)
    cats_Appearing
      .transition()
      .duration(sortDelay)
      .on("end", (aggr, i, nodes) => {
        var node = nodes[i];
        node.style.opacity = 0;
        node.style.display = null;
        aggr.posX = xRemoveOffset;
        node.style.transform = aggr.transformPos;
      });

    // Sort animation
    var perCatDelay = 30;
    cats_Active
      .style("display", null)
      .transition()
      .duration((_cat) => {
        if (_cat.isVisibleBefore && !_cat.isVisible) return sortDelay;
        var x = _cat.isActiveBefore
          ? 0
          : (this.catCount_InDisplay - 5) * perCatDelay; // appear animation is further delayed
        return (
          100 +
          sortDelay +
          x +
          Math.min(_cat.orderIndex, this.catCount_InDisplay + 2) * perCatDelay
        );
      })
      .on("end", (aggr, i, nodes) => {
        aggr.posX = 0;
        nodes[i].style.opacity = 1;
        nodes[i].style.transform = aggr.transformPos;
      })
      .transition()
      .duration(250)
      .on("end", (aggr, i, nodes) => {
        if (!(aggr.isVisible || aggr.isVisibleBefore)) {
          nodes[i].style.display = "none";
        }
      });
  }

  // ********************************************************************
  // Dropdown
  // ********************************************************************

  public dropdown_type: DropdownType = "SingleSelect";

  private choicesUI: any;

  dropdown_prepView() {
    this.insertCategoryGlyphs();
  }

  dropdown_refreshCategories() {
    if (!this.DOM) return;
    if (!this.DOM.summaryCategorical) return;
    if (!this.inDashboard) return;
    if (!this.isVisible()) return;

    import("choices.js").then((Choices) => {
      var me = this; // callbacks set their own this context for choices library

      var cfg = {
        searchEnabled: this._aggrs.length > 15,
        searchResultLimit: 20,
        searchPlaceholderValue: i18n.Search,
        shouldSort: false,
        shouldSortItems: false,
        duplicateItemsAllowed: false,
        paste: false,

        removeItemButton: this.dropdown_type === "MultiSelect" ? true : false,
        placeholder: this.dropdown_type === "MultiSelect" ? true : "",
        placeholderValue: i18n.All,

        callbackOnCreateTemplates: () => ({
          choice(classes, obj) {
            const el = Choices.defaults.templates.choice.call(
              this,
              classes,
              obj
            );
            var aggr = me.attrib.catTable_id[obj.label];
            if (aggr && aggr.compared) {
              el.classList.add(aggr.compared);
            }
            return el;
          },
          item(classes, obj) {
            const el = Choices.defaults.templates.item.call(
              this,
              classes,
              obj,
              me.dropdown_type === "MultiSelect"
            );
            var aggr = me.attrib.catTable_id[obj.label];
            if (aggr && aggr.compared) {
              el.classList.add("bg_" + aggr.compared);
            }
            return el;
          },
        }),
      };

      if (this.choicesUI) {
        this.choicesUI.destroy();
        this.DOM.ChoicesSelectDOM.remove();
      }

      this.DOM.ChoicesSelectDOM = this.DOM.summaryCategorical
        .append("select")
        .attr("multiple", this.dropdown_type === "MultiSelect" ? true : null);

      this.DOM.ChoicesSelectDOM.node().addEventListener(
        "removeItem",
        (event) => {
          if (this.dropdown_type !== "MultiSelect") return;
          var _cat = event.detail.customProperties;
          if (!_cat) {
            // choices js: Update/remove after version update of library, feature just added.
            _cat = this.attrib.catTable_id[event.detail.label];
          }
          if (_cat) this.attrib.onAggrClick(event, _cat);
        }
      );

      this.DOM.ChoicesSelectDOM.node().addEventListener("choice", (_event) => {
        var selectedCat = this.attrib.summaryFilter.selected_AND[0];
        var _cat = _event.detail.choice.customProperties as Aggregate_Category;
        // selecting filtered category again
        if (_cat && selectedCat && selectedCat.label === _cat.label) return;
        if (_cat && _cat.recCnt("Active") === 0 && !this.attrib.isFiltered()) {
          Modal.alert(
            i18n[
              "Cannot select an option with no data in current filtered dashboard."
            ]
          );
          return;
        }
        window.setTimeout(() => {
          if (this.dropdown_type === "MultiSelect") {
            if (_cat) {
              if (this.attrib.isFiltered()) {
                this.attrib.filterCategory(
                  _cat,
                  this.attrib.isMultiValued ? "AND" : "OR",
                  "All"
                );
              } else {
                this.attrib.filterCategory(_cat, "AND", "All");
              }
            } else {
              this.attrib.summaryFilter.clearFilter(_cat ? false : true);
            }
            return;
          }
          this.attrib.summaryFilter.clearFilter(_cat ? false : true);
          if (_cat) {
            this.attrib.filterCategory(_cat, "AND", "All");
          }
        }, 10);
      });

      this.choicesUI = new Choices(this.DOM.ChoicesSelectDOM.node(), cfg);
      this.choicesUI.setChoices(
        [
          // "All" option
          {
            value: "-",
            label: i18n.All,
            selected: this.attrib.isFiltered() ? null : true,
          },
        ].concat(
          this._aggrs.map((aggr) => ({
            value: aggr.label,
            label: aggr.label,
            selected: !aggr.isFiltered() ? null : true,
            disabled:
              aggr.recCnt("Active") === 0 && !this.attrib.isFiltered()
                ? true
                : null,
            customProperties: aggr,
          }))
        ),
        "value",
        "label",
        true
      );
    });
  }
}
