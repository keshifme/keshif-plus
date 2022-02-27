import { Aggregate } from "./Aggregate";
import { Attrib_Categorical } from "./Attrib_Categorical";
import { Aggregate_SetPair } from "./Aggregate_SetPair";

export type CatFilterType = "AND" | "OR" | "NOT";

/** -- */
export class Aggregate_Category extends Aggregate {
  readonly attrib: Attrib_Categorical;

  // DOM elements
  public DOM: {
    aggrGlyph?: Element;
    matrixRow?: Element;
  } = {};

  private readonly _id: string;

  private _label: string = null;

  // additional active status is needed for some UI / animations
  isActive?: boolean;
  isActiveBefore?: boolean;

  constructor(attrib: Attrib_Categorical, id: string) {
    super(attrib);
    this._id = id;
  }

  get id(): string {
    return this._id;
  }
  set label(v: string) {
    this._label = v;
  }
  /** If a separate label has not been assigned, the id of the category. */
  get label(): string {
    return this._label || this._id;
  }

  get tooltipTitle(): string {
    return this.attrib.attribNameHTML;
  }
  protected get tooltipSkip1(): boolean {
    return !this.filtered_AND();
  }

  /** Overwrite */
  setAggrGlyph(v: Element) {
    super.setAggrGlyph(v);
    this.refreshCatDOMSelected();
  }

  // ********************************************************************
  // Filtering
  // ********************************************************************

  private catFiltering: CatFilterType = null;

  isFiltered(): boolean {
    return this.catFiltering !== null;
  }
  filtered_NOT(): boolean {
    return this.catFiltering === "NOT";
  }
  filtered_AND(): boolean {
    return this.catFiltering === "AND";
  }
  filtered_OR(): boolean {
    return this.catFiltering === "OR";
  }

  set_NONE(): void {
    if (this.inList) this.inList.splice(this.inList.indexOf(this), 1);
    this.catFiltering = null;
    this.refreshCatDOMSelected();
  }
  set_NOT(l: Aggregate_Category[]): void {
    if (this.filtered_NOT()) return;
    this.catFiltering = "NOT";
    this.insertToList(l);
  }
  set_AND(l: Aggregate_Category[]): void {
    if (this.filtered_AND()) return;
    this.catFiltering = "AND";
    this.insertToList(l);
  }
  set_OR(l: Aggregate_Category[]): void {
    if (this.filtered_OR()) return;
    this.catFiltering = "OR";
    this.insertToList(l);
  }

  /** -- */
  unselectAggregate(): void {
    super.unselectAggregate();
    if (this.locked) return;
    this.DOM.matrixRow?.removeAttribute("selection");
  }

  // ********************************************************************
  // Export
  // ********************************************************************

  exportAggregateInfo() {
    return {
      id: this.id,
    };
  }

  // ********************************************************************
  // Visualization parameters
  // ********************************************************************

  // Order index of the category among other categories in the attrib
  public orderIndex: number = 0;

  /** -- Visual variable */
  public posX: number = 0;
  get posY() {
    return this.orderIndex * this.attrib.barHeight.val;
  }
  get transformPos() {
    return `translate(${this.posX}px, ${this.posY}px)`;
  }

  // ********************************************************************
  // Set (multi-value) cache
  // ********************************************************************

  // the list of setpairs this category appears in (is one of the sets)
  setPairs?: Aggregate_SetPair[];
  // for computing MST tree (perceptual ordering)
  MST?: {
    tree: {}; // Some unqiue identifier, to check if two nodes are in the same tree.
    childNodes: Aggregate_Category[];
    parentNode: Aggregate_Category | null;
    treeSize?: number; // computed recursively from the node networks
    order?: number;
  };

  // ********************************************************************
  // Geographic data cache
  // ********************************************************************

  public _geo_: any = null;

  // ********************************************************************
  // Private helpers
  // ********************************************************************

  private inList: Aggregate_Category[];

  /** -- */
  private insertToList(l: Aggregate_Category[]) {
    if (this.inList) this.inList.splice(this.inList.indexOf(this), 1);
    this.inList = l;
    l.push(this);
    this.refreshCatDOMSelected();
  }

  /** -- */
  private refreshCatDOMSelected() {
    if (!this.catFiltering) {
      this.DOM.aggrGlyph?.removeAttribute("catFiltered");
    } else {
      this.DOM.aggrGlyph?.setAttribute("catFiltered", this.catFiltering);
    }
  }
}
