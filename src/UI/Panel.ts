import { select, pointer } from "../d3_select";
import { min, max } from "d3-array";

import { Browser } from "../Browser";
import { Base } from "../Base";
import { PanelName, PanelSpec } from "../Types";
import { Block } from "../Block";
import { Attrib } from "../Attrib";
import { Attrib_Categorical } from "../Attrib_Categorical";
import { Block_Categorical } from "../Block_Categorical";
import { i18n } from "../i18n";
import { Attrib_Interval } from "../Attrib_Interval";

const d3 = {
  select,
  pointer,
  min,
  max,
};

export class Panel {
  private readonly browser: Browser;
  private readonly _name: PanelName;

  // ********************************************************************
  // Attributes (/ blocks) in the panel
  // ********************************************************************

  public attribs: Attrib[] = [];

  hasBlocks() {
    return this.attribs.length > 0;
  }
  isEmpty() {
    return this.attribs.length === 0;
  }
  get blocks(): Block[] {
    return this.attribs.map((attrib) => attrib.block);
  }

  private get attribs_Categorical(): Attrib_Categorical[] {
    return this.attribs.filter(
      (_): _ is Attrib_Categorical => _ instanceof Attrib_Categorical
    );
  }

  // ********************************************************************
  // Constructor
  // ********************************************************************

  public DOM: { root: any };

  /** -- */
  constructor(browser: Browser, name: PanelName, parentDOM) {
    this.browser = browser;
    this._name = name;

    this.DOM = {
      root: parentDOM
        .append("div")
        .attr("class", "panel panel_" + this.name)
        .classed("panel_side", this.name === "left" || this.name === "right")
        .classed("hasBlocks", false),
    };
    this.initDOM_AdjustWidth();
    this.addDOM_DropZone();
    this.refreshBlocksDropZonesOrder();

    this.setWidth(this.browser.width_Canvas / 3);
  }

  public get name(): PanelName {
    return this._name;
  }

  /** -- If there's enough space, the panel welcomes new blocks */
  welcomesNewBlock() {
    if (this.isEmpty()) return true;
    if (this.blocks.length < Math.floor(this.height / 150)) return true;
    return this.heightRemaining >= 0;
  }

  // ********************************************************************
  // Height, width...
  // ********************************************************************

  public height: number; // height of panel in pixels

  private _width_CatBars: number = 0; // placeholder value
  private _width_CatMeasureLabel: number = 10; // placeholder values
  private _width_CatText: number = 175; // placeholder value

  /** -- */
  get width_CatText() {
    return this._width_CatText;
  }
  /** -- */
  get width_CatLabel() {
    return (
      this.width_CatText -
      (this.browser.stackedCompare.val && !this.hiddenCatBars()
        ? 0
        : this.width_CatMeasureLabel)
    );
  }
  /** -- */
  get width_CatMeasureLabel() {
    return this._width_CatMeasureLabel;
  }
  get width_Real_withGap() {
    if (this.width_Real === 0) return 0;
    if (this.name === "left" || this.name === "right") {
      return this.hasBlocks() ? this.width_Real + Base.width_PanelGap : 0;
    }
    return this.width_Real;
  }
  /** -- */
  get width_Real() {
    if (this.name === "middle") {
      return (
        this.browser.width_Canvas -
        this.browser.panels.left.width_Real_withGap -
        this.browser.panels.right.width_Real_withGap
      );
    }
    if (this.name === "bottom") {
      return this.browser.width_Canvas;
    }
    if (this.isEmpty()) return 0;
    if (this.isCollapsed()) {
      return this.DOM.root.node().offsetWidth;
    }
    return this.width_CatText + this.width_CatBars + Base.width_ScrollBar; // 8 pixels of gap
  }

  /** Adjusts width_CatBar based on previous size as well */
  set width_CatText(_w_) {
    _w_ = Math.max(Base.width_CatLabelMin, _w_); // use at least 110 pixels for the category label.
    if (_w_ === this.width_CatText) return;
    var widthDif = this.width_CatText - _w_;
    this._width_CatText = _w_;
    this.attribs_Categorical.forEach((attrib) =>
      attrib.block.refreshLabelWidth()
    );
    // updates category bar widths
    this.width_CatBars = this.width_CatBars + widthDif;
  }
  /** -- */
  get width_CatBars() {
    return this._width_CatBars;
  }
  /** -- */
  set width_CatBars(_w_) {
    _w_ = Math.max(_w_, 0); // cannot be negative
    this._width_CatBars = _w_;
    this.DOM.root.classed("hideCatBars", this.hiddenCatBars() ? true : false);
    this.refreshWidth();
  }

  /** -- */
  setWidth(_w_) {
    this.width_CatBars = _w_ - this.width_CatText - Base.width_ScrollBar;
  }

  /** --- */
  refreshWidth() {
    this.DOM.root.style("width", this.width_Real + "px");
    this.attribs.forEach((_) => _.block.refreshWidth());
  }

  /** --- */
  updateWidth_CatMeasureLabels() {
    // even if width is the same, stacked/not-stacked may have changed
    this._width_CatMeasureLabel = this.calcWidth_MeasureLabel();
    this.attribs_Categorical.forEach((attrib) =>
      attrib.block.refreshLabelWidth()
    );
  }

  /** -- */
  hiddenCatBars() {
    return this.width_CatBars <= 20;
  }

  /** -- */
  initDOM_AdjustWidth() {
    if (this.name === "middle" || this.name === "bottom") {
      return; // not supported
    }
    this.DOM.root
      .append("span")
      .attr("class", "panelAdjustWidth")
      .tooltip(i18n["Adjust Panel Width"])
      .on("mousedown", (event) => {
        if (event.which !== 1) return; // only respond to left-click
        var mouseDown_x = d3.pointer(event, document.body)[0];
        var mouseDown_width = this.width_CatBars;

        this.browser.activateWidthDrag(event.currentTarget, event, (event2) => {
          var mouseMove_x = d3.pointer(event2, document.body)[0];
          var mouseDif = mouseMove_x - mouseDown_x;
          if (this.name === "right") mouseDif *= -1;
          this.width_CatBars = mouseDown_width + mouseDif;
          this.browser.updateMiddlePanelWidth();
          this.browser.updateLayout_Height();
        });
      })
      .on("click", (event) => {
        event.stopPropagation();
        event.preventDefault();
      });
  }

  /** --- */
  private calcWidth_MeasureLabel(): number {
    if (this.isEmpty()) return 0;

    var activeAggrMax, activeAggrMin;

    if (this.browser.percentBreakdown) {
      // 100 / %
      activeAggrMax = 99; // 2 digits
      activeAggrMin = 0; // 1 digit
    } else {
      activeAggrMax = d3.max(this.attribs, (_: Attrib) =>
        _.getPeakAggr(d3.max, "Active")
      );
      activeAggrMin = d3.max(this.attribs, (_: Attrib) =>
        _.getPeakAggr(d3.min, "Active")
      );
      if (activeAggrMax === 0 && activeAggrMin === 0) return 0;
    }

    var _w_ = 2;

    // compute number of digits
    var digits = 1;
    while (activeAggrMax > 9) {
      digits++;
      activeAggrMax = Math.floor(activeAggrMax / 10);
    }
    if (!this.browser.hasIntOnlyMeasure()) {
      digits += 2;
      _w_ += 8; // Space for ","
    }
    if (digits > 4) {
      digits = 3;
      _w_ += 3; // Space for the splitting "." character (e.q. 3.2k)
      _w_ += 10; // M, k, B, etc.
    }
    _w_ += digits * 6.5;

    if (this.browser.percentBreakdown) {
      if (Base.percentDecimal) {
        _w_ += 24; // "%" character + "." character + 1 significant digit
      } else {
        _w_ += 13; // "%" character + "." character + 1 significant digit
      }
    } else {
      // Account for the unitName displayed
      var unitName = this.browser.measureSummary.val?.unitName;
      if (unitName) {
        // TO-DO: Use the rendered width, instead of fixed multiplier, "11"
        _w_ += 2 + unitName.length * 7;
      }
    }

    // negative values have "-" character
    if (activeAggrMin < 0) _w_ += 5;

    return _w_;
  }

  // ********************************************************************
  // Add / remove blocks
  // ********************************************************************

  /** -- */
  addBlock(block: Block, index) {
    block.panel = this;
    var beforeDOM = this.DOM.root.selectAll(".dropZone").nodes()[index];
    if (block.DOM.root && beforeDOM) {
      block.DOM.root.style("display", "");
      this.DOM.root.node().insertBefore(block.DOM.root.node(), beforeDOM);
    } else {
      if (!block.initDOM(beforeDOM)) return;
    }

    this.DOM.root.classed("hasBlocks", true);

    var curIndex = -1;
    this.attribs.forEach((attrib, i) => {
      if (attrib.block === block) curIndex = i;
    });
    if (curIndex === -1) {
      // block is new to this panel
      if (index >= this.attribs.length) this.attribs.push(block.attrib);
      else this.attribs.splice(index, 0, block.attrib);

      this.updateWidth_CatMeasureLabels();
      if (block instanceof Block_Categorical) {
        block.refreshLabelWidth();
        if (block.viewType === "map") {
          block.catViewAs("map"); // donno why this is needed for now.
        }
      }
      //
    } else {
      // block was in the panel. Change position
      this.attribs.splice(curIndex, 1);
      this.attribs.splice(index, 0, block.attrib);
    }

    if (this.attribs.length === 1) this.refreshWidth();
    this.refreshCollapsed();

    this.addDOM_DropZone(block.DOM.root.node());

    this.addRemove_Finalize();
  }

  /** -- */
  removeBlock(block: Block) {
    block.panel = undefined;
    // remove the drop zone that this block created
    var dropZoneDOM = this.DOM.root.selectAll(".dropZone").nodes()[
      block.orderInPanel
    ];
    dropZoneDOM.parentNode.removeChild(dropZoneDOM);

    this.attribs.splice(block.orderInPanel, 1);

    this.updateWidth_CatMeasureLabels();
    this.DOM.root.classed("hasBlocks", this.hasBlocks());
    if (!this.hasBlocks()) this.refreshCollapsed();

    this.addRemove_Finalize();
  }

  private addRemove_Finalize() {
    this.refreshBlocksDropZonesOrder();

    if (this.name === "bottom") {
      this.browser.DOM.panel_Wrapper.classed(
        "panel_bottom_empty",
        !this.hasBlocks()
      );
    }

    this.refreshSharedMeasureExtent();
    this.attribs.forEach((attrib) => attrib.updateChartScale_Measure());
  }

  /** -- */
  refreshBlocksDropZonesOrder() {
    this.attribs.forEach((attrib, i) => {
      attrib.block.orderInPanel = i;
    });
    this.DOM.root.selectAll(".dropZone").each(function (d, i) {
      this.__data__ = i;
    });
  }

  /** Adds the dropZone DOM BEFORE the provided dom-- */
  addDOM_DropZone(beforeDOM = null) {
    var zone;
    if (beforeDOM) {
      zone = this.DOM.root.insert("div", () => beforeDOM); // must be a function returning a dom object...
    } else {
      zone = this.DOM.root.append("div");
    }
    zone
      .attr("class", "dropZone")
      .on("mouseenter", function () {
        this.classList.add("onHover");
        this.children[0].classList.add("onReadyToDrop");
      })
      .on("mouseleave", function () {
        this.classList.remove("onHover");
        this.children[0].classList.remove("onReadyToDrop");
      })
      .on("mouseup", (event) => {
        var attrib = this.browser.movedAttrib;
        if (!attrib) return;
        if (attrib.block.panel) {
          // if the block was in the panels already
          attrib.block.DOM.root.node().nextSibling.style.display = "";
          attrib.block.DOM.root.node().previousSibling.style.display = "";
        }
        attrib.block.addToPanel(this, event.currentTarget.__data__);
        this.browser.updateLayout();
      })
      .call((dropZone) => {
        dropZone.append("div").attr("class", "dropIcon fa fa-chart-bar");
        dropZone
          .append("div")
          .attr("class", "dropZoneText")
          .text(i18n["Drop Chart"]);
      });
  }

  // ********************************************************************
  // Updating layout
  // ********************************************************************

  private heightRemaining: number = 0;

  /** -- */
  setHeightAndLayout(targetHeight: number) {
    this.height = targetHeight;

    this.heightRemaining = targetHeight;

    var finalPass = false,
      lastRound = false;

    // initialize all blocks as not yet processed.
    this.blocks.forEach((block) => {
      block.dueForLayout = true;
    });

    var dueBlockCount = this.attribs.length;

    var markDone = (block: Block) => {
      if (!block.dueForLayout) return;
      this.heightRemaining -= block.height_withMargin;
      // see if the panel is on the bottom
      setTimeout(() => {
        var node = block.DOM.root.node();
        var top = node.getBoundingClientRect().top;
        var pos = "onBottom";
        if (top > 300) {
          pos = "onTop";
        }
        if (top < 300 || this.width_Real < 400) {
          if (this.name === "left") {
            pos = "onRight";
          } else if (this.name === "right") {
            pos = "onLeft";
          }
        }
        block.DOM.root
          .select(".summaryConfig")
          .classed("onBottom", pos === "onBottom")
          .classed("onTop", pos === "onTop")
          .classed("onRight", pos === "onRight")
          .classed("onLeft", pos === "onLeft");
      }, 1000);
      delete block.dueForLayout;
      dueBlockCount--;
    };

    this.blocks
      .filter(
        (block) =>
          !block.isVisible() || // Empty or collapsed
          block.hasStaticHeight()
      )
      .forEach((block) => markDone(block));

    while (true) {
      if (dueBlockCount === 0) break;
      var dueBlockCount_Pre = dueBlockCount;

      // Distribute remaining space
      this.blocks
        .filter((block) => block.dueForLayout)
        .forEach((block) => {
          // in last round, if _block can expand, expand it further
          if (finalPass && block.attrib.type == "content") {
            if (block.height_RangeMin < this.heightRemaining) {
              block.setHeight(this.heightRemaining);
            } else {
              block.setCollapsed(true);
            }
            markDone(block);
            return;
          }
          if (lastRound === true) {
            if (block.height_RangeMax > block.getHeight()) {
              this.heightRemaining += block.getHeight();
              block.setHeight(this.heightRemaining);
              this.heightRemaining -= block.getHeight();
              return;
            }
          }
          if (dueBlockCount === 0) return;

          // Fairly distribute remaining size across all remaining
          var _heightRemaining = Math.floor(
            this.heightRemaining / dueBlockCount
          );

          if (_heightRemaining >= block.height_RangeMax) {
            // Panel has more space than what the block needs
            block.setHeight(block.height_RangeMax);
            markDone(block);
          } else if (finalPass) {
            if (_heightRemaining >= block.height_RangeMin) {
              // Use whatever space
              block.setHeight(_heightRemaining);
              markDone(block);
            } else {
              // auto-collapse block if you do not have enough space
              if (block.attrib.type !== "content") {
                block.setCollapsed(true);
                markDone(block);
              }
            }
          }
        });

      finalPass = dueBlockCount_Pre === dueBlockCount;
      if (lastRound === true) break;
      if (dueBlockCount === 0) lastRound = true;
    }

    if (this.name === "left" || this.name === "right") {
      this.refreshCollapsed();
    }

    if (this.name === "bottom" || this.name === "middle") {
      this.height = this.height - this.heightRemaining;
      this.heightRemaining = 0;
    }

    this.attribs.forEach((attrib, i) => {
      attrib.block.DOM.root.style(
        "margin-bottom",
        i === this.attribs.length - 1 ? "0" : null
      );
    });
  }

  // ********************************************************************
  // Collapsing panel
  // ********************************************************************

  /** -- */
  collapseAllSummaries(exceptThisOne) {
    this.attribs.forEach((_) => _.block.setCollapsed(_ !== exceptThisOne));
    this.browser.updateLayout_Height();
  }

  /** -- */
  isCollapsed() {
    if (this.name === "bottom") return false;
    return this.hasBlocks() && this.attribs.every((_) => _.block.collapsed);
  }

  /** -- */
  refreshCollapsed() {
    var _old = this.DOM.root.classed("collapsed");
    var _new = this.isCollapsed();
    this.DOM.root.classed("collapsed", _new);
    this.refreshWidth();
    if (_old !== _new) {
      this.browser.updateLayout();
    }
  }

  // ********************************************************************
  // Synced scales
  // ********************************************************************

  private _syncedMeasureExtent = [0, 1]; // temp init value

  /** -- */
  refreshSharedMeasureExtent() {
    var scales = this.attribs
      .filter(
        (s) =>
          (s instanceof Attrib_Categorical && s.block.isView_List) ||
          (s instanceof Attrib_Interval && s.block.showHistogram.val)
      )
      .map((s) => s.measureExtent_Self);
    this._syncedMeasureExtent = [
      d3.min(scales, (_) => _[0]),
      d3.max(scales, (_) => _[1]),
    ];
  }
  /** -- */
  get syncedMeasureExtent() {
    return this._syncedMeasureExtent;
  }

  // ********************************************************************
  // Export / import
  // ********************************************************************

  /** -- */
  exportConfig(): PanelSpec {
    return {
      catBarWidth: this.name !== "bottom" && this.width_CatBars,
      catLabelWidth: this.width_CatText,
    };
  }

  importConfig(config: PanelSpec) {
    if (!config) return;
    if (config.catLabelWidth) {
      this.width_CatText = config.catLabelWidth;
    }
    if (config.catBarWidth && this.name !== "bottom") {
      this.width_CatBars = config.catBarWidth;
    }
  }
}
