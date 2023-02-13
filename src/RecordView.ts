import { easePoly } from "d3-ease";
import { select } from "./d3_select";

import { Attrib } from "./Attrib";
import { Base } from "./Base";
import { Browser } from "./Browser";
import { CompareType, RecordVisCoding } from "./Types";
import { i18n } from "./i18n";
import { RecordDisplay } from "./RecordDisplay";
import { Util } from "./Util";
import { Record } from "./Record";
import { Attrib_Numeric } from "./Attrib_Numeric";

const d3 = {
  select,
  easePoly,
};

export abstract class RecordView {
  /** For direct access to main record display */
  readonly rd: RecordDisplay;

  get browser(): Browser {
    return this.rd.browser;
  }

  get textAttrib() {
    return this.rd.codeBy.text;
  }
  get textBriefAttrib() {
    return this.rd.codeBy.textBrief || this.rd.codeBy.text;
  }
  get sortAttrib() {
    return this.rd.codeBy.sort;
  }
  get scatterXAttrib() {
    return this.rd.codeBy.scatterX;
  }
  get scatterYAttrib() {
    return this.rd.codeBy.scatterY;
  }
  get colorAttrib() {
    return this.rd.codeBy.color;
  }
  get sizeAttrib() {
    return this.rd.codeBy.size;
  }
  get geoAttrib() {
    return this.rd.codeBy.geo;
  }

  get DOM() {
    return this.rd.DOM;
  }

  initialized: boolean = false;

  constructor(rd: RecordDisplay) {
    this.rd = rd;
  }

  abstract updateAfterFilter(how): void;
  abstract prepareAttribs(): Promise<boolean>;

  abstract initView_DOM(): void;
  abstract initView(): void;

  // Signals that one of the vis codings have been updated
  abstract finishSetAttrib(t: RecordVisCoding);

  abstract refreshRecordVis(): void;
  abstract extendRecordDOM(newRecords): void;

  /** Called when the UI/window size is updated  */
  abstract refreshViewSize(delayMS: number): void;

  /** Called when the given attribute has unit name updated */
  abstract refreshAttribUnitName(attrib: Attrib);

  refreshRecordSizes(): void {}
  refreshRecordColors(): void {}
  refreshLabelOverlaps(): void {}

  async refreshAttribScaleType(attrib: Attrib) {}
  onRecordMouseOver(record: Record) {}
  onRecordMouseLeave(record: Record) {}

  // can be extended in sub-classes
  refreshQueryBox_Filter(bounds) {}

  zoomIn() {}
  zoomOut() {}
  zoomToFit() {}

  // can be extended by subclasses
  updateRecordVisibility() {}

  getRecordsForDOM() {
    return this.browser.records;
  }

  isComparable() {
    // Scatterplot and Map views can share the same code here!
    if (this.browser.activeComparisonsCount === 0) return false;
    if (!this.browser.comparedAttrib) return false;
    if (!this.DOM.kshfRecords) return false;
    if (
      this.rd.viewRecAs === "map" &&
      this.rd.codeBy.geo?.geoType !== "Point"
    ) {
      return false;
    }
    return true;
  }

  animStepDelayMs: number = 1000;

  stepTimeAnimation(stepSize: number): boolean {
    if (this.rd.currentTimeKey.get() == null) return false;

    // Iterates over potential time-series keys.
    // When it finds one,starts animation, and returns (executed only for one coding)
    ["sort", "scatter", "color", "size"].some((v) => {
      var attrib = this.rd.codeBy[v];
      if (!attrib) return false;
      if (!(attrib instanceof Attrib_Numeric)) return false;
      if (!attrib.hasTimeSeriesParent()) return false;

      var tsParent = attrib.timeseriesParent;

      this.rd.timeseriesAnimInterval = window.setInterval(() => {
        let a = tsParent.getTimepointSummary_Next(attrib, stepSize);
        if (attrib === null) {
          this.rd.stopTimeseriesAnimation();
        } else {
          this.rd.currentTimeKey.set(attrib.timeKey);
          attrib = a;
        }
      }, this.animStepDelayMs);

      return true;
    });
  }
  // no-op by default
  stopTimeAnimation() {}

  /** -- */
  refreshSelect_Compare(cT: CompareType = null, status: boolean = false) {
    if (!this.isComparable()) return;

    if (!this.rd.recordDrawArc) return;

    var targetRecords = (record: Record) => {
      if (!record.isIncluded) return false;
      if (!record.DOM.record) return false;
      if (cT && record.isSelected(cT) !== status) return false;
      if (this.rd.viewRecAs === "map") {
        if (!this.rd.codeBy.geo.getRecordValue(record)) return false;
      }
      return true;
    };

    let _do = (d, cT, arcGen) => {
      d.select(".glyph_" + cT)
        .transition()
        .ease(d3.easePoly.exponent(3))
        .duration(700)
        .attr("d", arcGen);
    };

    if (!this.browser.isComparedSummaryMultiValued()) {
      // renders as point
      this.DOM.kshfRecords.each((record: Record) => {
        if (!targetRecords(record)) return;
        var d = d3.select(record.DOM.record);
        record.activeComparisons.forEach((cT) =>
          _do(d, cT, (record) => this.rd.recordDrawArc(record)())
        );
      });
      //
    } else {
      // renders as pies
      this.DOM.kshfRecords.each((record: Record) => {
        if (!targetRecords(record)) return;
        var numPies = record.activeComparisons.length;
        if (numPies === 0) return;

        var arcGen = this.rd.recordDrawArc(record);
        var arcLen = (2 * Math.PI) / numPies;

        var d = d3.select(record.DOM.record);
        record.activeComparisons.forEach((cT, i) => {
          arcGen.startAngle(arcLen * i).endAngle(arcLen * (i + 1));
          _do(d, cT, arcGen());
        });
      });
    }

    this.rd.refreshCompareLegend();
  }

  // Utility/ helper
  protected extendRecordDOM_Point(newRecords) {
    newRecords.classed("pointGeo", true);

    ["Main"]
      .concat(Base.Compare_List)
      .forEach((cT) => newRecords.append("path").attr("class", "glyph_" + cT));
    newRecords.append("text").attr("class", "sizeValueText");

    // initializes to tiny circles
    newRecords.selectAll("path").attr("d", Util.getCirclePath());
  }

  /** -- */
  insertQueryBoxes(parent, setSizeCb, dragCb, clearCb) {
    var queryBoxes = parent
      .selectAll(".spatialQueryBox")
      .data(["Filter"].concat(Base.Compare_List))
      .enter()
      .append("div")
      .attr(
        "class",
        (d) => `spatialQueryBox spatialQueryBox_${d} leaflet-zoom-hide`
      );

    queryBoxes
      .selectAll(".setSize")
      .data(["l", "r", "t", "b"])
      .enter()
      .append("div")
      .attr("class", (k) => "setSize-" + k)
      .on("mousedown", setSizeCb);

    queryBoxes
      .append("div")
      .attr("class", "dragSelection fa fa-arrows")
      .tooltip("Drag")
      .on("mousedown", dragCb);

    queryBoxes
      .append("div")
      .attr("class", "clearFilterButton fa")
      .tooltip((_) => i18n[_ === "Filter" ? "RemoveFilter" : "Unlock"])
      .on("mouseup", (event) => {
        event.stopPropagation();
        event.preventDefault();
      })
      .on("mousedown", (event) => {
        event.stopPropagation();
        event.preventDefault();
      })
      .on("click", clearCb);
  }
}
