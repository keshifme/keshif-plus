import { select, pointer } from "./d3_select";

import { Panel } from "./UI/Panel";
import { Attrib } from "./Attrib";
import { i18n } from "./i18n";
import { CompareType, d3Selection, MeasureType } from "./Types";
import { Util } from "./Util";
import { Base } from "./Base";
import { Modal } from "./UI/Modal";
import { Record } from "./Record";
import { Aggregate } from "./Aggregate";

const d3 = { select, pointer };

export abstract class Block {
  // attribute of the block
  public readonly attrib: Attrib;
  // browser of the block (retrieved from attribute)
  protected get browser() {
    return this.attrib.browser;
  }

  // shorthand
  get _aggrs(): Aggregate[] {
    return this.attrib._aggrs;
  }

  public DOM: {
    inited: boolean;
    nugget?: d3Selection;
    summaryIcons?: d3Selection;
    root?: d3Selection;
    headerGroup?: d3Selection;
    summaryConfig?: d3Selection;
    wrapper?: d3Selection;
    summaryNameWrapper?: d3Selection;
    blockName?: d3Selection;
    summaryConfigControl?: d3Selection;

    [index: string]: d3Selection; // general access...
  } = { inited: false };

  // The panel this block appears in (if placed in dashboard)
  public panel: Panel = null;
  public orderInPanel: number;

  // Can be accessed by called .collapsed
  private _collapsed: boolean = false;
  get collapsed(): boolean {
    return this._collapsed;
  }

  private _height_header: number = 0; // TODO
  // Used by panel layouting to keep track of which blocks need to be layout
  public dueForLayout: boolean; // TODO

  constructor(attrib: Attrib) {
    this.attrib = attrib;
  }

  get inDashboard() {
    return this.panel !== null;
  }
  isVisible() {
    return (
      !this.attrib.isEmpty() &&
      this.inDashboard &&
      !this.collapsed &&
      this.DOM.inited
    );
  }

  abstract get height_Content(): number;
  abstract get height_RangeMin(): number;
  abstract get height_RangeMax(): number;
  abstract setHeight(targetHeight: number): void;
  abstract refreshWidth(): void;
  abstract hasStaticHeight(): boolean;

  abstract initDOM(beforeDOM): boolean;

  onClearFilter(forceUpdate: boolean = false) {}

  getWidth(): number {
    return this.panel ? this.panel.width_Real - 2 : 0; // 1 pixel border on left & right
  }
  getHeight(): number {
    return this.height_Header + this.height_Content;
  }
  get height_withMargin() {
    return this.getHeight() + 8;
  }

  get height_Header() {
    if (!this.DOM.inited) return 0;
    if (!this._height_header) {
      if (this.panel.isCollapsed()) return 0;
      this._height_header = 29; // too much work to get the height/width right with panels collapsing
      // 1 * this.DOM.headerGroup.node().offsetHeight;
    }
    return this._height_header;
  }

  refreshHeight() {
    if (this.attrib.isEmpty() || !this.inDashboard || !this.DOM.inited) return;
    this.DOM.root.style("flex-basis", this.getHeight() + "px");
  }

  insertRoot(beforeDOM: Element | null) {
    this.DOM.root = this.panel.DOM.root.insert("div", () => {
      return beforeDOM;
    });

    this.DOM.root
      .attr("class", "kshfSummary " + this.attrib.blockClassName)
      .attr("summary_id", this.attrib.attribID) // can be used to customize a specific summary using CSS
      .classed("disableCompareLock", !this.attrib.isComparable.val)
      .classed("filtered", this.attrib.isFiltered())
      .datum(this);

    // can be extended by sub-classes
    this.insertHeader();

    // initialize config controls
    Object.values(this.attrib.configs).forEach((cfg) =>
      cfg.insertControl(this.DOM.summaryConfig)
    );
  }

  updateDescription() {
    this.DOM.nugget
      ?.select(".summaryDescription")
      .classed("active", this.attrib.description ? true : null)
      .node()
      .tippy.setContent(this.attrib.description);
    this.DOM.summaryIcons
      ?.select(".summaryDescription")
      .classed("active", this.attrib.description ? true : null);
  }

  addToPanel(panel: Panel, index = null, _force = false) {
    if (!panel) return;

    if (index === null) {
      index = panel.attribs.length; // add to end
    }

    var panelChanged = false;
    if (this.panel === null) {
      panelChanged = true;
    } else if (this.panel && this.panel !== panel) {
      this.panel.removeBlock(this);
      panelChanged = true;
    } else {
      // re-inserting to current panel
      if (this.orderInPanel === index) {
        return; // inserting the summary to the same index as current one
      }
      // remove the dropzone above the moved summary
      var dropZoneDOM = this.panel.DOM.root.selectAll(".dropZone").nodes()[
        this.orderInPanel
      ];
      dropZoneDOM.parentNode.removeChild(dropZoneDOM);
      if (this.orderInPanel < index) index--;
    }

    panel.addBlock(this, index);
    this.DOM.nugget?.classed("inDashboard", (_) => this.inDashboard);

    if (panelChanged) {
      this.refreshWidth();
    }

    this.browser.refreshIsEmpty();
  }

  removeFromPanel() {
    if (!this.panel) return;
    this.panel.removeBlock(this);

    if (this.DOM.root) {
      let dom = this.DOM.root.node();
      dom.parentNode.removeChild(dom);
    }

    this.panel = null;

    this.DOM.nugget?.classed("inDashboard", (_) => this.inDashboard);

    this.browser.refreshIsEmpty();
  }

  insertHeader() {
    var me = this;

    var _tempMoved = false;
    this.DOM.headerGroup = this.DOM.root
      .append("div")
      .attr("class", "headerGroup")
      .on("mousedown", function (event) {
        if (!me.browser.authorMode) {
          event.preventDefault();
          return;
        }
        var _this = this;
        var moved = false;
        _tempMoved = false;
        d3.select("body")
          .style("cursor", "move")
          .on("keydown.layout", function () {
            if (event.keyCode === 27) {
              // Escape key
              _this.style.opacity = null;
              me.browser.clearDropZones();
            }
          })
          .on("mousemove.layout", function (event2) {
            _tempMoved = true;
            if (!moved) {
              if (_this.nextSibling) _this.nextSibling.style.display = "none";
              if (_this.previousSibling)
                _this.previousSibling.style.display = "none";
              _this.parentNode.style.opacity = 0.5;
              me.browser.prepareDropZones(me.attrib, "browser");
              moved = true;
            }
            var mousePos = d3.pointer(event2, me.browser.DOM.root.node());
            me.browser.DOM.attribDragBox.style(
              "transform",
              "translate(" +
                (mousePos[0] - 20) +
                "px," +
                (mousePos[1] + 5) +
                "px)"
            );
            event2.stopPropagation();
            event2.preventDefault();
          })
          .on("mouseup.layout", function (event2) {
            d3.select("body").style("cursor", null);
            // Mouse up on the body
            me.browser.clearDropZones();
            if (me.panel !== undefined || true) {
              _this.parentNode.style.opacity = null;
              if (_this.nextSibling) _this.nextSibling.style.display = "";
              if (_this.previousSibling)
                _this.previousSibling.style.display = "";
            }
            event2.preventDefault();
          });
        event.preventDefault();
      })
      .on("mouseup", () => {
        if (_tempMoved) return;
        d3.select("body").style("cursor", null);
        this.browser.clearDropZones();
        this.browser.unregisterBodyCallbacks();
      });

    this.DOM.headerGroup
      .append("span")
      .attr("class", "header_display_control iconGroup")
      .on("mousedown", (event) => event.stopPropagation())
      .selectAll("span")
      .data([
        [
          "Remove",
          "far fa-times-circle",
          () => {
            this.removeFromPanel();
            this.browser.updateLayout();
          },
        ],
        [
          "Collapse",
          "far fa-compress-alt",
          () => this.setCollapsedAndLayout(true),
        ],
        ["Open", "far fa-expand-alt", () => this.setCollapsedAndLayout(false)],
      ])
      .enter()
      .append("span")
      .attr("class", (_) => "buttonSummary" + _[0] + " " + _[1])
      .tooltip((_) => i18n[_[0] + "Summary"], { placement: "bottom" })
      .on("click", (_event, _) => _[2]());

    this.DOM.summaryNameWrapper = this.DOM.headerGroup
      .append("span")
      .attr("class", "summaryNameWrapper");

    this.DOM.blockName = this.DOM.summaryNameWrapper
      .append("span")
      .attr("class", "blockName summaryName")
      .on("click", () => {
        if (this.collapsed) {
          this.setCollapsedAndLayout(false); //un-collapse
        }
      });

    this.attrib.addDOMBlockName(this.DOM.blockName);

    this.DOM.summaryIcons = this.DOM.headerGroup
      .append("span")
      .attr("class", "summaryIcons iconGroup")
      .on("mousedown", (event) => event.stopPropagation());

    this.DOM.summaryConfigControl = this.DOM.summaryIcons
      .append("span")
      .attr("class", "summaryConfigControl fal fa-cog")
      .tooltip(i18n.Configure, { placement: "bottom" })
      .on("click", () => {
        var open = !this.DOM.root.classed("showConfig");
        this.browser.closeConfigPanels();
        if (open) {
          this.browser.blockWithOpenConfig = this;
        }
        this.DOM.root.classed("showConfig", open);
      });

    this.DOM.summaryIcons
      .append("span")
      .attr("class", "summaryDescription fa fa-info")
      .tooltip("", {
        placement: "bottom",
        onShow: (instance) => {
          instance.reference.tippy.setContent(this.attrib.description);
        },
      });

    this.DOM.headerGroup
      .append("div")
      .attr("class", "configPanel summaryConfig")
      .on("mousedown", (event) => event.stopPropagation())
      .call((summaryConfig) => {
        summaryConfig
          .append("div")
          .attr("class", "configClose fa fa-window-close")
          .tooltip(i18n.Close)
          .on("click", () => {
            this.browser.closeConfigPanels();
            this.DOM.root.classed("showConfig", false);
          });
        summaryConfig
          .append("div")
          .attr("class", "compactSizeControl far fa-angle-double-up")
          .on("click", (event) =>
            event.target.parentNode.classList.toggle("compact")
          );
        this.DOM.summaryConfig = summaryConfig
          .append("table")
          .attr("class", "configTable");
      });

    this.DOM.wrapper = this.DOM.root.append("div").attr("class", "wrapper");

    this.refreshSummaryName_DOM();

    this.insertDOM_EmptyAggr();

    this.DOM.summaryNameWrapper
      .insert("div", ":first-child")
      .attr("class", "summaryHeaderButton clearFilterButton fa")
      .tooltip(i18n.RemoveFilter, { placement: "bottom" })
      .on("mousedown", (event) => event.stopPropagation())
      .on("click", (event) => {
        this.attrib.summaryFilter?.clearFilter();
        event.stopPropagation();
      });

    this.DOM.summaryNameWrapper
      .append("div")
      .attr("class", "summaryHeaderButton summaryLockButton far fa-clone")
      .tooltip("", {
        onTrigger: (instance) => {
          instance.reference.tippy.setContent(
            i18n[
              this.browser.comparedAttrib === this.attrib
                ? "Unlock"
                : "CompareTopCategories"
            ]
          );
        },
      })
      .on("mousedown", (event) => event.stopPropagation())
      .on("click", (event) => {
        if (this.attrib.isComparedAttrib()) {
          this.browser.clearSelect_Compare(
            this.browser.activeComparisons,
            true,
            true
          );
        } else {
          this.attrib.autoCompare();
        }
        event.stopPropagation();
      });
  }

  refreshSummaryName_DOM() {
    if (this.DOM.blockName) {
      this.attrib.addDOMBlockName(this.DOM.blockName);
    }
    this.DOM.nugget?.select(".summaryName").html(this.attrib.printName);
  }

  get hasNugget(): boolean {
    return !!this.DOM.nugget;
  }

  refreshNugget(_dom) {
    var me = this;
    let attribMoved;
    this.DOM.nugget = _dom;
    this.DOM.nugget
      .on("dblclick", (event, d) => {
        if (event.which !== 1) return; // only respond to left-click
        if (this.inDashboard) {
          this.removeFromPanel();
        } else {
          this.browser.autoAddAttib(d.item);
        }
        this.browser.updateLayout();
      })
      .on("mousedown", function (event) {
        if (event.which !== 1) return; // only respond to left-click

        var _this = this;
        attribMoved = false;
        d3.select("body")
          .on("keydown.layout", (event2) => {
            if (event2.keyCode === 27) {
              // Escape key
              _this.removeAttribute("moved");
              me.browser.clearDropZones();
            }
          })
          .on("mousemove.layout", (event2) => {
            if (!attribMoved) {
              _this.setAttribute("moved", "");
              me.browser.prepareDropZones(me.attrib, "authoringPanel");
              attribMoved = true;
            }
            var mousePos = d3.pointer(event2, me.browser.DOM.root.node());
            me.browser.DOM.attribDragBox.style(
              "transform",
              `translate(${mousePos[0] - 20}px,${mousePos[1] + 5}px)`
            );
            event2.stopPropagation();
            event2.preventDefault();
          })
          .on("mouseup.layout", (event2) => {
            if (!attribMoved) return;
            _this.removeAttribute("moved");
            me.browser.DOM.root.attr("drag_cursor", null);
            me.browser.clearDropZones();
            event2.preventDefault();
          });
        event.preventDefault();
      })
      .on("mouseup", () => {
        if (!attribMoved) this.browser.unregisterBodyCallbacks();
      });
  }

  setCollapsedAndLayout(collapsed) {
    this.setCollapsed(collapsed);
    this.browser.updateLayout_Height();

    if (!this.DOM.root || this.collapsed || !this.DOM.inited) return;
    this.refreshViz_All();
    this.refreshMeasureLabelText("Active");
  }

  setCollapsed(v: boolean): void {
    this._collapsed = v;
    this.panel?.refreshCollapsed();
    var _ = this.height_Header; // computes header height if needed.
    this.DOM.root
      ?.classed("collapsed", this.collapsed)
      .classed("showConfig", false);
    this.onCollapse();
  }

  // Can be extended by sub-classes as needed
  onCollapse(): void {
    return;
  }

  abstract refreshViz_Active(): void;
  abstract refreshViz_Compare(
    cT: CompareType,
    curGroup,
    totalGroups,
    prevCts
  ): void;

  // used by subclasses as well
  get measureLineZero() {
    return this.attrib.chartScale_Measure(0);
  }

  refreshViz_Cache(sT: MeasureType, _preCompare = null) {
    if (!this.DOM.inited) return;
    if (this.attrib.type === "setpair") return;

    var baseline = this.measureLineZero;
    var preCompare = this.browser.stackedChart
      ? _preCompare || this.browser.activeComparisons
      : [];

    var _chartValue = (aggr, sT) =>
      this.attrib.chartScale_Measure(this.browser.getChartValue(aggr, sT)) -
      baseline;

    this._aggrs.forEach((aggr) => {
      aggr.setScale(sT, _chartValue(aggr, sT));
      aggr.setOffset(
        sT,
        preCompare.reduce((accum, sT) => accum + _chartValue(aggr, sT), 0)
      );
    });

    // flip 'active' selection
    if (sT === "Active" && preCompare.length > 0 && this.browser.stackedChart) {
      this._aggrs.forEach((aggr) => {
        aggr.setScale(sT, aggr.scale("Active") - aggr.offset(sT));
      });
    }
  }

  /** -- */
  refreshViz_All(withAxisRefresh = true) {
    if (!this.isVisible()) return;
    if (!this.attrib.chartScale_Measure) return;
    this.refreshViz_Active();
    this.refreshViz_Compare_All();
    this.refreshViz_NoValueAggr();
    if (withAxisRefresh) this.refreshViz_Axis();
  }
  // -- TODO: incomplete / check references, not used much
  refreshViz(sT) {
    return sT === "Active"
      ? this.refreshViz_Active()
      : this.refreshViz_Compare(sT, 0, 0, null);
  }
  /** -- */
  refreshViz_Compare_All() {
    var compared = this.browser.activeComparisons;
    var totalC = this.browser.activeComparisonsCount;

    compared.forEach((cT, i) =>
      this.refreshViz_Compare(cT, i, totalC, compared.slice(0, i))
    );
  }

  // This can be set to true to prevent refreshViz_Axis from executing
  noRefreshVizAxis: boolean = false;

  abstract chartAxis_Measure_TickSkip(): number;

  /** -- */
  refreshViz_Axis() {
    if (!this.isVisible()) return;
    if (this.noRefreshVizAxis) return;

    var axis_Scale = this.attrib.chartScale_Measure.copy().clamp(false);

    // GET TICK VALUES ***********************************************************
    // (no more than 10 tick values)
    var tickValues = axis_Scale.ticks(
      Math.min(10, this.chartAxis_Measure_TickSkip())
    );

    // Remove 0-tick if all domain values are non-negative
    // if(axis_Scale.domain()[0]>=0) tickValues = tickValues.filter(d => d!==0 );

    if (this.browser.hasIntOnlyMeasure())
      tickValues = tickValues.filter((d) => Number.isInteger(d));

    var ticks = tickValues.map((p) => ({ tickValue: p, major: true }));

    if (this.attrib.measureScale_Log) {
      if (this.attrib.measureLogBase === 2) {
        Util.insertMinorTicks(
          tickValues,
          this.attrib.chartScale_Measure,
          ticks
        );
      } else {
        var maxDomainValue = axis_Scale.domain()[1];
        if (maxDomainValue > this.attrib.measureLogBase) {
          ticks = [];
          tickValues = [];
          var x = 1;
          maxDomainValue *= this.attrib.measureLogBase; // adding one more major tick beyond the domain, so minors can be added.
          while (x < maxDomainValue) {
            ticks.push({ tickValue: x, major: true });
            tickValues.push(x);
            x *= this.attrib.measureLogBase;
          }
        }
        Util.insertMinorTicks(
          tickValues,
          this.attrib.chartScale_Measure,
          ticks,
          this.attrib.measureLogBase - 1
        );
        maxDomainValue = axis_Scale.domain()[1];
        ticks = ticks.filter((_) => _.tickValue < maxDomainValue);
      }
    }

    var _transform =
      this.attrib.type === "categorical"
        ? (d, _scale) => `translateX(${_scale(d.tickValue) - 0.5}px)`
        : (d, _scale) => `translateY(${-_scale(d.tickValue)}px)`;

    var finalAnim = (t) =>
      t
        .style("transform", (d) => _transform(d, axis_Scale))
        .style("opacity", 1);

    var selection = this.DOM.chartAxis_Measure_TickGroup
      .selectAll("span.tick")
      .data(ticks, (t) => t.tickValue);

    selection
      .enter()
      .append("span")
      .attr("class", "tick")
      .call((ticks) => {
        ticks.append("span").attr("class", "line");
        ticks.append("span").attr("class", "text measureAxis_1");
        ticks.append("span").attr("class", "text measureAxis_2");

        if (
          this.browser.chartsLoaded &&
          this.attrib.chartScale_Measure_prev &&
          !this.browser.preventAxisScaleTransition
        ) {
          // to transition position from previous scale, set position based on previous scale first
          ticks
            .style("opacity", 0)
            .classed("noAnim", true)
            .style("transform", (tick) =>
              _transform(tick, this.attrib.chartScale_Measure_prev)
            )
            .classed("noAnim", false)
            .call((ticks) =>
              finalAnim(ticks.transition().duration(0).delay(10))
            );
        } else {
          finalAnim(ticks);
        }
      })
      .merge(selection)
      .classed("major", (tick) => tick.major)
      .classed("minor", (tick) => !tick.major)
      .call((x) =>
        x
          .selectAll(".text")
          .html((tick) => this.browser.getValueLabel(tick.tickValue, false))
      );

    finalAnim(selection);

    selection.exit().call((exit) => {
      if (
        this.browser.chartsLoaded &&
        this.attrib.chartScale_Measure_prev &&
        !this.browser.preventAxisScaleTransition
      ) {
        exit = exit.style("transform", (tick) => _transform(tick, axis_Scale));
      }
      return exit
        .style("opacity", 0)
        .transition()
        .duration(0)
        .delay(500)
        .remove();
    });
  }

  refreshViz_NoValueAggr() {
    if(this.attrib.noValueAggr.records.length===0) return;
    this.DOM.noValueAggr?.classed(
      "visible",
      this.attrib.noValueAggr.recCnt("Active") > 0
    );
  }

  refreshMeasureLabelPos_All() {
    this.refreshMeasureLabelPos("Active");
    this.browser.activeComparisons.forEach((cT, i) =>
      this.refreshMeasureLabelPos(cT, i)
    );
  }
  refreshMeasureLabelPos(sT = "Active", curGroup = 0) {
    // No-op, can be extended
  }

  refreshMeasureLabelText(selectType: MeasureType) {
    if (!this.isVisible()) return;
    var _ = this.DOM["measureLabel_" + selectType];
    if (!_) return;

    var offset =
      this.browser.stackedChart && selectType === "Active"
        ? this.browser.activeComparisons
        : [];

    var func = (aggr: Aggregate) => {
      var _val = this.browser.getMeasureValue(aggr, selectType, null, offset);
      var isSVG = aggr.DOM?.aggrGlyph?.nodeName === "g";
      return this.browser.getValueLabel(
        _val,
        isSVG,
        Base.percentDecimal ? 1 : 0
      );
    };

    _.html(func);

    if (
      this.attrib.noValueAggr.records.length > 0 &&
      selectType === "Active"
    ) {
      offset = [];
      this.DOM.noValueAggr?.select(".measureLabel_Active").html(func);
    }
  }

  insertDOM_EmptyAggr() {
    this.DOM.noValueAggr = this.DOM.wrapper
      .append("span")
      .attr("class", "noValueAggr aggrGlyph")
      .classed("filtered", this.attrib.noValueAggr.filtered)
      .datum(this.attrib.noValueAggr)
      .tooltip((_) => this.attrib.noValueAggr.getTooltipHTML(), {
        theme: "dark kshf-tooltip kshf-record",
      })
      .each((_, i, nodes) => {
        this.attrib.noValueAggr.setAggrGlyph(nodes[i]);
      })
      .on("mouseover", () => {
        if (!this.browser.mouseOverCompare.val) return;
        if (this.browser.adjustMode) return;
        this.browser.setSelect_Compare(this.attrib.noValueAggr);
      })
      .on("mouseout", () => {
        this.browser.clearSelect_Compare();
      })
      .on("click", (event) => {
        if (event.shiftKey) {
          this.browser.lockSelect_Compare();
          return;
        }

        var noValAggr = this.attrib.noValueAggr;

        var menuConfig = { name: "Filter", items: [] };

        if (noValAggr.filtered) {
          menuConfig.items.push({
            id: "filterOption_Remove",
            name: `<span class='filterContextOpt'>${i18n.Clear}</span>`,
            do: () => {
              noValAggr.filtered = false;
              this.attrib.summaryFilter.how = "All";
              this.attrib.summaryFilter.clearFilter();
            },
          });
        }

        if (noValAggr.filtered !== "in") {
          menuConfig.items.push({
            id: "filterOption_Only",
            iconXML: "✗",
            name: i18n.KeepNoData,
            helparticle: "5e88e95e04286364bc97d43f",
            do: () => {
              this.attrib.summaryFilter.clearFilter();
              noValAggr.filtered = "in";
              this.attrib.summaryFilter.how = "All";
              this.attrib.summaryFilter.setFiltered();
            },
          });
        }
        if (noValAggr.filtered !== "out") {
          menuConfig.items.push({
            id: "filterOption_Not",
            iconXML: "✓",
            name: i18n.KeepValidData,
            helparticle: "5e88e95e04286364bc97d43f",
            do: () => {
              noValAggr.filtered = "out";
              this.attrib.summaryFilter.setFiltered();
            },
          });
        }
        Modal.popupMenu(event, menuConfig, noValAggr);
      });

    this.DOM.noValueAggr.append("div").attr("class", "noValueIcon").text("∅");
    this.DOM.noValueAggr
      .append("div")
      .attr("class", "measureLabel measureLabel_Active");

    this.refreshViz_NoValueAggr();
  }

  abstract updateAfterFilter(refreshViz: boolean): void;
  refreshUIFiltered(v) {
    this.DOM.root
      ?.classed("filtered", v)
      .classed(
        "filtered_missing",
        v ? this.attrib.noValueAggr.filtered !== false : false
      );
  }

  // -- Shared - Summary Base --
  insertChartAxis_Measure(dom) {
    this.DOM.chartAxis_Measure = dom
      .append("div")
      .attr("class", "chartAxis_Measure");

    this.DOM.chartAxis_Measure.append("div").attr("class", "measureDescrLabel");
    this.refreshMeasureDescrLabel();

    this.DOM.chartAxis_Measure_TickGroup = this.DOM.chartAxis_Measure
      .append("div")
      .attr("class", "tickGroup");
  }
  refreshMeasureDescrLabel() {
    this.DOM.root
      ?.selectAll(".measureDescrLabel")
      .html(i18n.MeasureDescrLabel(this.browser, this));
  }

  // Utility method for subclasses
  insertAggrLockButton(dom, placement) {
    var onClick = (aggr: Aggregate) => {
      if (aggr.compared && aggr.locked) {
        this.browser.clearSelect_Compare(aggr.compared, true, true);
      } else {
        if (
          this.browser.setSelect_Compare(
            aggr,
            null,
            false // no finalize analytics
          )
        ) {
          this.browser.lockSelect_Compare();
        }
      }
    };

    dom
      .append("span")
      .attr("class", "lockButton far fa-clone")
      .tooltip((_: Aggregate) => i18n[_.locked ? "Unlock" : "LockToCompare"], {
        placement: placement,
      })
      .on("click", (event, aggr) => {
        if (this.browser.comparedAttrib && !this.attrib.isComparedAttrib()) {
          Modal.confirm(
            i18n.DialogChangeCompare(
              this.attrib.attribNameHTML,
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
              onClick(aggr);
            },
            () => {}
          );
        } else if (!this.browser.Compare_Highlight && !aggr.locked) {
          Modal.alert(i18n.ComparedSelectionsLimit);
        } else {
          onClick(aggr);
        }
        event.preventDefault();
        event.stopPropagation();
      });
  }

  // ********************************************************************
  // ********************************************************************

  showRecordValue(record: Record): void {}
  hideRecordValue(): void {}
}
