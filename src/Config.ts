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

  private _prevValue: T;

  // default value
  readonly default: T;
  // cfgClass / varible name
  readonly cfgClass?: string;
  // printed title in UI
  cfgTitle?: string;

  // forced value (depends on other app settings)
  readonly forcedValue?: (Config) => T | null;
  // adjustments on current value when reading the value
  readonly onRead?: (T) => T;

  readonly onSet?: (a: T, b: Config<T>) => void;

  readonly preSet?: (T, Config) => Promise<T>;

  readonly isActive?: (Config) => boolean;

  readonly onRefreshDOM?: (Config) => void;

  readonly itemOptions: ItemOption<T>[];

  // disables export setting
  readonly noExport: boolean = false;

  // TODO: {configs[], finalized, .refreshConfigs}
  readonly parent: any;

  private lookup = new Map<T, string>();

  // DOM /rendering

  public DOM: {
    root?: any;
    configOptions?: any;
    noUiSlider?: any;
    mainSelect?: any;
    timeKeys?: any;
    keySelect?: any;
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

    this.UI ??= { disabled: false };

    this.isActive ??= ((d) => {
      if (d._type === "_range_") {
        return (this.get() as unknown as number) > 0;
      }
      return this.is(d.value);
    });

    this.itemOptions
      ?.filter((option) => option.value !== null)
      .forEach((option) => this.lookup.set(option.value, option.name));

    if (this?.parent?.configs)
      this.parent.configs[this.cfgClass] = this;

    this._prevValue = _cfg.default;
    this._value = _cfg.default;

    // TODO: This function may be async, but we are in a constructor...
    this.onSet?.(this.get(), this);
  }

  /** Current value to string */
  public toString(): string {
    let v = this.get();
    return i18n[this.lookup.get(v) || (v as undefined as string)];
  }

  /** Value getter */
  public get(): T {
    // First, check & return if there is a forced value
    return this.forcedValue?.(this)
      // We may run an onRead function to customize the value
      ?? this.onRead?.(this._value)
      // directly return the value
      ?? this._value;
  }

  public is(v: T): boolean {
    return this.get() === v;
  }

  /** Value setter - onSet function may be async*/
  public async set(v: T): Promise<void> {
    if (v == null) return; // cannot set to null or undefined. (false is ok)

    if (this.preSet) {
      try {
        v = await this.preSet(v, this);
      } catch (error) {
        if (this.parent?.finalized) {
          Modal.alert(error); // show alert only after dashboard loading
        }
        return;
      }
    }

    if (v == null) return; // preSet can return null, preventing change and raising no error

    if (this._value === v) return; // prevent setting it to current value - no change

    this._prevValue = this._value;
    this._value = v;

    const forced = this.forcedValue?.(this);
    if (forced === v) return; // trying to set to current forced value. No need to call onSet/refresh

    await this.onSet?.(this.get(), this);

    if (this.parent?.refreshConfigs) {
      this.parent.refreshConfigs();
    } else {
      this.refresh();
    }
  }

  // sets the value to previous value
  public async undoChange(): Promise<void>{
    await this.set(this._prevValue);
  }

  /** -- */
  public async refresh(): Promise<void>{
    this.onRefreshDOM?.(this);

    if (this.DOM) {
      // we have custom forced value function
      if (this.forcedValue) {
        var v = this.forcedValue(this);
        this.DOM.root.classed("forced", v != null);
        if (v != null) await this.onSet?.(v, this);
      }

      if (this.isActive) {
        this.DOM.configOptions.classed("active", this.isActive);
      }

      this.DOM.noUiSlider?.setHandle(0, this._value, false);

      this.itemOptions
        ?.filter((_) => _.DOM && _.activeWhen)
        .forEach((_) => {
          _.DOM.classList[!_.activeWhen() ? "add" : "remove"]("disabled");
        });
    }
  }

  /** Calls oNSet and refresh... */
  public async reset() {
    await this.onSet?.(this.get(), this);

    if (this.parent?.refreshConfigs) {
      this.parent.refreshConfigs(); // refresh all configs of the parent
    } else {
      await this.refresh();
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
  public insertControl(DOM) {
    if (this.UI?.disabled) return;

    this.addUISeperator(DOM);

    this.DOM = {};
    this.DOM.root = DOM.append("tr")
      .attr("class", "configItem configItem_" + this.cfgClass);

    this.DOM.root.append("td")
      .attr("class", "configItem_Header")
      .append("span")
      .html(i18n[this.cfgTitle]);

    let icon = this.DOM.root.append("td")
      .attr("class", "configItem_Icon")
      .append("span");

    // We can use a css class, or iconXML.
    if (this.iconClass) {
      icon.attr("class", "icon " + this.iconClass);
    } else {
      icon.attr("class", "icon").append("span").html(this.iconXML);
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
      .on("click", async (_event, d: ItemOption<T>) => await this.set(d.value) );

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
        nodes[i].noUiSlider.on("set", async (v) => await this.set(v));
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

    this.onDOM?.(this.DOM);

    this.refresh();
  }

  public exportValue() {
    if (this.noExport) return undefined;
    if (this._value === this.default) return undefined;
    var v: any = this._value;
    if (v instanceof Attrib) v = v.attribName;
    if (v._time_src) v = v._time_src;
    return v;
  }

  /** -- */
  public exportConfigTo(_to) {
    _to[this.cfgClass] = this.exportValue();
  }
}
