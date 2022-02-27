import { Attrib_Interval } from "./Attrib_Interval";
import { Aggregate } from "./Aggregate";
import { IntervalT } from "./Types";

/** -- */
export abstract class Aggregate_Interval<T extends IntervalT> extends Aggregate {
  readonly attrib: Attrib_Interval<T>;

  public _minV: T = null;
  get minV(){
    return this._minV;
  }

  public _maxV: T = null;
  get maxV(){
    return this._maxV;
  }

  get tooltipTitle(): string {
    return this.attrib.attribNameHTML;
  }

  validateMinMax() {
    if (this.minV <= this.maxV) return;
    let _temp = this.minV;
    this._minV = this.maxV;
    this._maxV = _temp;
  }

  isMinLarger(){
    return this.minV > this.attrib.rangeOrg[0];
  }
  isMaxSmaller(){
    return this.maxV < this.attrib.rangeOrg[1];
  }

  updateRecords(){
    this.records = this.attrib.sortedRecords.filter((record) =>
      this.isRecordWithin(record)
    );
  }

  // true if the maximum value is included within the scale
  isMaxIncluded: boolean = false;

  // _spacer is needed to detect intersecting labels and prevent overlaps
  // used by Block_Interval
  public _spacer?: any;

  constructor(attrib: Attrib_Interval<T>, minV: T, maxV: T) {
    super(attrib);
    this.setRange(minV, maxV);
  }

  setRange(_minV: T, _maxV: T) {
    this._minV = _minV;
    this._maxV = _maxV;
  }

  isRecordWithin(record) {
    let v = this.attrib.getRecordValue(record);
    if(v < this.minV ) return false;
    if(v > this.maxV ) return false;
    if( v=== this.maxV) return this.isMaxIncluded;
    return true;
  }

  /** -- */
  exportAggregateInfo() {
    return {
      min: this.minV,
      max: this.maxV,
    };
  }
}

export class Aggregate_Interval_Numeric extends Aggregate_Interval<number> {
  hasFloat: boolean = true;

  get label(): string {
    if (this.minV == null || this.maxV == null) return "-";

    if(this.maxV === this.minV + 1 && !this.hasFloat){
      return this.attrib.getFormattedValue(this.minV, false);
    }

    var minStr = this.attrib.getFormattedValue(this.minV, false);
    var maxStr = this.attrib.getFormattedValue(this.maxV, false);

    if (this.isMinLarger() && this.isMaxSmaller()) {
      if(this.isMaxIncluded){
        return `${minStr} &mdash; ${maxStr}`;
      } else {
        return `${minStr} up to ${maxStr}`;
      }
    } else if (this.isMinLarger()) {
      return `Min ${minStr}`;
    } else {
      if(this.isMaxIncluded){
        return `Max ${maxStr}`;
      } else {
        return `Up to ${maxStr}`;
      }
    }
  }

  validateMinMax() {
    super.validateMinMax();

    // must be integers
    if (!this.hasFloat) {
      this._minV = Math.floor(this.minV);
      this._maxV = Math.ceil(this.maxV);
    }

    this._minV = Math.max(this.minV, this.attrib.rangeOrg[0]);
    this._maxV = Math.min(this.maxV, this.attrib.rangeOrg[1]);
  }
}
