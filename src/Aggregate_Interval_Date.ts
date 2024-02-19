import { DateTime, Interval } from "luxon";
import { utcFormat } from "d3-time-format";

import { Aggregate_Interval } from "./Aggregate_Interval";

const d3 = { utcFormat };

export class Aggregate_Interval_Date extends Aggregate_Interval<Date> {
  get label(): string {
    if (this.minV == null || this.maxV == null) return "-";

    // if time selection covers a full year/ month, print as a single year/month
    var m_max = DateTime.fromJSDate(this.maxV, { zone: "UTC" });
    var m_min = DateTime.fromJSDate(this.minV, { zone: "UTC" });

    var interval = Interval.fromDateTimes(m_min, m_max);

    var daysInBetween = interval.toDuration("days").toObject().days;

    if (
      Math.abs(daysInBetween - 365) < 2 &&
      m_max.month === 1 &&
      m_max.day === 1
    ) {
      return d3.utcFormat("%Y")(this.minV);
    }

    if (
      Math.abs(daysInBetween - 30) < 3 &&
      m_min.day === 1 &&
      m_max.day === 1
    ) {
      return d3.utcFormat("%b %Y")(this.minV);
    }

    var minStr = this.attrib.getFormattedValue(this.minV, false);
    var maxStr = this.attrib.getFormattedValue(this.maxV, false);

    return `${this.isMinLarger() ? minStr : ""} ... ${
      this.isMaxSmaller() ? maxStr : ""
    }`;
  }
}
