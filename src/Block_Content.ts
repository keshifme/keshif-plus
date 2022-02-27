import { Attrib_Content } from "./Attrib_Content";
import { Block } from "./Block";
import { i18n } from "./i18n";

export class Block_Content extends Block {
  public readonly attrib: Attrib_Content;
  constructor(attrib: Attrib_Content) {
    super(attrib);
  }

  // ********************************************************************
  // ********************************************************************

  private height_content: number = 0;
  public height_max: number = 10000;
  public height_min: number = 100;

  hasStaticHeight(): boolean {
    return false;
  }

  get height_Content(): number {
    return this.isVisible() ? this.height_content : 0;
  }
  get height_RangeMin(): number {
    if (this.attrib.isEmpty()) return this.height_Header;
    return this.height_min;
  }
  get height_RangeMax(): number {
    if (this.attrib.isEmpty()) return this.height_Header;
    return this.height_max;
  }
  setHeight(targetHeight: number): void {
    this.height_content =
      Math.min(targetHeight, this.height_max) - this.height_Header;
  }
  refreshWidth(): void {}

  // ********************************************************************
  // ********************************************************************

  private curStep: number = -1;
  public onStep: Function = null;

  /** -- */
  onCollapse(): void {
    if (this.collapsed) return;
    this.displayStep(0);
  }

  /** -- */
  initDOM(beforeDOM): boolean {
    if (this.attrib.isEmpty()) return false;
    if (this.DOM.inited) return true;

    this.insertRoot(beforeDOM);

    this.setCollapsed(this.collapsed);

    this.DOM.contentWrapper = this.DOM.wrapper
      .append("div")
      .attr("class", "contentWrapper");

    this.DOM.contentBlock = this.DOM.contentWrapper
      .append("div")
      .attr("class", "contentBlock");

    if (this.attrib.isMultiStep()) {
      var stepControls = this.DOM.contentWrapper
        .append("div")
        .attr("class", "stepControls");
      stepControls
        .append("div")
        .attr("class", "stepDots")
        .selectAll("div")
        .data([...Array(this.attrib.content.length).keys()])
        .enter()
        .append("div")
        .attr("class", "stepDot")
        .html("●")
        .tooltip(i18n["Jump to step"])
        .on("click", (_event, i) => this.displayStep(i));

      stepControls
        .append("div")
        .attr("class", "dismissButton")
        .html(i18n.Close)
        .on("click", () => this.setCollapsedAndLayout(true));

      stepControls.append("div").attr("class", "stepControlGap");

      this.DOM.stepPrev = stepControls
        .append("div")
        .attr("class", "stepButton stepPrev")
        .html("<i class='fa fa-angle-double-left'></i>" + i18n.Previous)
        .on("click", () => this.displayStep(this.curStep - 1));

      this.DOM.stepNext = stepControls
        .append("div")
        .attr("class", "stepButton stepNext")
        .html(i18n.Next + "<i class='fa fa-angle-double-right'></i>")
        .on("click", () => this.displayStep(this.curStep + 1));

      this.DOM.stepClose = stepControls
        .append("div")
        .attr("class", "stepButton stepClose")
        .html(i18n.Close + "<i class='fa fa-compress-alt'></i>")
        .on("click", () => this.setCollapsedAndLayout(true));
    }

    this.DOM.inited = true;

    this.displayStep(0);

    return true;
  }

  /** -- */
  displayStep(stepIndex) {
    if (!this.DOM.inited) return;
    if (this.attrib.content.length == 0) return;
    stepIndex = Math.min(
      Math.max(0, stepIndex),
      this.attrib.content.length - 1
    );
    if (this.curStep === stepIndex) return;

    this.curStep = stepIndex;
    var content = this.attrib.content[stepIndex];
    if (typeof content === "string") {
      this.DOM.contentBlock.html(content);
      this.DOM.contentWrapper.classed("fullIframe", false);
    } else if (content.youtube) {
      this.DOM.contentBlock.html(
        `<iframe ` +
          `src='https://www.youtube-nocookie.com/embed/${content.youtube}?controls=0` +
          `frameborder=0 allow="autoplay; encrypted-media; picture-in-picture"`
      );
      this.DOM.contentWrapper.classed("fullIframe", true);
    }

    if (this.onStep) {
      this.onStep.call(this);
    }

    this.DOM.contentBlock.node().scrollTop = 0;

    this.DOM.contentWrapper
      .classed("firstStep", this.curStep === 0)
      .classed("lastStep", this.curStep === this.attrib.content.length - 1);

    this.DOM.contentWrapper
      .selectAll(".stepDot")
      .classed("active", (i) => this.curStep === i);
  }

  refreshViz_Active(): void {
    throw new Error("Not supported");
  }
  refreshViz_Compare(
    cT: any,
    curGroup: any,
    totalGroups: any,
    prevCts: any
  ): void {
    throw new Error("Not supported");
  }
  chartAxis_Measure_TickSkip(): number {
    throw new Error("Not supported");
  }
  updateAfterFilter(refreshViz: boolean): void {
    throw new Error("Not supported");
  }
}
