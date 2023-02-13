import * as Popper from "@popperjs/core";
import { select } from "../d3_select";

import { Base } from "../Base";
import { i18n } from "../i18n";

const d3 = { select };

declare let window: any;

export class Modal {
  /** -- */
  static alert(message, header = "") {
    return new Promise((resolve, reject) => {
      var _wrapper;
      if (Base.browser) {
        _wrapper = Base.browser.DOM.overlay_wrapper;
      } else {
        Base.DOM.Modal = d3
          .select("body")
          .append("div")
          .attr("class", "kshf kshf_Modal");
        _wrapper = Base.DOM.Modal.append("div").attr(
          "class",
          "overlay_wrapper"
        );
      }
      var _root = _wrapper
        .append("div")
        .attr("class", "overlay_content overlay_modal")
        .html(`<div class='overlay_Header'>${header}<i class='fa fa-warning'></i></div>
          <div class='overlay_Content'>${message}</div>
          <div class='ModalButtons'>
            <div class='modalButton confirmButton'>${i18n.OK}</div>
          </div>`);

      Modal.createHelpScoutLinks(_root, true);

      _wrapper.attr("show", "modal");

      _root.select(".confirmButton").on("click", (event) => {
        Modal._removeModal(_wrapper);
        if (resolve) resolve(true);
      });
    });
  }

  /** -- */
  static confirm(message, okText, cancelText = null) {
    return new Promise((resolve, reject) => {
      var _wrapper;
      if (Base.browser) {
        _wrapper = Base.browser.DOM.overlay_wrapper;
      } else {
        // there's no keshif browser, attach to main body of the page.
        Base.DOM.Modal = d3
          .select("body")
          .append("div")
          .attr("class", "kshf kshf_Modal");
        _wrapper = Base.DOM.Modal.append("div").attr(
          "class",
          "overlay_wrapper"
        );
      }

      _wrapper.attr("show", "modal");

      var _root = _wrapper
        .append("div")
        .attr("class", "overlay_content overlay_modal")
        .html(`<div class='overlay_Header'><i class='fa fa-question-circle'></i></div>
          <div class='overlay_Content'>${message}</div>
          <div class='ModalButtons'>
            <div class='modalButton confirmButton'>${okText || i18n.OK}</div>
            <div class='modalButton rejectButton'>${
              cancelText || i18n.Cancel
            }</div>
          </div>
          `);

      _root.select(".confirmButton").on("click", (event) => {
        Modal._removeModal(_wrapper);
        resolve(new MouseEvent(event.type, event));
      });
      _root.select(".rejectButton").on("click", () => {
        Modal._removeModal(_wrapper);
        if (reject) reject(false);
      });
    });
  }

  /** -- */
  static prompt(message: string, _default?: any) {
    return window.prompt(message, _default);
    // TO-DO: Make it a promise & modal dialogue box
  }

  /** -- */
  static autoChanges(_changes) {
    return new Promise(function (resolve, reject) {
      var _wrapper;
      if (Base.browser) {
        _wrapper = Base.browser.DOM.overlay_wrapper;
        _wrapper.selectAll(".overlay_modal").remove();
      } else {
        Base.DOM.Modal = d3
          .select("body")
          .append("div")
          .attr("class", "kshf kshf_Modal");
        _wrapper = Base.DOM.Modal.append("div").attr(
          "class",
          "overlay_wrapper"
        );
      }
      var _root = _wrapper
        .append("div")
        .attr("class", "overlay_content overlay_modal").html(`
          <div class='overlay_Header'>Review Changes <i class='fa fa-question-circle'></i></div>
          <div class='overlay_Content'></div>
          <div class='ModalButtons'>
            <div class='modalButton confirmButton'>OK</div>
            <div class='modalButton rejectButton'>Cancel</div>
          </div>
          `);

      _wrapper.attr("show", "modal");
      var _ = _root.select(".overlay_Content");

      _.html("").style("text-align", "left"); // clear content

      _.append("div").html("We identified the following potential changes: ");

      var changeList = _.append("table").attr("class", "changeList");
      var __ = changeList
        .selectAll(".changeRow")
        .data(_changes)
        .enter()
        .append("tr")
        .attr("class", "changeRow");

      __.append("td")
        .attr("class", "changeIcon")
        .html((d) => d.i);
      __.append("td")
        .attr("class", "changeText")
        .html((d) => d.q);
      var _t = __.append("td").attr("class", "changeToggle");
      _t.append("input")
        .attr("class", "theToggleInput")
        .attr("type", "checkbox")
        .attr("checked", (d) => {
          return d.change ? true : null;
        })
        .attr("id", (_, i) => {
          return "toggle_" + i;
        })
        .on("change", (event, d) => {
          d.change = !d.change;
        });
      _t.append("label")
        .attr("class", "theToggleLabel")
        .attr("for", (_, i) => {
          return "toggle_" + i;
        });

      _root.select(".confirmButton").on("click", () => {
        _wrapper.attr("show", "none");
        _root.classed("modalAlert", false);
        if (Base.DOM.Modal) Base.DOM.Modal.remove();
        if (resolve) resolve(_changes);
      });
      _root.select(".rejectButton").on("click", () => {
        _wrapper.attr("show", "none");
        _root.remove();
        if (Base.DOM.Modal) Base.DOM.Modal.remove();
        if (reject) reject(false);
      });
    });
  }

  /** -- */
  static _removeModal(_wrapper) {
    _wrapper.select(".overlay_modal").remove();
    // Keshif-dashboard
    if (_wrapper.selectAll(".overlay_modal").nodes().length === 0) {
      _wrapper.attr("show", "none");
    }
    // Non-Keshif modal window
    Base.DOM.Modal?.remove();
  }

  /** -- */
  static popupMenu(event, template, param, opts: {placement} = null) {
    var dashRootDOM = Base.browser.DOM.root;

    if (
      Base.popupInstance &&
      Base.popupInstance.state.elements.reference === event.target
    ) {
      return;
    }

    // remove existing popup menu
    if (dashRootDOM.select(".contextMenu")) {
      dashRootDOM.select(".contextMenu").remove();
    }

    var contextMenu = dashRootDOM.append("div").attr("class", "contextMenu");

    var contextArrow = contextMenu.append("div").attr("class", "popperArrow");

    var removePopper = () => {
      contextMenu.remove();
      if (Base.popupInstance) {
        var t = Base.popupInstance.state.elements.reference;
        while (t && t.classList) {
          t.classList.remove("popupVisible");
          t = t.parentNode;
        }
      }
      Base.popupInstance = null;
    };

    Base.popupInstance = Popper.createPopper(
      event.currentTarget, // reference
      contextMenu.node(), // popper
      {
        placement: opts?.placement ?? "right-start",
        strategy: "absolute",
        modifiers: [
          {
            name: "flip",
            enabled: true,
          },
          {
            name: "offset",
            options: {
              offset: [0, 8],
            },
          },
          {
            name: "arrow",
            options: {
              element: contextArrow.node(),
              padding: 4,
            },
          },
        ],
      }
    );

    contextMenu
      .append("div")
      .attr("class", "popupMenu_Close")
      .tooltip(i18n.Close)
      .html("<i class='fa fa-window-close'></i>")
      .on("click", () => removePopper());

    contextMenu
      .append("div")
      .attr("class", "contextMenu_Header")
      .html(i18n[template.name]);

    var contextMenu_Items = contextMenu
      .append("div")
      .attr("class", "contextMenu_Items");

    contextMenu_Items.selectAll(".popupMenuItem").remove();

    var isWhen = (item) => !item.when || item.when(param);

    var isApplicable = (item) => {
      // we know it's not applicable
      if (item.when && !item.when(param)) return false;

      // no options, just check current item
      if (!item.options) return isWhen(item);

      // convert from function to proper list
      var _options = item.options;
      if (typeof item.options === "function") {
        if (!isWhen(item)) return false;
        _options = item.options(param);
      }

      return _options.some(isApplicable) && isWhen(item);
    };

    var addTitleText = (_) => {
      _.filter((item) => item.iconClass)
        .append("span")
        .attr("class", "popupMenuItem_Header_Icon")
        .append("span")
        .attr("class", (item) => item.iconClass);

      _.filter((item) => item.iconXML)
        .append("span")
        .attr("class", "popupMenuItem_Header_Icon")
        .html((item) => item.iconXML);

      _.append("span")
        .attr("class", "popupMenuItem_Header_Text")
        .call((header) => {
          header
            .append("div")
            .attr("class", "mainText")
            .html((item) => i18n[item.name]);
          header
            .filter((item) => item.sampleValue)
            .append("div")
            .attr("class", "sampleValue")
            .html((item) => i18n[item.sampleValue]);
        });

      _.filter((item) => item.helparticle)
        .append("span")
        .attr("class", "helparticle fal fa-question-circle")
        .attr("data-helparticle", (item) => item.helparticle)
        .tooltip(i18n["Learn more"], { placement: "bottom" })
        .on("click", (event, item) => {
          Modal.attachHelpScout().then(() =>
            window.Beacon("article", item.helparticle, { type: "modal" })
          );
          event.stopPropagation();
          event.preventDefault();
        });

      _.filter((item) => item.options)
        .append("i")
        .attr("class", "expandCollapseIcon fa fa-caret-down");

      _.each((item, i, nodes) => {
        if (item.onName) item.onName(nodes[i]);
      });
    };

    function insertChildItems(DOM, items, parentD = null) {
      DOM.selectAll(".popupMenuItem")
        .data(items.filter(isApplicable))
        .enter()
        .append("div")
        .attr("class", "popupMenuItem")
        .classed("expanded", (item) => item.expanded)
        .attr("data-itemID", (item) => item.id || null)
        .call((_) => {
          _.append("div")
            .attr("class", "popupMenuItem_Header")
            .classed("active", (item) => {
              if (item.active) {
                if (typeof item.active === "function") {
                  return item.active(param);
                } else {
                  return !!item.active;
                }
              }
            })
            .each((d2) => {
              d2.parentD = parentD;
            })
            .on("click", processItem)
            .call(addTitleText);
          _.append("div")
            .attr("class", "popupMenuItem_Children")
            .each((item, i, nodes) => {
              if (item.expanded) {
                // do not over-write this.
                // the options function, if there is, need to be dynamically evaluated every time.
                var _options = item.options;
                if (typeof item.options === "function" && isWhen(item))
                  _options = item.options(param);

                insertChildItems(d3.select(nodes[i]), _options, item);
              }
            });
        });
    }

    function processItem(_event, item) {
      var _path = [],
        t;
      for (t = item.parentD; t; t = t.parentD) {
        _path = [t.name].concat(_path);
      }

      if (!item.options) {
        // find the "do" function in hierarchy, and execute it
        for (var curNode = item; curNode; curNode = curNode.parentD) {
          if (curNode.do) {
            curNode.do(param, item.value, _path);
            break;
          }
        }
        removePopper();
        return;
      }

      // has options
      _path.push(item.name);

      // swap expanded setting
      this.parentNode.classList.toggle("expanded");

      var _ = d3.select(this.parentNode);
      if (_.classed("expanded")) {
        // close all items
        //contextMenu_Items.selectAll(".popupMenuItem").classed("expanded",false);
        // but, enable current item
        var children = d3.select(this.parentNode.childNodes[1]);
        children.selectAll(".popupMenuItem").remove();

        // do not over-write this.
        // the options function, if there is, need to be dynamically evaluated every time.
        var _options = item.options;
        if (typeof item.options === "function" && isWhen(item))
          _options = item.options(param);

        insertChildItems(children, _options, item);
      }

      Base.popupInstance.update();
    }

    insertChildItems(contextMenu_Items, template.items);

    Base.popupInstance.update();

    setTimeout(() => contextMenu.classed("visible", true), 10);
  }

  /** -- */
  static helpUI() {
    return Modal.attachHelpScout().then(() => window.Beacon("open"));
  }

  /** -- */
  static createHelpScoutLinks(dom, withTooltip = false) {
    dom = dom.selectAll("[data-helparticle]");

    dom.on("click", (event) => {
      var articleID = event.currentTarget.dataset.helparticle;
      if (!articleID) return;
      Modal.attachHelpScout().then(() =>
        window.Beacon("article", articleID, { type: "modal" })
      );
    });

    if (withTooltip) {
      dom.tooltip(i18n["Learn more"]);
    }
  }
  /** -- */
  static attachHelpScout() {
    if (!window.Beacon) {
      (window.Beacon = function (t, n, a) {
        window.Beacon.readyQueue.push({ method: t, options: n, data: a });
      }),
        (window.Beacon.readyQueue = []);
    }

    return import("https://beacon-v2.helpscout.net/")
      .then(() => {
        if (!window.Beacon.readyQueue) return;
        window.Beacon("init", Base.helpscoutBeacon);

        if (window.firebase && window.firebase.auth) {
          var user = window.firebase.auth().currentUser;
          if (user) {
            window.Beacon("identify", {
              name: user.displayName || user.email,
              email: user.email,
              avatar: user.photoURL,
              uid: user.uid,
              portal_name: "TODO",
            });
          }
        }
      })
      .catch(() => {
        Modal.alert(
          "Script blocking extensions (Adblock, NoScript, uBlock, ...)<br>" +
            "may be blocking our embedded help system. " +
            "<a href='https://docs.helpscout.net/article/911-beacon-ad-blockers' target='_blank'>Learn more</a>",
          "<i class='fal fa-frown'></i> Cannot display the help."
        );
        throw new Error();
      });
  }
}
