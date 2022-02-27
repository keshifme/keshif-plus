import { extent } from "d3-array";
import { Attrib_Numeric } from "./Attrib_Numeric";

const d3 = { extent };

export type TimeKey = {
  _time: Date;
  _time_src: string;
  _histogram?: Attrib_Numeric;
  _index?: number;
};

export type TimeData = {
  // Date representation of date
  _time: Date;
  // String representation of date
  _time_src: string;
  // Observed value in that time
  _value: number;
  // Ranking of the value within that time (dynamic)
  _rank?: number;
  // The graphical representation / Used by timeseries view (dot)
  DOM?: Element;
};

export class TimeSeriesData {
  // timedata indexed by string representations of date
  _keyIndex: { [index: string]: TimeData } = {};
  // a (sorted) list of timedata
  _timeseries_: TimeData[] = [];
  // Range of date (cache)
  extent_Time?: [Date, Date] = null;
  // Range of values - may be adjusted to show different analytics
  extent_Value?: [number, number] = null;
  // Range of values - based on raw values, not dynamic
  extent_Value_raw?: [number, number] = null;

  addTimeData(t: TimeData) {
    this._keyIndex[t._time_src] = t;
    this._timeseries_.push(t);
  }

  isEmpty() {
    return this._timeseries_.length === 0;
  }

  hasTimeData() {
    return this._timeseries_.length > 0;
  }

  computeCaches() {
    this.extent_Time = d3.extent(this._timeseries_, (k) => k._time);
    this.extent_Value = d3.extent(this._timeseries_, (k) => k._value);
    this.extent_Value_raw = [...this.extent_Value];
  }

  sortTimeseries() {
    this._timeseries_.sort(
      (a: TimeData, b: TimeData) => a._time.getTime() - b._time.getTime()
    );
  }
}
