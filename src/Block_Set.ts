import { select, pointer } from "./d3_select";
import { max } from "d3-array";
import { format } from "d3-format";
import { easeLinear } from "d3-ease";
import { interpolate, interpolateHsl } from "d3-interpolate";
import { rgb } from "d3-color";

import { Attrib_Set } from "./Attrib_Set";
import { Aggregate_SetPair } from "./Aggregate_SetPair";
import { Block } from "./Block";
import { i18n } from "./i18n";
import { Base } from "./Base";
import { CompareType } from "./Types";
import { Aggregate_Category } from "./Aggregate_Category";
import { Util } from "./Util";

const d3 = {
  select,
  pointer,
  max,
  format,
  easeLinear,
  interpolate,
  interpolateHsl,
  rgb,
};

export class Block_Set extends Block {
  // specific attribute type
  public readonly attrib: Attrib_Set;

  constructor(attrib: Attrib_Set) {
    super(attrib);

    this.panel = attrib.setListAttrib.block.panel;
  }

  // ********************************************************************
  // Shorthand
  // ********************************************************************

  get setPairs(): Aggregate_SetPair[] {
    return this.attrib.setPairs;
  }
  get setListSummary() {
    return this.attrib.parent;
  }
  get rowHeight(): number {
    return this.setListSummary.barHeight.get();
  }

  /** -- */
  get setPairCount_Total() {
    return (this.attrib.sets.length * (this.attrib.sets.length - 1)) / 2;
  }

  get popupSide() {
    return this.setListSummary.block.panel.name === "left" ? "right" : "left";
  }

  // ********************************************************************
  // Radius / diameter
  // ********************************************************************

  private setPairDiameter = 0;

  updateSetPairDiameter() {
    this.setPairDiameter = this.rowHeight - 2;
  }

  /** Shorthand - half of diameter */
  get setPairRadius() {
    return this.setPairDiameter / 2;
  }

  // ********************************************************************
  // Maximum active values
  // ********************************************************************

  private _maxSetPairAggr_Active = 0;

  /** -- */
  updateMaxAggr_Active() {
    this._maxSetPairAggr_Active = d3.max(
      this.setPairs,
      (aggr: Aggregate_SetPair) => aggr.measure("Active")
    );
  }

  /** -- */
  private getCliqueSizeRatio(setPair) {
    return this._maxSetPairAggr_Active === 0
      ? 0
      : Math.sqrt(setPair.measure("Active") / this._maxSetPairAggr_Active);
  }

  /** -- */
  private usingFullSizeGlyph() {
    return this.browser.relativeBreakdown || this.browser.dependentBreakdown;
  }

  /** -- */
  setCollapsed(v: boolean): void {
    this.setListSummary.block.showSetMatrix(v !== true);
  }

  private gridPan_x = 0;
  public pausePanning = false;

  // ********************************************************************
  // Height and width management
  // ********************************************************************

  /** always has static height */
  hasStaticHeight(): boolean {
    return true;
  }
  get height_Content(): number {
    return this.setListSummary.block.height_Content;
  }
  get height_RangeMin(): number {
    return this.setListSummary.block.height_RangeMin;
  }
  get height_RangeMax(): number {
    return this.setListSummary.block.height_RangeMax;
  }
  getHeight(): number {
    return this.setListSummary.block.height_Categories;
  }
  setHeight(targetHeight: number): void {
    this.setListSummary.block.setHeight(targetHeight);
  }

  refreshHeight() {
    if (!this.isVisible()) return;

    this.updateSetPairDiameter();

    this.DOM.chartRoot.attr("show_gridlines", this.rowHeight > 15);

    this.DOM.setPairGroup.attr("animate_position", false);
    this.refreshRow();

    this.refreshSetPair_Background();
    this.refreshSetPair_Position();
    this.refreshViz_All();
    this.refreshSetPair_Strength();
    setTimeout(
      () => this.DOM.setPairGroup.attr("animate_position", true),
      1000
    );
  }

  /** -- */
  getWidth(): number {
    return this.browser.panels.middle.width_Real + Base.width_PanelGap;
  }
  /** -- */
  refreshWidth(): void {
    this.refreshWindowSize();
    if (this.popupSide === "left") {
      this.refreshRow_LineWidths();
      this.refreshSetPair_Position();
    }
  }

  initDOM(beforeDOM = null): boolean {
    // Inserts the DOM root under the setListSummary so that the matrix view is attached...
    this.DOM.root = this.setListSummary.block.DOM.root
      .insert("div", ":first-child")
      .attr("class", "kshfSummary setPairSummary")
      .attr("data-popupSide", this.popupSide);

    // Use keshif's standard header
    this.insertHeader();

    this.DOM.chartRoot = this.DOM.wrapper
      .append("span")
      .attr("class", "Summary_Set")
      .attr("show_gridlines", true);

    this.insertSummaryControls();

    this.DOM.setMatrixSVG = this.DOM.chartRoot
      .append("svg")
      .attr("xmlns", "http://www.w3.org/2000/svg")
      .attr("class", "setMatrix");

    /** BELOW THE MATRIX **/
    this.DOM.belowMatrix = this.DOM.chartRoot
      .append("div")
      .attr("class", "belowMatrix");

    this.DOM.pairCount = this.DOM.belowMatrix
      .append("span")
      .attr("class", "pairCount matrixInfo");
    this.DOM.pairCount_Text = this.DOM.pairCount
      .append("span")
      .attr("class", "pairCount_Text")
      .html(`<i class='fa fa-circle' style='color: #b1bdc5;'></i> 
      ${this.setPairs.length} ${i18n.Pairs} (${Math.round(
      (100 * this.setPairs.length) / this.setPairCount_Total
    )}%)`);

    this.DOM.subsetCount = this.DOM.belowMatrix
      .append("span")
      .attr("class", "subsetCount matrixInfo");
    this.DOM.subsetCount.append("span").attr("class", "circleeee borrderr");
    this.DOM.subsetCount_Text = this.DOM.subsetCount
      .append("span")
      .attr("class", "subsetCount_Text");

    this.DOM.strengthControl = this.DOM.belowMatrix
      .append("span")
      .attr("class", "strengthControl matrixInfo")
      .tooltip(
        "Cell color shows strength (ratio of shared elements) between categories."
      );

    // ******************* STRENGTH CONFIG
    this.DOM.strengthControl
      .append("span")
      .attr("class", "strengthLabel")
      .text(i18n.Weak);
    this.DOM.strengthControl
      .append("span")
      .attr("class", "strengthText")
      .text(i18n.Strength);
    this.DOM.strengthControl
      .append("span")
      .attr("class", "strengthLabel")
      .text(i18n.Strong);

    // invisible background - Used for panning
    this.DOM.setMatrixBackground = this.DOM.setMatrixSVG
      .append("rect")
      .attr("class", "setMatrixBackground")
      .attr("x", 0)
      .attr("y", 0)
      .style("fill-opacity", "0")
      .on("mousedown", (event) => {
        this.browser.DOM.pointerBlock.attr("active", "");
        this.browser.DOM.root.attr("pointerEvents", false);

        var mouseInitPos = d3.pointer(event, this.browser.DOM.root.node());

        var gridPan_x_init = this.gridPan_x;

        // scroll the setlist summary too...
        var scrollDom = this.setListSummary.block.DOM.aggrGroup.node();
        var initScrollPos = scrollDom.scrollTop;
        var w = this.getWidth();
        var h = this.getHeight();
        var initT = this.setListSummary.block.scrollTop_cache;
        var initR = Math.min(-initT - this.gridPan_x, 0);

        this.pausePanning = true;

        d3.select("body")
          .on("mousemove", (event2) => {
            var mouseMovePos = d3.pointer(event2, this.browser.DOM.root.node());
            var difX = mouseMovePos[0] - mouseInitPos[0];
            var difY = mouseMovePos[1] - mouseInitPos[1];

            if (this.popupSide === "right") difX *= -1;

            this.gridPan_x = gridPan_x_init + difX + difY;
            //this.gridPan_x = Math.min(this.getWidth(),gridPan_x_init+difX+difY);

            this.refreshSVGViewBox();

            scrollDom.scrollTop = Math.max(0, initScrollPos - difY);

            event2.preventDefault();
            event2.stopPropagation();
          })
          .on("mouseup", (event3) => {
            this.pausePanning = false;
            this.browser.DOM.root.attr("pointerEvents", null);
            this.browser.DOM.pointerBlock.attr("active", null);
            this.refreshLabel_Vert_Show();
            d3.select("body").on("mousemove", null).on("mouseup", null);
            event3.preventDefault();
            event3.stopPropagation();
          });
        event.preventDefault();
        event.stopPropagation();
      });

    this.DOM.setMatrixSVG
      .append("g")
      .attr("class", "rows")
      .style("transform", "translateY(0.5px)"); // adjusting to match to list-view on the side on retina displays.
    this.DOM.setPairGroup = this.DOM.setMatrixSVG
      .append("g")
      .attr("class", "aggrGroup setPairGroup")
      .attr("animate_position", true);

    this.insertRows();
    this.insertSetPairs();

    this.updateSetPairDiameter();

    this.refreshRow();

    this.refreshSetPair_Background();
    this.refreshSetPair_Position();
    this.refreshSetPair_Containment();

    this.refreshViz_Axis();
    this.refreshViz_Active();
    this.refreshViz_Compare_All();

    this.DOM.inited = true;

    return true;
  }

  /** -- */
  insertSummaryControls() {
    this.DOM.summaryControls = this.DOM.chartRoot
      .append("div")
      .attr("class", "summaryControls")
      .style("height", this.setListSummary.block.height_Config + 1 + "px");

    this.DOM.scaleLegend_SVG = this.DOM.summaryControls
      .append("svg")
      .attr("class", "sizeLegend")
      .attr("xmlns", "http://www.w3.org/2000/svg");

    this.DOM.legendHeader = this.DOM.scaleLegend_SVG
      .append("text")
      .attr("class", "legendHeader")
      .text("#");
    this.DOM.legend_Group = this.DOM.scaleLegend_SVG.append("g");
  }

  /** -- */
  insertRows() {
    var newRows = this.DOM.setMatrixSVG
      .select("g.rows")
      .selectAll("g.row")
      .data(this.attrib.sets, (aggr) => aggr.id)
      .enter()
      .append("g")
      .attr("class", "row")
      .each((aggr: Aggregate_Category, i, nodes) => {
        aggr.DOM.matrixRow = nodes[i];
      })
      .on("mouseenter", (_event, aggr: Aggregate_Category) =>
        this.setListSummary.onAggrHighlight(aggr)
      )
      .on("mouseleave", (_event, aggr: Aggregate_Category) =>
        this.setListSummary.onAggrLeave(aggr)
      );

    // tmp is used to parse html text
    var tmp = document.createElement("div");

    newRows
      .append("line")
      .attr("class", "line line_vert")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("y1", 0)
      .attr("y2", 0);
    newRows
      .append("text")
      .attr("class", "catLabel label_horz")
      .style("font-size", this.setListSummary.block.catLabelFontSize + "px")
      .text((aggr: Aggregate_Category) => {
        tmp.innerHTML = aggr.label;
        return tmp.textContent || tmp.innerText || "";
      })
      .on("click", (_event, aggr: Aggregate_Category) => {
        this.setListSummary.filterCategory(aggr, "AND");
      });

    newRows
      .append("line")
      .attr("class", "line line_horz")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("y2", 0);
    newRows
      .append("text")
      .attr("class", "catLabel label_vert")
      .style("font-size", this.setListSummary.block.catLabelFontSize + "px")
      .text((aggr: Aggregate_Category) => {
        tmp.innerHTML = aggr.label;
        return tmp.textContent || tmp.innerText || "";
      })
      .attr("y", -4);

    tmp.remove();

    this.DOM.setRows = this.DOM.setMatrixSVG.selectAll("g.rows > g.row");
    this.DOM.line_vert = this.DOM.setMatrixSVG.selectAll(
      "g.rows > g.row > line.line_vert"
    );
    this.DOM.line_horz = this.DOM.setMatrixSVG.selectAll(
      "g.rows > g.row > line.line_horz"
    );
    this.DOM.line_horz_label = this.DOM.setMatrixSVG.selectAll(
      "g.rows > g.row > text.label_horz"
    );
    this.DOM.line_vert_label = this.DOM.setMatrixSVG.selectAll(
      "g.rows > g.row > text.label_vert"
    );
  }

  /** -- */
  refreshViz_Active() {
    this.DOM.aggrGlyphs.attr("activesize", (aggr) => aggr.measure("Active"));
    this.DOM.measure_Active
      .transition()
      .ease(d3.easeLinear)
      .duration(500)
      .attr(
        "r",
        this.usingFullSizeGlyph()
          ? (setPair) => this.setPairRadius + (setPair.subt ? -1 : 0)
          : (setPair) => this.getCliqueSizeRatio(setPair) * this.setPairRadius
      );
  }

  /** -- */
  refreshViz_Compare(cT: CompareType, curGroup, totalGroups, prevCts) {
    var strokeWidth = (aggr) => 0;
    var aggrValue = (aggr, sT) => aggr.ratioToActive(sT);
    var usingFullSizeGlyph = this.usingFullSizeGlyph();
    if (!this.browser.stackedCompare) {
      strokeWidth = (aggr) =>
        (this.setPairRadius / totalGroups) *
        (usingFullSizeGlyph ? 1 : this.getCliqueSizeRatio(aggr));
      prevCts = [];
    }

    if (this.browser.dependentBreakdown) {
      aggrValue = (aggr, sT) =>
        aggr[sT].measure /
        (this.browser.allRecordsAggr[cT].measure || 10000000000000);
    }

    this.DOM["measure_" + cT]
      .style("stroke-width", strokeWidth)
      .transition()
      .ease(d3.easeLinear)
      .duration(
        curGroup === totalGroups - 1 && this.browser.addedCompare ? 500 : 0
      )
      .attrTween("d", (aggr, i, nodes) => {
        var DOM = nodes[i];
        var offset = prevCts.reduce(
          (accum, sT) => accum + aggrValue(aggr, sT),
          0
        );
        var angleInterp = d3.interpolate(
          DOM._currentPreviewAngle,
          aggrValue(aggr, cT)
        );
        var r =
          this.setPairRadius *
            (usingFullSizeGlyph ? 1 : this.getCliqueSizeRatio(aggr)) -
          (this.browser.stackedCompare
            ? 0
            : (curGroup + 0.5) * strokeWidth(aggr)); // side-by-side radius adjust
        return (t) => {
          var newAngle = angleInterp(t);
          DOM._currentPreviewAngle = newAngle;
          return Util.getPieSVGPath(
            offset,
            newAngle,
            r,
            !this.browser.stackedCompare
          );
        };
      });
  }

  chartAxis_Measure_TickSkip(): number {
    throw new Error("Method not implemented.");
  }

  /** -- */
  updateAfterFilter(refreshViz: boolean): void {
    if (!this.isVisible()) return;
    this.updateMaxAggr_Active();
    this.refreshViz_All();
    this.refreshViz_NoValueAggr();

    this.DOM.setRows.style("opacity", (row) =>
      row.Active.measure > 0 ? 1 : 0.3
    );

    this.refreshSetPair_Containment();
  }

  /** Does not work with Avg pair */
  private refreshSetPair_Containment() {
    var numOfSubsets = 0;
    this.DOM.aggrGlyphs
      .each((setPair) => {
        var setPair_itemCount = setPair.Active.measure;
        var set_1_itemCount = setPair.set_1.Active.measure;
        var set_2_itemCount = setPair.set_2.Active.measure;
        if (
          setPair_itemCount === set_1_itemCount ||
          setPair_itemCount === set_2_itemCount
        ) {
          numOfSubsets++;
          setPair.subset =
            set_1_itemCount === set_2_itemCount ? "equal" : "proper";
        } else {
          setPair.subset = "";
        }
      })
      .classed("isSubset", (setPair) => setPair.subset !== "");

    this.DOM.subsetCount.style("display", numOfSubsets === 0 ? "none" : null);
    this.DOM.subsetCount_Text.text(numOfSubsets);

    this.refreshSetPair_Strength();
  }

  /** -- */
  onSetPairEnter(aggr: Aggregate_SetPair) {
    aggr.set_1.DOM.matrixRow?.setAttribute("selection", "selected");
    aggr.set_2.DOM.matrixRow?.setAttribute("selection", "selected");
    this.browser.setSelect_Compare(aggr);
  }

  /** -- */
  onSetPairLeave(aggr: Aggregate_SetPair) {
    aggr.set_1.DOM.matrixRow?.removeAttribute("selection");
    aggr.set_2.DOM.matrixRow?.removeAttribute("selection");
    this.browser.clearSelect_Compare();
    this.browser.refreshAllMeasureLabels("Active");
  }

  /** -- */
  private refreshSetPair_Strength() {
    var strengthColor = d3.interpolateHsl(
      d3.rgb(169, 181, 190),
      d3.rgb(232, 235, 238)
    );

    let _maxSimilarity = d3.max(this.setPairs, (aggr: Aggregate_SetPair) =>
      aggr.similarityScore()
    );

    this.DOM.setPairBackground
      .style("fill", (setPair: Aggregate_SetPair) =>
        strengthColor(setPair.similarityScore() / _maxSimilarity)
      )
      .each((setPair, i, nodes) => {
        var _DOM = nodes[i];
        // border
        if (setPair.subset === "") return;
        if (setPair.subset === "equal") {
          _DOM.style.strokeDasharray = "";
          _DOM.style.strokeDashoffset = "";
          return;
        }
        var halfCircle = (this.setPairRadius - 1) * Math.PI;
        _DOM.style.strokeDasharray = halfCircle + "px";
        // rotate halfway
        var i1 = setPair.set_1.orderIndex;
        var i2 = setPair.set_2.orderIndex;
        var c1 = setPair.set_1.Active.measure;
        var c2 = setPair.set_2.Active.measure;
        if ((i1 < i2 && c1 < c2) || (i1 > i2 && c1 > c2))
          halfCircle = halfCircle / 2;
        _DOM.style.strokeDashoffset = halfCircle + "px";
      });
  }

  /** -- */
  insertSetPairs() {
    var me = this;
    var newCliques = this.DOM.setMatrixSVG
      .select("g.setPairGroup")
      .selectAll("g.setPairGlyph")
      .data(this.setPairs, (_, i) => i)
      .enter()
      .append("g")
      .attr("class", "aggrGlyph setPairGlyph")
      .each((d: Aggregate_SetPair, i, nodes) => {
        d.setAggrGlyph(nodes[i]);
      })
      .tooltip((aggr: Aggregate_SetPair) => aggr.getTooltipHTML(), {
        theme: "dark kshf-tooltip kshf-record",
        placement: "right",
        animation: "fade",
        boundary: "window",
        trigger: "manual",
      })
      .on("mouseenter", (event, aggr: Aggregate_SetPair) => {
        if (me.browser.adjustMode) return;
        var DOM = event.currentTarget;
        if (DOM.highlightTimeout) window.clearTimeout(DOM.highlightTimeout);
        DOM.highlightTimeout = window.setTimeout(() => {
          DOM.tippy.show();
          this.onSetPairEnter(aggr);
        }, me.browser.movingMouseDelay);
      })
      .on("mouseleave", (event, aggr: Aggregate_SetPair) => {
        var DOM = event.currentTarget;
        if (DOM.highlightTimeout) window.clearTimeout(DOM.highlightTimeout);
        DOM.tippy.hide();
        this.onSetPairLeave(aggr);
      })
      .on("click", (_event, aggr: Aggregate_SetPair) => {
        this.setListSummary.filterCategory(aggr.set_1, "AND");
        this.setListSummary.filterCategory(aggr.set_2, "AND");
      });

    newCliques
      .append("rect")
      .attr("class", "setPairBackground")
      .attr("rx", 3)
      .attr("ry", 3);
    var measureGroup = newCliques.append("g").attr("class", "measureGroup");
    measureGroup
      .append("circle")
      .attr("class", "measure_Active")
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("r", 0);
    Base.Compare_List.forEach((cT) => {
      this.DOM["measure_" + cT] = measureGroup
        .append("path")
        .attr("class", "measure_" + cT)
        .each((_d, i, nodes) => {
          nodes[i]._currentPreviewAngle = 0;
        });
    });

    this.DOM.aggrGlyphs = this.DOM.setPairGroup.selectAll(".setPairGlyph");
    this.DOM.setPairBackground =
      this.DOM.aggrGlyphs.selectAll(".setPairBackground");
    ["Active"].concat(Base.Compare_List).forEach((t) => {
      this.DOM["measure_" + t] = this.DOM.aggrGlyphs.selectAll(".measure_" + t);
    });
  }

  /** Axis is shown as a separate legend for set summaries */
  refreshViz_Axis() {
    this.refreshSetPair_Strength();

    if (this.usingFullSizeGlyph()) {
      this.DOM.scaleLegend_SVG.style("dislay", "none");
      return;
    }
    this.DOM.scaleLegend_SVG.style("display", "block");

    this.DOM.scaleLegend_SVG
      .attr("width", this.setPairDiameter + 50)
      .attr("height", this.setPairDiameter + 10)
      .attr(
        "viewBox",
        "0 0 " + (this.setPairDiameter + 35) + " " + (this.setPairDiameter + 10)
      );

    this.DOM.legend_Group.attr(
      "transform",
      `translate(${this.setPairRadius},${this.setPairRadius + 18})`
    );
    this.DOM.legendHeader.attr(
      "transform",
      `translate(${this.setPairDiameter + 3},6)`
    );

    var maxVal = this._maxSetPairAggr_Active;

    var tickValues = [maxVal];
    if (this.setPairRadius > 8) tickValues.push(Math.round(maxVal / 4));

    this.DOM.legend_Group.selectAll("g.legendMark").remove();

    var tickDoms = this.DOM.legend_Group
      .selectAll("g.legendMark")
      .data(tickValues, (i) => i);

    this.DOM.legendCircleMarks = tickDoms
      .enter()
      .append("g")
      .attr("class", "legendMark");

    this.DOM.legendCircleMarks
      .append("circle")
      .attr("class", "legendCircle")
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("r", (d) => this.setPairRadius * Math.sqrt(d / maxVal));
    this.DOM.legendCircleMarks
      .append("line")
      .attr("class", "legendLine")
      .each((d, i, nodes) => {
        var rx = this.setPairRadius + 3;
        var ry = this.setPairRadius * Math.sqrt(d / maxVal);
        var x2, y1;
        switch (i % 4) {
          case 0:
            x2 = rx;
            y1 = -ry;
            break;
          case 1:
            x2 = rx; // -rx;
            y1 = ry; // -ry;
            break;
          case 2:
            x2 = rx;
            y1 = ry;
            break;
          case 3:
            x2 = -rx;
            y1 = ry;
            break;
        }
        nodes[i].setAttribute("x1", 0);
        nodes[i].setAttribute("x2", x2);
        nodes[i].setAttribute("y1", y1);
        nodes[i].setAttribute("y2", y1);
      });
    this.DOM.legendText = this.DOM.legendCircleMarks
      .append("text")
      .attr("class", "legendLabel");

    this.DOM.legendText.each((d, i, nodes) => {
      var rx = this.setPairRadius + 3;
      var ry = this.setPairRadius * Math.sqrt(d / maxVal);
      var x2, y1;
      switch (i % 4) {
        case 0:
          x2 = rx;
          y1 = -ry;
          break;
        case 1:
          x2 = rx; // -rx;
          y1 = ry; // -ry;
          break;
        case 2:
          x2 = rx;
          y1 = ry;
          break;
        case 3:
          x2 = -rx;
          y1 = ry;
          break;
      }
      nodes[i].setAttribute("transform", `translate(${x2},${y1})`);
      nodes[i].style.textAnchor = i % 2 === 0 || true ? "start" : "end";
    });

    this.DOM.legendText.text((d) => {
      return d3.format("0.1s")(d);
    });
  }

  /** -- */
  refreshWindowSize() {
    var w = this.getWidth();
    var h = this.getHeight();
    this.DOM.wrapper.style(
      "height",
      this.setListSummary.block.getHeight() -
        this.setListSummary.block.height_Header +
        "px"
    );
    this.DOM.setMatrixBackground
      .attr("x", -w * 24)
      .attr("y", -h * 24)
      .attr("width", w * 50)
      .attr("height", h * 50);
    this.DOM.root
      .style(this.popupSide, -w + "px")
      .style("width", w + "px")
      .style(this.popupSide === "left" ? "right" : "left", "initial");

    if (!this.pausePanning) {
      this.refreshSVGViewBox();
    }
  }

  /** -- */
  public refreshPopupSide() {
    this.DOM.root.attr("data-popupSide", this.popupSide);
    this.refreshRow();
    this.refreshSetPair_Position();
    this.refreshSVGViewBox();
  }

  /** -- */
  public refreshSVGViewBox() {
    var w = this.getWidth();
    var h = this.getHeight();
    var t = this.setListSummary.block.scrollTop_cache;
    var r =
      Math.max(t + this.gridPan_x, 0) * (this.popupSide === "left" ? -1 : 1);
    this.DOM.setMatrixSVG
      .attr("width", w)
      .attr("height", h)
      .attr("viewBox", r + " " + t + " " + w + " " + h);
    this.refreshLabel_Vert_Show();
  }

  /** -- */
  private refreshSetPair_Background() {
    this.DOM.setPairBackground
      .attr("x", -this.setPairRadius)
      .attr("y", -this.setPairRadius)
      .attr("width", this.setPairDiameter)
      .attr("height", this.setPairDiameter);
  }

  /** -- */
  refreshLabel_Vert_Show() {
    var totalWidth = this.getWidth();
    var totalHeight = this.getHeight();
    var t = this.setListSummary.block.scrollTop_cache;
    this.DOM.line_vert_label // points up/right
      .attr("show", (d) => !d.isVisible)
      .attr("transform", (d) => {
        var i = d.orderIndex;

        var x = totalWidth - (i + 0.5) * this.rowHeight - 2;
        if (this.popupSide === "right") x = totalWidth - x - 4;

        var y =
          (this.setListSummary.block.catCount_Active - i - 1) * this.rowHeight -
          this.setListSummary.block.height_VisibleAttrib +
          this.setListSummary.block.scrollTop_cache +
          totalHeight;
        return `translate(${x} ${y}) rotate(-90)`;
      });
  }

  /** -- */
  refreshRow() {
    this.refreshWindowSize();
    this.DOM.setRows.attr(
      "transform",
      (row) => `translate(0,${(row.orderIndex + 0.5) * this.rowHeight})`
    );
    this.refreshRow_LineWidths();
  }

  /** -- */
  refreshSetPair_Position() {
    var w = this.getWidth();
    this.DOM.aggrGlyphs.style("transform", (setPair) => {
      var i1 = setPair.set_1.orderIndex;
      var i2 = setPair.set_2.orderIndex;
      var left = (Math.min(i1, i2) + 0.5) * this.rowHeight;
      if (this.popupSide === "left") left = w - left;
      var top = (Math.max(i1, i2) + 0.5) * this.rowHeight;
      return `translate(${left}px,${top}px)`;
    });
  }

  /** -- */
  private refreshRow_LineWidths() {
    var setPairDiameter = this.setListSummary.barHeight.get();
    var totalWidth = this.getWidth();

    // vertical lines
    this.DOM.line_vert.each((d, i, nodes) => {
      var _DOM = nodes[i];
      var i = d.orderIndex;
      var height =
        (this.setListSummary.block.catCount_Active - i - 1) * setPairDiameter;
      var right = (i + 0.5) * setPairDiameter;
      var m = this.popupSide === "left" ? totalWidth - right : right;
      _DOM.setAttribute("x1", m);
      _DOM.setAttribute("x2", m);
      _DOM.setAttribute("y2", height);
    });

    // horizontal lines
    this.DOM.line_horz
      .attr("x2", this.popupSide === "left" ? totalWidth : 0)
      .attr("x1", (d) => {
        var m = (d.orderIndex + 0.5) * setPairDiameter;
        return this.popupSide === "left" ? totalWidth - m : m;
      });
    this.DOM.line_horz_label.attr("transform", (d) => {
      var m = (d.orderIndex + 0.5) * setPairDiameter + 2;
      if (this.popupSide === "left") m = totalWidth - m;
      return `translate(${m} 0)`;
    });
  }
}
