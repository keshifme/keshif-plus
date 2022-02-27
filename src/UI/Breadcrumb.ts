import { Attrib } from "../Attrib";
import { Browser } from "../Browser";
import { SelectType } from "../Types";
import { Filter, Filter_Base } from "../Filter";
import { i18n } from "../i18n";

export class BreadCrumb {
  private readonly browser: Browser;

  public DOM: any = null; // d3-selection

  /** -- */
  constructor(browser: Browser, selectType: SelectType) {
    this.browser = browser;
    this.selectType = selectType;
  }

  // ********************************************************************
  // Select type (Filter, Compare_X)
  // ********************************************************************

  public selectType: SelectType; // can be converted at runtime (Compare can become filter)

  private timeoutHide: number;

  /** -- */
  showCrumb(selectType, filter: Filter_Base) {
    this.selectType = selectType;

    if (this.timeoutHide) window.clearTimeout(this.timeoutHide);

    let attrib: Attrib = filter instanceof Filter ? filter.attrib : null;

    if (!this.DOM) {
      var parentDOM =
        this.selectType === "Filter"
          ? this.browser.DOM.breadCrumbs_Filter
          : this.browser.DOM.breadCrumbs_Compare;

      this.DOM = parentDOM
        .append("span")
        .html(
          `<span class='breadCrumbIcon'><i class='fa fa-filter'></i><i class='far fa-times'></i></span>` +
            `<span class='crumbText'><span class='crumbHeader blockName'></span><span class='crumbDetails'></span></span>`
        )
        .each((_, i, nodes) => {
          if (this.selectType === "Filter") {
            let DOM = nodes[i];
            var l = DOM.parentNode.childNodes.length;
            if (l > 1) {
              DOM.parentNode.insertBefore(
                DOM,
                DOM.parentNode.childNodes[l - 2]
              );
            }
          }
        })
        .on("mouseenter", () => {
          if (this.selectType !== "Filter") {
            this.browser.refreshAllMeasureLabels(this.selectType);
          }
        })
        .on("mouseleave", () => {
          if (this.selectType === "Filter") {
            this.browser.refreshAllMeasureLabels("Active");
          }
        })
        .on("click", () => {
          if (this.selectType === "Filter") {
            filter.clearFilter();
          } else {
            this.browser.clearSelect_Compare(this.selectType, true, true);
            this.browser.refreshAllMeasureLabels("Active");
          }
        });

      this.DOM.style("opacity", 0).transition().style("opacity", 1);
    }

    this.DOM.attr("class", "breadCrumb crumbMode_" + this.selectType)
      .attr("data-summaryID", attrib?.attribID ?? null)
      .tooltip(
        () => i18n[this.selectType === "Filter" ? "RemoveFilter" : "Unlock"]
      );

    if (this.selectType === "Filter") {
      this.browser.DOM.breadCrumbs_Filter.node().appendChild(this.DOM.node());

      var crumbHeader = this.DOM.select(".crumbHeader");
      if (attrib) {
        attrib.addDOMBlockName(crumbHeader);
      } else {
        crumbHeader.html(filter.title);
      }
      this.DOM.select(".crumbDetails").html(filter.filterView_Detail());
    } else {
      this.DOM.select(".crumbDetails").html(
        this.browser.selectedAggrs[this.selectType]?.label || ""
      );
    }

    this.browser.checkAndAdjustBreadcrumbs();
  }

  /** -- */
  removeCrumb() {
    if (!this.DOM) return;

    if (this.timeoutHide) window.clearTimeout(this.timeoutHide);

    this.timeoutHide = window.setTimeout(
      () => {
        this.timeoutHide = 0;
        this.DOM.style("opacity", 0)
          .transition()
          .delay(300)
          .remove()
          .on("end", () => {
            this.DOM.node().tippy?.hide();
            this.browser.checkAndAdjustBreadcrumbs();
            this.DOM = null;
          });
      },
      // duration for timeout
      this.selectType !== "Filter" &&
        !this.browser.lockedCompare[this.selectType]
        ? 1000
        : 0
    );
  }
}
