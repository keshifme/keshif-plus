import { Aggregate_Category } from "./Aggregate_Category";
import { Attrib_Categorical } from "./Attrib_Categorical";
import { Browser } from "./Browser";
import { Filter } from "./Filter";

import { Filter_Categorical_Spec } from "./Types";
import { Record } from "./Record";
import { i18n } from "./i18n";

export class Filter_Categorical extends Filter {
  public readonly attrib: Attrib_Categorical;

  public selected_AND: Aggregate_Category[] = [];
  public selected_OR: Aggregate_Category[] = [];
  public selected_NOT: Aggregate_Category[] = [];

  constructor(_browser: Browser, attrib: Attrib_Categorical) {
    super(_browser);
    this.attrib = attrib;
  }

  get title(): string {
    return this.attrib.attribName;
  }

  selectedCount_Total(): number {
    return (
      this.selected_AND.length +
      this.selected_OR.length +
      this.selected_NOT.length
    );
  }
  selected_Any(): boolean {
    return (
      this.selected_AND.length > 0 ||
      this.selected_OR.length > 0 ||
      this.selected_NOT.length > 0
    );
  }
  selected_None(): boolean {
    return (
      this.selected_AND.length === 0 &&
      this.selected_OR.length === 0 &&
      this.selected_NOT.length === 0
    );
  }
  selected_AndOrNot(): Aggregate_Category[] {
    return this.selected_AND.concat(this.selected_OR).concat(this.selected_NOT);
  }

  selected_All_clear(): void {
    this.selected_AND = [];
    this.selected_OR = [];
    this.selected_NOT = [];
  }

  private setRecordCache(record: Record, v: boolean): void {
    record.setFilterCache(this.filterID, v);
  }

  onFilter(): void {
    var noValueOut = this.noValueAggr.filtered === "out";
    var noValueIn = this.noValueAggr.filtered === "in";

    this.attrib.records.forEach((record) => {
      // Note: Using direct access here.
      // This prevents applying the look-up table overwrite in this class
      var recordVal_s = record.getValue(this.attrib);

      if (noValueIn) {
        return this.setRecordCache(record, recordVal_s == null);
      }

      if (recordVal_s == null) {
        if (noValueOut) {
          return this.setRecordCache(record, false);
        }
        // survives if AND and OR is not selected
        this.setRecordCache(
          record,
          this.selected_AND.length === 0 && this.selected_OR.length === 0
        );
        return;
      }

      var getAggr = (v) => this.attrib.catTable_id[v];

      // If any of the record values are selected with NOT, the record will be removed
      if (this.selected_NOT.length > 0) {
        if (!recordVal_s.every((v) => !getAggr(v).filtered_NOT())) {
          return this.setRecordCache(record, false);
        }
      }

      // All AND selections must be among the record values
      if (this.selected_AND.length > 0) {
        var t = 0; // Compute the number of record values selected with AND.
        recordVal_s.forEach((v) => {
          if (getAggr(v).filtered_AND()) t++;
        });
        if (t !== this.selected_AND.length) {
          return this.setRecordCache(record, false);
        }
      }

      // One of the OR selections must be among the record values
      if (this.selected_OR.length > 0) {
        return this.setRecordCache(
          record,
          recordVal_s.some((v) => getAggr(v).filtered_OR())
        );
      }

      // only NOT selection
      record.setFilterCache(this.filterID, true);
    });

    super.onFilter();
  }

  filterView_Detail() {
    if (this.noValueAggr.filtered === "in") return i18n.NoData;

    // 'this' is the Filter
    // go over all records and prepare the list
    var text = "";

    if (this.noValueAggr.filtered === "out")
      text = `(${i18n.ValidData})`;

    var queryStr = (_type) =>
      ` <span class='AndOrNot AndOrNot_${_type}'>"${i18n[_type]}</span> `;

    if (this.selectedCount_Total() > 4) {
      text = `<b>${this.selectedCount_Total()}</b> selected`;
    } else {
      var selectedItemsCount = 0;

      // OR selections
      if (this.selected_OR.length > 0) {
        var useBracket_or =
          this.selected_AND.length > 0 || this.selected_NOT.length > 0;
        if (useBracket_or) text += "[";
        // X or Y or ....
        this.selected_OR.forEach((_cat, i) => {
          text +=
            (i !== 0 || selectedItemsCount > 0 ? queryStr("Or") : "") +
            `<span class='optionName'>${_cat.label}</span>`;
          selectedItemsCount++;
        });
        if (useBracket_or) text += "]";
      }
      // AND selections
      this.selected_AND.forEach((_cat) => {
        text +=
          (text !== "" ? queryStr("And") : "") +
          `<span class='optionName'>${_cat.label}</span>`;
        selectedItemsCount++;
      });
      // NOT selections
      this.selected_NOT.forEach((_cat) => {
        text += `${queryStr("Not")}<span class='optionName'>${
          _cat.label
        }</span>`;
        selectedItemsCount++;
      });
    }
    return text;
  }

  exportFilter(): Filter_Categorical_Spec {
    var _: Filter_Categorical_Spec = {};
    if (this.noValueAggr.filtered) {
      _.missing = this.noValueAggr.filtered;
    } else {
      ["AND", "OR", "NOT"].forEach((logic) => {
        var selected_x = this["selected_" + logic];
        if (selected_x.length > 0) {
          _[logic] = [];
          selected_x.forEach((_cat) => {
            _[logic].push(_cat.label);
          });
        }
      });
    }
    return _;
  }

  importFilter(_: Filter_Categorical_Spec) {
    if (_.missing) {
      this.noValueAggr.filtered = _.missing;
      this.setFiltered(false);
    } else {
      this.selected_All_clear();

      ["AND", "OR", "NOT"].forEach((_type: "AND" | "OR" | "NOT") => {
        if (!_[_type]) return;
        // find category, and add filter
        let ar: string[] = _[_type];
        ar.forEach((catStr: string) => {
          var aggr = this.attrib.catTable_id[catStr];
          if(aggr){ 
            this.attrib.filterCategory(aggr, _type, "All", false/** skip update */);
          }
        });
      });
    }
    if (this.isFiltered) {
      this.applyFilter();
    }
  }
}
