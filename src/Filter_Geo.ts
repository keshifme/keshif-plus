import { Attrib_RecordGeo } from "./Attrib_RecordGeo";
import { Browser } from "./Browser";
import { Filter } from "./Filter";
import { i18n } from "./i18n";
import { Util } from "./Util";

export class Filter_Spatial extends Filter {
  public readonly attrib: Attrib_RecordGeo;

  bounds: any; // TODO

  constructor(_browser: Browser, attrib: Attrib_RecordGeo) {
    super(_browser);
    this.bounds = null;
  }
  get title() {
    return i18n["Spatial"];
  }
  exportFilter() {
    return {
      bounds: this.bounds,
    };
  }
  importFilter(_) {
    this.bounds = _;
    this.setFiltered(false); // no update...
    this.applyFilter();
  }
  onClear() {
    this.browser.recordDisplay.DOM.recordBase_Map
      .select(".spatialQueryBox_Filter")
      .classed("active", null);
  }
  filterView_Detail() {
    return "<i class='fa fa-square-o'></i> (Area)";
  }
  onFilter(): void {
    this.browser.recordDisplay.DOM.recordBase_Map
      .select(".spatialQueryBox_Filter")
      .classed("active", true);

    this.browser.records.forEach((record) => {
      var rBounds = this.attrib.getRecordValue(record)._bounds;
      record.setFilterCache(
        this.filterID,
        rBounds ? Util.intersects(rBounds, this.bounds) : false
      );
    }, this);
  }
}

