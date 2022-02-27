import { Aggregate_Category } from "./Aggregate_Category";
import { Aggregate_SetPair } from "./Aggregate_SetPair";

import { i18n } from "./i18n.js";
import { Attrib_Categorical } from "./Attrib_Categorical";
import { Attrib } from "./Attrib";
import { Block_Set } from "./Block_Set";

/** -- */
export class Attrib_Set extends Attrib {
  // may have a single parent attribute
  protected readonly _parent: Attrib_Categorical;
  get parent(): Attrib_Categorical {
    return this._parent;
  }
  get setListAttrib() {
    return this._parent;
  }

  // The associated block (view) - null by default
  protected _block: Block_Set;
  public get block(): Block_Set {
    return this._block;
  }

  // ********************************************************************
  // Aggregates (setpairs)
  // ********************************************************************

  public _aggrs: Aggregate_SetPair[] = [];
  // just renaming for convenience
  public get setPairs() {
    return this._aggrs;
  }

  private _setPairs_ID: {
    [index: string]: { [index: string]: Aggregate_SetPair };
  } = {};

  // sets are parent summaries aggregates
  get sets() {
    return this.setListAttrib._aggrs;
  }

  // ********************************************************************
  // Constructor
  // ********************************************************************

  constructor(browser, parent: Attrib_Categorical) {
    super(
      browser,
      i18n.SetPairTitle(parent.attribName),
      null, // no template, no accessor
      "setpair",
      "setPairSummary",
      "" // not in attribute list
    );

    this._parent = parent;

    this._block = new Block_Set(this);
  }

  /** -- */
  initializeAggregates(): void {
    if (this.aggr_initialized) return;

    this.createSetPairs();

    this.block.initDOM();

    this.aggr_initialized = true;
  }

  getAggregate(set_1, set_2): Aggregate_SetPair {
    var setPair = this._setPairs_ID[set_1.id][set_2.id];
    if (!setPair) {
      setPair = new Aggregate_SetPair(this.setListAttrib, set_1, set_2);
      set_1.setPairs.push(setPair);
      set_2.setPairs.push(setPair);
      this.setPairs.push(setPair);
      this._setPairs_ID[set_1.id][set_2.id] = setPair;
      this.browser.allAggregates.push(setPair);
    }
    return setPair;
  }

  /** For each element in the given list, checks the set membership and adds setPairs */
  private createSetPairs() {
    this.sets.forEach((aggr) => {
      aggr.setPairs = [];
    });

    var insertToClique = (set_1, set_2, record) => {
      // avoid self reference and adding the same record twice
      // (insert only A-B, not B-A / A-A / B-B)
      if (set_2.id <= set_1.id) return;

      if (this._setPairs_ID[set_1.id] === undefined)
        this._setPairs_ID[set_1.id] = {};

      this.getAggregate(set_1, set_2).addRecord(record);
    };

    var getSetAggr = (v: string): Aggregate_Category => {
      return this.setListAttrib.getAggrWithLabel(v);
    };
    this.setListAttrib.records.forEach((record) => {
      // read raw values, not with labeling applied
      var values: string[] = record.getValue(this.setListAttrib);
      if (values === null) return; // maps to no value
      if (values.length < 2) return; // maps to one value
      values.forEach((v_1: string) => {
        var set_1 = getSetAggr(v_1);
        if (!set_1.setPairs) return;
        values.forEach((v_2: string) => {
          var set_2 = getSetAggr(v_2);
          if (!set_2.setPairs) return;
          insertToClique(set_1, set_2, record);
        });
      });
    });

    this.block.updateMaxAggr_Active();
  }

  /** --*/
  updatePerceptualOrder() {
    // Edges are set-pairs with at least one element inside (based on the filtering state)
    var edges = this.setPairs.filter((aggr) => aggr.measure("Active") > 0);
    // Nodes are the set-categories
    var nodes = this.sets;

    // Initialize per-node (per-set) data structures
    nodes.forEach((node: Aggregate_Category) => {
      node.MST = {
        tree: new Object(), // Some unqiue identifier, to check if two nodes are in the same tree.
        childNodes: [],
        parentNode: null,
      };
    });

    // Compute the perceptual distance metric
    edges.forEach((edge: Aggregate_SetPair) => {
      var set_1 = edge.set_1;
      var set_2 = edge.set_2;
      edge.mst_distance = 0;

      // For every intersection of set_1
      set_1.setPairs.forEach((setPair_1: Aggregate_SetPair) => {
        if (setPair_1 === edge) return;
        var set_other =
          setPair_1.set_1 === set_1 ? setPair_1.set_2 : setPair_1.set_1;

        // find the set-pair of set_2 and set_other;
        var setPair_2: Aggregate_SetPair = null;
        if (set_2.id > set_other.id) {
          if (this._setPairs_ID[set_other.id])
            setPair_2 = this._setPairs_ID[set_other.id][set_2.id];
        } else {
          if (this._setPairs_ID[set_2.id])
            setPair_2 = this._setPairs_ID[set_2.id][set_other.id];
        }

        if (!setPair_2) {
          // the other intersection size is zero, there is no link
          edge.mst_distance += setPair_1.measure("Active");
          return;
        }
        edge.mst_distance += Math.abs(
          setPair_1.measure("Active") - setPair_2.measure("Active")
        );
      });

      // For every intersection of set_2
      set_2.setPairs.forEach((setPair_1: Aggregate_SetPair) => {
        if (setPair_1 === edge) return;
        var set_other =
          setPair_1.set_1 === set_2 ? setPair_1.set_2 : setPair_1.set_1;
        // find the set-pair of set_1 and set_other;
        var setPair_2 = undefined;
        if (set_1.id > set_other.id) {
          if (this._setPairs_ID[set_other.id])
            setPair_2 = this._setPairs_ID[set_other.id][set_1.id];
        } else {
          if (this._setPairs_ID[set_1.id])
            setPair_2 = this._setPairs_ID[set_1.id][set_other.id];
        }
        if (setPair_2 === undefined) {
          // the other intersection size is zero, there is no link
          edge.mst_distance += setPair_1.measure("Active");
          return;
        }
        // If ther is setPair_2, it was already processed in the main loop above
      });
    });

    // Order the edges (setPairs) by their distance (lower score is better)
    edges.sort(
      (e1: Aggregate_SetPair, e2: Aggregate_SetPair) =>
        e1.mst_distance - e2.mst_distance
    );

    // Run Kruskal's algorithm...
    edges.forEach((setPair) => {
      var node_1 = setPair.set_1;
      var node_2 = setPair.set_2;
      // set_1 and set_2 are in the same tree
      if (node_1.MST.tree === node_2.MST.tree) return;
      // set_1 and set_2 are not in the same tree, connect set_2 under set_1
      var set_above: Aggregate_Category, set_below: Aggregate_Category;
      if (node_1.setPairs.length < node_2.setPairs.length) {
        set_above = node_1;
        set_below = node_2;
      } else {
        set_above = node_2;
        set_below = node_1;
      }
      set_below.MST.tree = set_above.MST.tree;
      set_below.MST.parentNode = set_above;
      set_above.MST.childNodes.push(set_below);
    });

    // Identify the root-nodes of resulting MSTs
    var treeRootNodes = nodes.filter((node) => {
      return node.MST.parentNode === null;
    });

    // We can have multiple trees (there can be sub-groups disconnected from each other)

    // Update tree size recursively by starting at the root nodes
    var updateTreeSize = (node: Aggregate_Category) => {
      node.MST.treeSize = 1;
      node.MST.childNodes.forEach((childNode) => {
        node.MST.treeSize += updateTreeSize(childNode);
      });
      return node.MST.treeSize;
    };
    treeRootNodes.forEach((rootNode: Aggregate_Category) => {
      updateTreeSize(rootNode);
    });

    // Sort the root nodes by largest tree first
    treeRootNodes.sort(
      (node1, node2) => node1.MST.treeSize - node2.MST.treeSize
    );

    // For each MST, traverse the nodes and add the MST (perceptual) node index incrementally
    var mst_index = 0;
    var updateNodeIndex = (node: Aggregate_Category) => {
      node.MST.childNodes.forEach((chileNode) => {
        chileNode.MST.order = mst_index++;
      });
      node.MST.childNodes.forEach((chileNode) => {
        updateNodeIndex(chileNode);
      });
    };
    treeRootNodes.forEach((node) => {
      node.MST.order = mst_index++;
      updateNodeIndex(node);
    });
  }

  isExportable(): boolean{
    return false;
  }

  // ********************************************************************
  // Not applicable
  // ********************************************************************

  /** It doesn't have its own filter - uses filter of parent category instead */
  createSummaryFilter(): void {}
  /** Special templates do not apply */
  applyTemplateSpecial(): void {}

  /** not used for set/ circle size calculations, just implementing the interface */
  get measureRangeMax(): number {
    return this.block.setPairRadius;
  }
  updateChartScale_Measure() : void{
    if (!this.block.isVisible()) return;
    this.block?.refreshViz_All();
  }
  chartAxis_Measure_TickSkip(): number {
    throw new Error("Not applicable.");
  }

  isEmpty() {
    return false;
  }
  isFiltered(): boolean {
    return this.setListAttrib.isFiltered();
  }
}
