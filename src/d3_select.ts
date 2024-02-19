import DOMPurify from "dompurify";

import tippy, { roundArrow} from "tippy.js";

import { select, pointer, selection } from "d3-selection";

// We need to import transition module
// It is used by other sections, but not explicitly initialized as d3.transition...
// export * as transition from "d3-transition";
import { Base } from "./Base";

DOMPurify.setConfig({
  USE_PROFILES: { html: true, svg: true },
  ALLOWED_ATTR: ["target"],
  //'FORBID_ATTR': ['rel'],
  //'ALLOW_DATA_ATTR': false
});

// Open links in new window
DOMPurify.addHook("afterSanitizeAttributes", function (node) {
  if ("target" in node) {
    node.setAttribute("target", "_blank");
  }
});

function isObject(item) {
  return item && typeof item === "object" && !Array.isArray(item);
}

function mergeDeep(target, ...sources) {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key]) && !(source[key] instanceof HTMLElement)) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        mergeDeep(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return mergeDeep(target, ...sources);
}

(selection as any).tippyDefaultConfig = {
  allowHTML: true,
  animation: "scale", //'fade', 'shift-away', 'scale',
  animateFill: false,
  theme: "dark kshf-tooltip",
  arrow: roundArrow,
  delay: [500, 50],
  duration: [350, 250],
  maxWidth: 350, // max-width of the tippy box
  placement: "auto",
  popperOptions: {
    modifiers: [
      {
        name: "flip",
        enabled: true,
        options: {
          padding: 10,
        },
      },
    ],
  },
};

selection.prototype.tooltip = function (param1, param2) {
  var config = param2 ? param2 : typeof param1 === "object" ? param1 : null;
  var title = param2 ? param1 : typeof param1 === "object" ? null : param1;

  // this ensures that tooltips are visible if the dashboard is made full-screen
  var appendTo = Base.browser ? Base.browser.DOM.root.node() : document.body;

  var tippyConfig = Object.assign(
    { appendTo: appendTo },
    (selection as any).tippyDefaultConfig
  );
  mergeDeep(tippyConfig, config);
  tippyConfig.popperOptions.modifiers[0].options.boundariesElement =
    tippyConfig.appendTo;

  if (title) {
    if (typeof title === "string") {
      title = DOMPurify.sanitize(title);
      //
    } else if (typeof title === "function") {
      tippyConfig.onShow = (instance) => {
        instance.reference.tippy.setContent(
          DOMPurify.sanitize(title(instance.reference.__data__))
        );
        return true;
      };
    }
  }

  this.each(function () {
    if (this.tippy) {
      this.tippy.destroy();
    }
    this.tippy = tippy(this, tippyConfig);
    if (typeof title === "string") {
      this.tippy.setContent(title);
    }
  });

  return this;
};

function htmlRemove() {
  this.innerHTML = "";
}
function htmlConstant(value) {
  return function () {
    this.innerHTML = DOMPurify.sanitize(value);
  };
}
function htmlFunction(value) {
  return function () {
    var v = value.apply(this, arguments);
    this.innerHTML = v == null ? "" : DOMPurify.sanitize(v);
  };
}
selection.prototype.html = function (value) {
  return arguments.length
    ? this.each(
        value == null
          ? htmlRemove
          : (typeof value === "function" ? htmlFunction : htmlConstant)(value)
      )
    : this.node().innerHTML;
};

interface D3Selection<T1 extends d3.BaseType, T2, T3 extends d3.BaseType, T4> extends d3.Selection<T1, T2, T3, T4> {
  tooltip(arg1: any, arg2: any): d3.Selection<T1, T2, T3, T4>;
};

export { select, selection, pointer, D3Selection };
