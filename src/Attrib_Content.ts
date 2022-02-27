import { Attrib } from "./Attrib";
import { BlockContentSpec } from "./Types";
import { Browser } from "./Browser";
import { Block_Content } from "./Block_Content";

/** -- */
export class Attrib_Content extends Attrib {
  protected _block: Block_Content;
  public get block(): Block_Content {
    return this._block;
  }

  /** -- */
  private _content: BlockContentSpec[] = [];
  get content() {
    return this._content;
  }

  /** -- */
  constructor(browser: Browser, name: string) {
    super(
      browser,
      name,
      null,
      "content",
      "kshfBlock_Content",
      "fa fa-file-alt"
    );

    this._block = new Block_Content(this);
  }

  /** -- */
  isEmpty(): boolean {
    return this._content.length > 0;
  }
  isMultiStep(): boolean {
    return this._content.length > 1;
  }

  /** -- */
  applyConfig(blockCfg) {
    super.applyConfig(blockCfg);

    this.setContent(blockCfg._content);

    this.block.height_max = blockCfg.maxHeight;
    this.block.height_min = blockCfg.minHeight;

    this.block.onStep = blockCfg.onStep;
  }

  /** -- */
  setContent(v: BlockContentSpec[] = []): void {
    this._content = v;
    this.block?.displayStep(0);
  }

  initializeAggregates(): void {}
  updateChartScale_Measure(): void {}

  get measureRangeMax(): number {
    throw new Error("Not supported");
  }

}
