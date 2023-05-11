import * as d3 from "../d3_select";
import * as Popper from "@popperjs/core";

import { RecordDisplay } from "../RecordDisplay";
import { RecordVisCoding } from "../Types";
import { Attrib } from "../Attrib";
import { i18n } from "../i18n";
import { Attrib_Numeric } from "../Attrib_Numeric";

type DropdownOption = {
  item: Attrib | string | null, // if null, it means no value
  measureType?: "Sum" | "Count", // special grouping option
  name: string,
  sub: {[index: string]: DropdownOption},
  parents?: string[], // if not defined, means no parent
}

type DropdownSpec = {[index:string]: DropdownOption};

// group attribList by pathName
function groupSummaries(attribList: Attrib[]): DropdownSpec {
  var grouped: DropdownSpec = {};

  for (const attrib of attribList) {
    if (attrib == null) {
      grouped[""] = { item: null, name: i18n["(None)"], sub: {} };
      continue;
    }

    var target = grouped;

    attrib.pathName.forEach((_key: string) => {
      target[_key] =  target[_key] || {
        item: _key,
        name: _key,
        sub: {}, // creates one with empty sub
      };
      target = target[_key].sub;
    });

    target[attrib.printName] = target[attrib.printName] || {
      name: attrib.printName,
      item: attrib,
      sub: {},
    };

    // overwriting it here, since the existing one might be set before as a simple group (item as key)
    target[attrib.printName].item = attrib;
  }
  return grouped;
}

export class AttribDropdown {
  private readonly _type: RecordVisCoding;
  private readonly recordDisplay: RecordDisplay;
  private _element: any; // d3 select
  private _button: any; // d3 select
  private _popup: any; // d3 select
  private _popper: any; // d3 select

  /** -- */
  constructor(_type: RecordVisCoding, recDisp: RecordDisplay) {
    this.recordDisplay = recDisp;
    this._type = _type;

    this._element = this.recordDisplay.DOM[_type + "ControlGroup"]
      .append("span")
      .attr("class", "summaryGroup");

    this._button = this._element
      .append("div")
      .attr("class", "selectButton")
      .on("click", () => this.toggle());

    this._button.append("div").attr("class", "text");
    this._button.append("div").attr("class", "caret far fa-angle-down");

    this._popup = this._element.append("div").attr("class", "selectOptions");

    this._element
      .append("span")
      .attr("class", "summaryDescription fa fa-info")
      .tooltip("");

    this._popper = null;
  }

  /** -- */
  get browser() {
    return this.recordDisplay.browser;
  }

  /** Returns main timeseries if selected one is a timeKey */
  get activeAttrib() {
    var attrib = this.recordDisplay.codeBy[this._type];
    if (attrib instanceof Attrib_Numeric && attrib.hasTimeSeriesParent()) {
      return attrib.timeseriesParent;
    }
    return attrib;
  }

  /** -- */
  refresh() {
    var attrib = this.activeAttrib;
    var text: string;

    if (attrib == null) {
      text = i18n.NoAttribute;
    } else if (attrib === "_measure_") {
      text = (this.browser.measureFunc.is("Count"))
        ? this.browser.recordName 
        : this.browser.measureSummary.get().printName;
    } else {
      text = attrib.printName;
    }

    this._button.select(".text").html(text);
    this._button.classed("none", attrib == null);

    // Update description tooltip
    var descSummary =
      attrib === "_measure_" ? this.browser.measureSummary : attrib;
    if (descSummary instanceof Attrib) {
      let description = descSummary ? descSummary.description : null;
      this._element
        .select(".summaryDescription")
        .style("display", description ? null : "none")
        .tooltip(description, { placement: "bottom" });
    }
  }

  /** -- */
  toggle() {
    if (this._popper) {
      this.hide();
    } else {
      this.show();
    }
  }

  /** -- */
  show() {
    if (this._popper) return;

    var measuring = (this._type==="size" || this._type==="color") && this.recordDisplay.hasAggregates();

    var dropdownOptions: DropdownSpec;

    if (measuring) {
      dropdownOptions = {};
      dropdownOptions[""] = {
        item: null,
        name: i18n.NoAttribute,
        sub: {},
      };
      dropdownOptions["Count"] = {
        item: null,
        measureType: "Count",
        name: `${i18n.measure_Count}: ${this.browser.recordName}`,
        sub: {},
      };
      dropdownOptions["Sum"] = {
        item: null,
        name: "Sum",
        measureType: "Sum",
        sub: groupSummaries(this.browser.getMeasurableSummaries("Sum")),
      };
      // 
    } else {
      dropdownOptions = groupSummaries(
        this.recordDisplay.getAttribOptions_UI(this._type)
      );
    }

    this._popup.selectAll("div").remove();

    // recursiv method to add list of options
    var addList = (DOM, def: DropdownSpec, level = 0) => {
      var list: DropdownOption[] = Object.values(def);

      // sort list so that items without group appear on top
      list = list.sort((a: DropdownOption, b: DropdownOption) => {
        if (a.item === null) return 1;
        if (b.item === null) return -1;
        return (
          Object.entries(b.sub).length - Object.entries(a.sub).length ||
          a.name.localeCompare(b.name)
        );
      });

      var listItems = DOM.selectAll("div")
        .data(list)
        .enter()
        .append("div")
        .attr("class", "option")
        .classed(
          "active",
          (_: DropdownOption) => {
            if(measuring){
              if(_.measureType==="Count"){
                return this.activeAttrib==="_measure_";
              }
              if(_.measureType==="Sum"){
                return this.activeAttrib==="_measure_";
              }
            }
            if( _.item == this.activeAttrib ) return true;
            return (_.item === "Count" && this.activeAttrib === "_measure_" && this.browser.measureFunc.is("Count"))
          }
        )
        .classed("collapsed", true)
        .attr("data-id", (_: DropdownOption) => {
          if (_.item === null) return "none";
          if (typeof _.item === "string") return "_measure_";// Count or Sum
          return _.item.attribID;
        })
        .classed("isSelectable", (_: DropdownOption) => _.item instanceof Attrib)
        .classed("hasSubItems", (_: DropdownOption) => Object.entries(_.sub).length > 0);

      listItems
        .append("div")
        .attr("class", "optionItem")
        .call((optionItem) => {
          optionItem
            .append("div")
            .attr("class", "groupControl")
            .tooltip(i18n["Open/Close"])
            .on("click", (event) => {
              event.stopPropagation();
              event.preventDefault();
              event.currentTarget.parentNode.parentNode.classList.toggle("collapsed");
            })
            .append("div")
            .attr("class", "fa fa-caret-down");
          optionItem
            .append("div")
            .attr("class", "optionName")
            .html((_) => _.name);
        })
        .on("click", async (event, _: DropdownOption) => {
          if(measuring){
            if (_.measureType) {
              await this.browser.measureFunc.set(_.measureType);
              this.recordDisplay.setAttrib(this._type, "_measure_", true);
            } else{
              this.recordDisplay.setAttrib(this._type, null, true);
            }
            this.hide();
            return;
          }

          if (typeof _.item === "string") {
            // grouping only. open/close group
            event.currentTarget.parentNode.classList.toggle("collapsed");
            return;
          }

          // Attrib selection
          this.recordDisplay.setAttrib(this._type, _.item, true);
          this.hide();
        });

      listItems
        .append("div")
        .attr("class", "subItems")
        .each((d, i, nodes) => {
          addList(d3.select(nodes[i]), d.sub, level + 1);
        });
    };

    addList(this._popup, dropdownOptions, 0);

    this._popup.style("min-width", this._button.node().offsetWidth + "px");

    this._popper = Popper.createPopper(
      this._button.node(),
      this._popup.node(),
      {
        placement:
          this._type == "timeSeries" || this._type == "scatterY"
            ? "right-start"
            : "bottom-start",
        strategy: "absolute",
        modifiers: [
          {
            name: "flip",
            enabled: true,
            boundary: this.browser.DOM.root.node(),
            //fallbackPlacements: ['top', 'right', 'bottom', 'left'],
          },
        ],
      }
    );

    setTimeout(() => this._element.classed("dropdownOpen", true), 10);
  }

  /** -- */
  hide() {
    this._element.classed("dropdownOpen", false);
    setTimeout(() => {
      if (!this._popper) return;
      this._popper.destroy();
      this._popper = null;
    }, 350);
  }
}
