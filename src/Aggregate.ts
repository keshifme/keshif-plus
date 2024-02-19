import DOMPurify from "dompurify";

import { Record } from "./Record";
import { Base } from "./Base";
import { i18n } from "./i18n";

import { CompareType, MeasureType } from "./Types";
import { Attrib } from "./Attrib";

type AggrMeasure = {
  recCnt: number;
  measure: number;
  // used for visualization
  scale?: number;
  offset?: number;
};

/** -- */
export class Aggregate {
  // Records which are mapped to this aggregate
  public records: Record[] = [];

  // the attribute which this aggregate is attached to
  // may not be attached to an attribute
  public readonly attrib?: Attrib;

  /** -- */
  constructor(attrib: Attrib) {
    this.attrib = attrib;
    this.resetAggregateMeasures();
  }

  /** -- */
  get label(): string {
    return "";
  }

  // ********************************************************************
  // Selection (comparison) status
  // ********************************************************************

  // comparison status of the aggregate (comparisons may not be locked (highlighted))
  private _compared?: CompareType;
  get compared() {
    return this._compared;
  }

  // locked selection status: true if compared and locked (not highlighting)
  protected _locked: boolean = false;
  get locked(): boolean {
    return this._locked;
  }

  private Active: AggrMeasure;
  private Total: AggrMeasure;
  private Compare_A: AggrMeasure;
  private Compare_B: AggrMeasure;
  private Compare_C: AggrMeasure;
  private Compare_D: AggrMeasure;
  private Compare_E: AggrMeasure;
  private Other: AggrMeasure; // non-compared

  // ********************************************************************
  // Visual status
  // ********************************************************************

  public isVisible: boolean;
  public isVisibleBefore: boolean;

  // Set false to signal that this aggregate should not be rendered
  public usedAggr: boolean = true;

  // DOM elements
  public DOM: {
    aggrGlyph?: Element;
  } = { aggrGlyph: undefined };

  /** -- */
  setAggrGlyph(v: Element) {
    this.DOM.aggrGlyph = v;
  }

  // ********************************************************************
  // Access to key data
  // ********************************************************************

  measure(m: MeasureType): number {
    if (Base.browser.measureFunc.is("Avg")) {
      var r = this[m].recCnt;
      return r === 0 ? 0 : this[m].measure / r; // avoids division by zero
    }
    return this[m].measure;
  }
  recCnt(m: MeasureType): number {
    return this[m].recCnt;
  }
  scale(m: MeasureType): number {
    return this[m].scale;
  }
  offset(m: MeasureType): number {
    return this[m].offset;
  }

  ratioToActive(t: MeasureType) {
    return this.Active.measure ? this[t].measure / this.Active.measure : 0;
  }

  sumOffsetScale(m: MeasureType): number {
    return this[m].offset + this[m].scale;
  }

  setOffset(m: MeasureType, v: number): void {
    this[m].offset = v;
  }
  setScale(m: MeasureType, v: number): void {
    this[m].scale = v;
  }

  // ********************************************************************
  // Add/remove records and update data
  // ********************************************************************

  /** Adds the given record to the aggregate */
  addRecord(record) {
    this.records.push(record);
    record._aggrCache.push(this);
    this._processRecord(record);
  }

  /** Internal method to update (insert) measure/record count caches with data from the given record */
  private _processRecord(record: Record) {
    if (record.measure_Self == null) return;
    ["Total"]
      .concat(
        record.filteredOut
          ? []
          : ["Active"].concat(
              Base.Compare_List.filter((cT) => record.isSelected(cT))
            )
      )
      .forEach((cT) => {
        this[cT].measure += record.measure_Self;
        this[cT].recCnt++;
      });
  }

  /** -- */
  clearRecords() {
    this.records.forEach((record) => {
      record.removeAggrFromCache(this);
    });
    this.records = [];
    this.resetAggregateMeasures();
  }

  /** -- */
  removeRecord(record: Record) {
    this.records.splice(this.records.indexOf(record), 1);
    record.removeAggrFromCache(this);
    if (record.measure_Self == null) return;
    ["Total"]
      .concat(record.filteredOut ? [] : ["Active"])
      .concat(Base.Compare_List.filter((cT) => record.isSelected(cT)))
      .forEach((cT) => {
        this[cT].measure -= record.measure_Self;
        this[cT].recCnt--;
      });
  }

  /** -- */
  resetMeasure(t: MeasureType) {
    this[t] = { measure: 0, recCnt: 0 };
  }
  resetAggregateMeasures() {
    Base.Total_Active_Compare_List.forEach((cT) => this.resetMeasure(cT));
    this.records.forEach((record) => this._processRecord(record));
  }

  addToActive(measureToAdd: number, cntToAdd: number) {
    this.Active.measure += measureToAdd;
    this.Active.recCnt += cntToAdd;
  }

  // ********************************************************************
  // Select / unselect
  // ********************************************************************

  /** -- */
  unselectAggregate() {
    if (this._locked) return;
    this.DOM.aggrGlyph?.classList.remove("showLock");
  }

  /** -- */
  selectCompare(cT) {
    this._compared = cT;

    this.records.forEach((record) => record.setCompared(cT));

    this.DOM.aggrGlyph?.classList.add("showLock");
    this.DOM.aggrGlyph?.classList.add(this._compared);
  }

  /** -- */
  clearCompare(cT) {
    this.DOM.aggrGlyph?.classList.remove("showLock");
    this.DOM.aggrGlyph?.classList.remove(this._compared);

    if (this._locked) {
      this.unlockSelection();
    }
    this._compared = null;
    this.records.forEach((record) => record.unsetCompared(cT));
  }

  /** -- */
  lockSelection() {
    this._locked = true;
    this.DOM.aggrGlyph?.classList.add("locked");
  }
  /** -- */
  unlockSelection() {
    this._locked = false;
    this.DOM.aggrGlyph?.classList.remove("locked");
  }

  // no info by default
  exportAggregateInfo() {
    return null;
  }

  // ********************************************************************
  // Tooltip
  // ********************************************************************

  /** -- */
  get tooltipTitle(): string {
    return "";
  }
  protected get tooltipSkip1(): boolean {
    return false;
  }

  private printCompared(cT: CompareType | "Other", details: string) {
    return (
      `<tr>` +
      `<td class='measureDetail'>${details}</td>` +
      `<td><span class='colorBox bg_${cT}'></span></td> ` +
      `<td class='measureValue'>${Base.browser.getMeasureFormattedValue(
        this.measure(cT).toLocaleString()
      )}</td>` +
      (Base.browser.absoluteBreakdown
        ? ""
        : `<td class='percentValue'>(${Base.browser.getValueLabel(
            Base.browser.getChartValue(this, cT)
          )})</td>`) +
      `</tr>`
    );
  }

  /** Returns the html content of the tooltip as a string */
  getTooltipHTML(): string {
    var str = "";
    var browser = Base.browser;

    var newLine = true;

    str += `<div class='tooltipSummaryName'>${this.tooltipTitle}</div>`;

    if (this.label) {
      str += `<span class='mapItemName ${
        this._compared ? "bg_" + this._compared : ""
      }'>${this.label}</span>`;
    }

    str += "<div class='aggrTooltip'>";

    str += "<div class='aggrRecordCount'>";

    if (browser.measureFunc.is("Sum")) {
      newLine = false;
      str +=
        browser.getValueLabel(
          browser.getMeasureValue(this, "Active", "absolute"),
          false,
          1,
          false
        ) +
        " " +
        i18n.measureText(browser);
      str += `<span class='percentBlock percentage_metricSumOutOf'> (${i18n.TooltipOne(
        browser.getMeasureValue(this, "Active", "dependent"),
        browser
      )}) </span>`;
      str += `<div style='font-size: 0.8em;' class='tooltipAmong'>among</div>`;
    }

    str += `<span class="recordNumberInfo">${this.recCnt(
      "Active"
    ).toLocaleString()} ${browser.recordName}`;

    // show the %-of value if there are active records inside
    if (
      this.recCnt("Active") > 0 &&
      (this.recCnt("Active") != browser.allRecordsAggr.recCnt("Active") ||
        this.tooltipSkip1)
    ) {
      str += `${newLine ? "<br>" : ""}
          <span class='percentBlock percentage_recordOutOf'> 
          (${i18n.TooltipOne(
            (100 * this.recCnt("Active")) /
              browser.allRecordsAggr.recCnt("Active"),
            browser
          )})
        </span>`;
    }

    str += `</span>`; // recordNumberInfo

    str += `</div>`; // aggrRecordCount

    if (
      browser.isCompared() &&
      this.attrib &&
      this.recCnt("Active") > 0 &&
      (!this.attrib.isComparedAttrib() ||
        (this.attrib.isMultiValued && browser.activeComparisonsCount > 1))
    ) {
      str += `<div class='tooltipBreakdownHeader'> 
            <span class='BreakdownText'>${i18n.BreakdownBy}</span>
            ${browser.comparedAttrib.attribNameHTML}
          </div>`;

      this.Other = {
        measure: this.measure("Active"),
        recCnt: this.recCnt("Active"),
      };

      browser.activeComparisons.forEach((cT) => {
        this.Other.measure -= this.measure(cT);
        this.Other.recCnt -= this.recCnt(cT);
      });

      str += "<table class='tooltipBreakdownTable'>";

      // sort active comparisons from large to small measure value
      var _ = browser.activeComparisons
        .slice()
        .sort((a, b) => this[b].measure - this[a].measure);

      // render each compared label and its value
      _.forEach((cT: CompareType) => {
        var comparedLabel = browser.selectedAggrs[cT].label;
        if (
          this.attrib?.attribID === browser.comparedAttrib.attribID &&
          comparedLabel === this.label
        ) {
          // same summary, and same category
          return;
        }
        str += this.printCompared(cT, comparedLabel);
      });

      let c = browser.comparedAttrib;
      if (
        this.Other.measure &&
        !c.isMultiValued &&
        this.attrib.browser.breakdownMode.get() !== "dependent"
      ) {
        str += this.printCompared("Other", `(${browser.otherNameInCompare})`);
      }

      str += "</table>";

      str += i18n.Tooltip_OutOf(this.label, browser);
    }

    str += "</div>"; // aggrTooltip

    return DOMPurify.sanitize(str);
  }
}
