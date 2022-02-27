import { Aggregate } from "./Aggregate";
import { Attrib } from "./Attrib";
import { i18n } from "./i18n";

// Filtering can be disabled (false), in, or out
type NoValueSelection = false | "in" | "out";

/** -- */
export class Aggregate_NoValue extends Aggregate {
  private filterSelection: NoValueSelection = false;

  constructor(attrib: Attrib) {
    super(attrib);
  }

  get label(): string {
    return i18n.NoData;
  }

  get filtered(): NoValueSelection {
    return this.filterSelection;
  }

  set filtered(v: NoValueSelection) {
    this.filterSelection = v;

    if(this.records.length===0) return;
    
    if (this.filterSelection === false) {
      this.DOM.aggrGlyph?.classList.remove("filtered");
    } else {
      this.DOM.aggrGlyph?.classList.add("filtered");
    }
  }

  exportAggregateInfo() {
    return {};
  }
}
