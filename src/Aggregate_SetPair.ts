import { Attrib_Categorical } from "./Attrib_Categorical";
import { Aggregate_Category } from "./Aggregate_Category";
import { Aggregate } from "./Aggregate";

/** -- */
export class Aggregate_SetPair extends Aggregate {
  readonly attrib: Attrib_Categorical;

  // Composed of two sets (categories)
  readonly set_1: Aggregate_Category;
  readonly set_2: Aggregate_Category;

  constructor(
    attrib: Attrib_Categorical,
    set_1: Aggregate_Category,
    set_2: Aggregate_Category
  ) {
    super(attrib);
    this.set_1 = set_1;
    this.set_2 = set_2;
  }

  mst_distance: number = 0;

  similarityScore() {
    var size_and = this.measure("Active");
    if (size_and === 0) return 0;

    var size_A = this.set_1.measure("Active");
    var size_B = this.set_2.measure("Active");
    return size_and / Math.min(size_A, size_B);
  }

  get label() {
    return `${this.set_1.label}<br> &amp; ${this.set_2.label}`;
  }

  exportAggregateInfo() {
    return {};
  }
}
