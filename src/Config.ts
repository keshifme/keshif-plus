import noUiSlider from 'nouislider/dist/nouislider.mjs';

import { i18n } from "./i18n";
import { Modal } from "./UI/Modal.js";
import { Attrib } from "./Attrib.js";

export class ConfigS<T> {
  cfgClass?: string;
}

type ItemOption<T> = {
  name?: string;
  value?: T;
  DOM?: any;
  max?: number; // sometimes, numbers specy a maximum value for each UI-item
  activeWhen?: () => boolean;
  _type?: string;
  minValue?: number;
  maxValue?: number;
};

/** -- */
export class Config<T> {
  // current value
  _value: T;

  // default value
  default: T;
  // cfgClass / varible name
  cfgClass?: string;
  // printed title in UI
  cfgTitle?: string;

  // forced value (depends on other app settings)
  forcedValue?: (Config) => T;
  // adjustments on current value when reading the value
  onRead?: (T) => T;

  onSet?: (a: any, b: any) => any;

  preSet?: (T, Config) => T;

  isActive?: (Config) => boolean;

  onRefresh?: (Config) => void;

  readonly itemOptions: ItemOption<T>[];

  private lookup = new Map<T, string>();

  // disables export setting
  readonly noExport: boolean = false;

  // TODO: {configs[], finalized, .refreshConfigs}
  readonly parent: any;

  // DOM /rendering

  private DOM: {
    root?: any;
    configOptions?: any;
    noUiSlider?: any;
  };

  // TODO: extend with necessary UI options
  readonly UI: {
    disabled?: boolean;
    range?: [number, number];
    step?: number;
  };
  readonly helparticle?: string;
  readonly iconClass?: string;
  readonly iconXML?: string;
  readonly tooltip?: string;

  readonly UISeperator?: {
    className?: string;
    title?: string;
  };

  readonly onDOM?: (any) => void;

  /** -- */
  constructor(_cfg: Partial<Config<T>>) {
    Object.assign(this, _cfg);

    this._value = _cfg.default;

    if (!this.UI) {
      this.UI = { disabled: false };
    }

    this.forcedValue =
      this.forcedValue ||
      (() => {
        return null;
      }); // no forced value set

    this.onSet =
      this.onSet ||
      (() => {
        return null;
      }); // no action with on set

    this.isActive =
      this.isActive ||
      ((d) => {
        if (d._type === "_range_") {
          return (this.val as unknown as number) > 0;
        }
        return d.value === this.val;
      });

    if (this.itemOptions) {
      this.itemOptions
        .filter((_) => _.value !== null)
        .forEach((_) => this.lookup.set(_.value, _.name));
    }

    this.onSet(this.val, this);

    if (this?.parent?.configs) this.parent.configs[this.cfgClass] = this;
  }

  /** Value getter */
  get val(): T {
    var forced = this.forcedValue(this);
    if (forced != null) return forced;
    if (this.onRead) return this.onRead(this._value);
    return this._value;
  }

  /** -- */
  toString() {
    var v = this.val;
    return i18n[this.lookup.get(v) || (v as undefined as string)];
  }

  /** Value setter */
  set val(v: T) {
    if (v == null) return; // cannot set to null or undefined. (false is ok)
    var forced = this.forcedValue(this);
    if (forced == null) {
      if (forced === v) return; // cannot set it to current value. no change
    }
    if (this.preSet) {
      try {
        v = this.preSet(v, this);
      } catch (error) {
        if (this.parent?.finalized) {
          Modal.alert(error); // show alert only after dashboard loading
        }
        return;
      }
    }
    if (v == null) return;

    if (this._value === v) return;

    this.setVal_Direct(v);
  }

  /** -- */
  setVal_Direct(v) {
    this._value = v;

    this.onSet(this.val, this);

    if (this.parent?.refreshConfigs) {
      this.parent.refreshConfigs();
    } else {
      this.refresh();
    }
  }

  /** -- */
  refresh() {
    if (this.onRefresh) {
      this.onRefresh(this);
    }
    if (this.DOM) {
      if (this.forcedValue) {
        var v = this.forcedValue(this);
        this.DOM.root.classed("forced", v != null);
        if (v != null) this.onSet(v, this);
      }
      if (this.isActive) {
        this.DOM.configOptions.classed("active", this.isActive);
      }
      if (this.DOM.noUiSlider) {
        this.DOM.noUiSlider.setHandle(0, this._value, false);
      }
      if (this.itemOptions) {
        this.itemOptions
          .filter((_) => _.DOM && _.activeWhen)
          .forEach((_) => {
            _.DOM.classList[!_.activeWhen() ? "add" : "remove"]("disabled");
          });
      }
    }
  }

  /** -- */
  reset() {
    this.onSet(this.val, this);

    if (this.parent?.refreshConfigs) {
      this.parent.refreshConfigs(); // refresh all configs of the parent
    } else {
      this.refresh();
    }
  }

  private addUISeperator(DOM) {
    if (!this.UISeperator) return;
    DOM.append("tr")
      .attr("class", "configItemGroup " + this.UISeperator.className ?? "")
      .append("td")
      .attr("class", "groupName")
      .html(i18n[this.UISeperator.title]);
  }

  /** -- */
  insertControl(DOM) {
    if (this.UI?.disabled) return;

    this.addUISeperator(DOM);

    this.DOM = {};
    this.DOM.root = DOM.append("tr").attr(
      "class",
      "configItem configItem_" + this.cfgClass
    );

    this.DOM.root
      .append("td")
      .attr("class", "configItem_Header")
      .append("span")
      .html(i18n[this.cfgTitle]);

    if (this.iconClass) {
      this.DOM.root
        .append("td")
        .attr("class", "configItem_Icon")
        .append("span")
        .attr("class", "icon " + this.iconClass);
    } else {
      this.DOM.root
        .append("td")
        .attr("class", "configItem_Icon")
        .append("span")
        .attr("class", "icon")
        .append("span")
        .html(this.iconXML);
    }

    var _ = this.DOM.root
      .append("td")
      .attr("class", "configItem_Options_td")
      .append("div")
      .attr("class", "configItem_Options");

    this.DOM.configOptions = _.selectAll(".configOption")
      .data(this.itemOptions || [])
      .enter()
      .append("span")
      .attr(
        "class",
        (d: ItemOption<T>) => "configOption pos_" + (d._type || d.value || d.name)
      )
      .each((d: ItemOption<T>, i, nodes) => {
        d.DOM = nodes[i];
      });

    this.DOM.configOptions
      .filter((_: ItemOption<T>) => _.value !== undefined)
      .html((d: ItemOption<T>) => i18n[d.name])
      .on("click", (_event, d: ItemOption<T>) => {
        this.val = d.value;
      });

    this.DOM.configOptions
      .filter((_) => _._type === "_range_")
      .append("span")
      .attr("class", "configOptionRange")
      .each((_, i, nodes) => {
        this.DOM.noUiSlider = noUiSlider.create(nodes[i], {
          connect: "lower",
          step: 1,
          behaviour: "tap-drag",
          range: {
            min: _.minValue,
            max: _.maxValue,
          },
          start: this.default,
        });
        nodes[i].noUiSlider.on("set", (v) => {
          this.val = v;
        });
      });

    this.DOM.root
      .append("td")
      .attr("class", "configItem_Info")
      .append("span")
      .attr("class", "fal fa-question-circle")
      .attr("data-helparticle", this.helparticle)
      .tooltip((this.tooltip ? this.tooltip + "<br><br>" : "") + "Learn more", {
        placement: "bottom",
      });

    Modal.createHelpScoutLinks(this.DOM.root);

    if (this.onDOM) this.onDOM(this.DOM);

    this.refresh();
  }

  exportValue() {
    if (this.noExport) return undefined;
    if (this._value === this.default) return undefined;
    var v: any = this._value;
    if (v instanceof Attrib) v = v.attribName;
    if (v._time_src) v = v._time_src;
    return v;
  }

  /** -- */
  exportConfigTo(_to) {
    _to[this.cfgClass] = this.exportValue();
  }
}
