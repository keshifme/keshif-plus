import { select, pointer } from "../d3_select";

import { i18n } from "../i18n";
import { Browser } from "../Browser";
import { Base } from "../Base";
import { Config } from "../Config";

const d3 = { select, pointer };

export class ConfigPanel {
  private readonly browser: Browser;
  private readonly DOM: { root: any; configTable: any };
  private readonly controlButton: any;

  /** -- */
  constructor(
    rootDOM,
    headerName,
    className,
    configs: Config<any>[],
    browser: Browser,
    controlButton
  ) {
    this.browser = browser;

    this.DOM = {
      root: rootDOM
        .append("div")
        .attr("class", "configPanel " + className)
        .classed("active", false),
      configTable: null,
    };

    this.controlButton = controlButton;

    this.DOM.root
      .append("div")
      .attr("class", "configClose fa fa-window-close")
      .tooltip(i18n.Close)
      .on("click", () => this.hide());

    this.DOM.root
      .append("div")
      .attr("class", "popupPanel_Header")
      .html(i18n[headerName])

      // Dragging support while keeping it within window
      .on("mousedown", (event) => {
        browser.DOM.root
          .classed("noPointerEvents", true)
          .attr("drag_cursor", "grabbing");

        var bodyDOM = d3.select("body").node();

        var initPos = d3.pointer(event, bodyDOM);
        var DOM = this.DOM.root.node();
        var initX = parseInt(DOM.offsetLeft);
        var initY = parseInt(DOM.offsetTop);

        d3.select("body")
          .on("mousemove", (event2) => {
            var newPos = d3.pointer(event2, bodyDOM);
            this.checkPositionSanity(
              initX - initPos[0] + newPos[0],
              initY - initPos[1] + newPos[1]
            );
          })
          .on("mouseup", () => {
            browser.DOM.root
              .classed("noPointerEvents", false)
              .attr("drag_cursor", null);
            d3.select("body").on("mousemove", null).on("mouseup", null);
          });

        event.preventDefault();
      });

    this.DOM.root
      .append("div")
      .attr("class", "compactSizeControl far fa-angle-double-up")
      .on("click", () => this.DOM.root.node().classList.toggle("compact"));

    this.DOM.configTable = this.DOM.root
      .append("div")
      .attr("class", "popupPanel_Content")
      .append("table")
      .attr("class", "configTable");

    configs.forEach((cfg) => this.insertConfigUI(cfg));
  }

  insertConfigUI(cfg){
    cfg.insertControl(this.DOM.configTable);
  }

  /** -- */
  showAtPos(left, top) {
    if (this.DOM.root.classed("active")) {
      this.hide();
      return;
    }
    this.browser.closeConfigPanels();
    this.DOM.root.classed("active", true);
    this.controlButton.classed("fa-spin", true);
    this.checkPositionSanity(left, top);
  }

  /** -- */
  hide() {
    this.DOM.root.classed("active", false);
    this.controlButton.classed("fa-spin", false);
  }

  /** -- */
  private checkPositionSanity(curLeft = null, curTop = null) {
    if (!Base.browser) return;
    var space = 8; // just to add some space around...
    var dom = this.DOM.root.node();
    var panelWidth = dom.offsetWidth + space;
    var panelHeight = dom.offsetHeight + space;
    if (curLeft == null) curLeft = parseFloat(dom.style.left);
    if (curTop == null) curTop = parseFloat(dom.style.top);
    var maxWidth = dom.offsetParent.getBoundingClientRect().width;
    var maxHeight = dom.offsetParent.getBoundingClientRect().height;
    dom.style.left =
      Math.max(space, Math.min(maxWidth - panelWidth, curLeft)) + "px";
    dom.style.top =
      Math.max(space, Math.min(maxHeight - panelHeight, curTop)) + "px";
  }
}
