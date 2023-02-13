import { Attrib } from "../Attrib";
import { Attrib_Categorical } from "../Attrib_Categorical";
import { Attrib_Numeric } from "../Attrib_Numeric";
import { Attrib_RecordGeo } from "../Attrib_RecordGeo";
import { Attrib_Timeseries } from "../Attrib_Timeseries";
import { Attrib_Timestamp } from "../Attrib_Timestamp";

import { Base } from "../Base";
import { Browser } from "../Browser";
import { i18n } from "../i18n";
import { mapStandardsMenuOpts } from "../MapStandards";
import { Modal } from "./Modal";

export var MenuOpts = {
  /** -- */
  AttribPanel: {
    name: "Options",
    items: [
      {
        id: "CollapseAll",
        name: "Collapse All",
        iconClass: "fa fa-caret-up",
        do: (dashboard: Browser) => dashboard.collapseAttribListGroups(true),
      },
      {
        id: "ExpandAll",
        name: "Expand All",
        iconClass: "fa fa-caret-down",
        do: (dashboard: Browser) => dashboard.collapseAttribListGroups(false),
      },
      {
        id: "SetAttribPanelWidth",
        name: "Set panel width",
        iconClass: "far fa-arrows-h",
        do: (dashboard: Browser) => {
          var x = Modal.prompt(
            "Enter width in pixels (between 200 and 400)",
            dashboard.attribPanelWidth
          );
          if (x) dashboard.setAttribPanelWidth(x);
        },
      },
    ],
  },

  /** -- */
  Attrib_Grouping: {
    name: "Settings",
    items: [
      {
        id: "createTimeseries",
        name: "Create Timeseries",
        iconClass: "far fa-chart-line",
        when: () => true,
        do: (groupInfo, action) => {
          if (action === "prompt()") {
            action = Modal.prompt("Enter time index format");
            if (!action) return;
          }
          // todo: update it to retrieve from parameter, not global space.
          var dashboard = Base.browser;

          var chain = groupInfo.parents.slice();
          chain.push(groupInfo.name);

          var pathStr = chain.join("->");

          dashboard.onLoad[pathStr] = `${pathStr}->\${DATETIME(${action})}`;

          var newConfig = dashboard.exportConfig();
          // delete all the summaries which are indexed under this timeseries variable
          newConfig.summaries = newConfig.summaries.filter((cfg) => {
            var attrib = dashboard.attribWithName(cfg.name);
            if (!attrib) return false;
            if (attrib.block?.inDashboard) return true;
            return pathStr !== attrib.template.pathStr;
          });

          dashboard = Base.reloadWithNewConfig(dashboard, newConfig);
        },
        options: [
          { name: "YYYY", sampleValue: "2019", value: "%Y" },
          { name: "YYYY-MM", sampleValue: "2019-12", value: "%Y-%m" },
          {
            name: "YYYY-MM-DD",
            sampleValue: "2019-12-30",
            value: "%Y-%m-%d",
          },
          {
            name: "MM/DD/YYYY",
            sampleValue: "12/30/2019",
            value: "%m/%d/%Y",
          },
          { name: "MM/DD/YY", sampleValue: "12/30/16", value: "%m/%d/%y" },
          {
            name: "YYYY-MM-DD",
            sampleValue: "2019-12-30",
            value: "%Y-%m-%d",
          },
          { name: "<i>Custom</i>", value: "prompt()" },
        ],
      },
    ],
  },

  /** -- */
  Attribute: {
    name: "Settings",

    items: [
      // *************************
      {
        id: "renameAttrib",
        name: "Rename",
        iconClass: "far fa-pencil",
        helparticle: "5ea92f902c7d3a5ea54a1c35",
        when: (attrib: Attrib) => !attrib.hasTimeSeriesParent(),
        do: (attrib: Attrib) => {
          var x = Modal.prompt(
            "Please enter the new attribute name.",
            attrib.attribName
          );
          if (x) attrib.attribName = x;
        },
      },

      // *************************
      {
        id: "setDescription",
        name: "Set description",
        iconClass: "fa fa-info",
        helparticle: "5ea8b8dc2c7d3a5ea54a18ad",
        when: (attrib: Attrib) => !attrib.hasTimeSeriesParent(),
        do: (attrib: Attrib) => {
          var x = Modal.prompt(
            "Please enter a short description for this attribute.",
            attrib.description ? attrib.description : ""
          );
          if (x != null) attrib.description = x;
        },
      },

      // ****************************
      {
        id: "setUnitName",
        name: "Set unit-name",
        iconClass: "far fa-ellipsis-h",
        helparticle: "5e88f31404286364bc97d467",
        when: (attrib: Attrib) =>
          (attrib.type === "timeseries" || attrib.type === "numeric") &&
          !attrib.hasTimeSeriesParent(),
        do: (attrib: Attrib) => {
          var x = Modal.prompt(
            "Please enter the unit name",
            attrib.unitName || ""
          );
          if (x != null) attrib.unitName = x;
        },
      },

      {
        id: "convertDataType",
        name: "Convert data type",
        iconClass: "fa fa-wrench",
        options: [
          // SPLIT CATEGORIES
          {
            id: "cat_splitCat",
            name: "Multi-Cat. (Split by)",
            iconClass: "far fa-tags",
            helparticle: "5e88d4172c7d3a7e9aea63ac",
            when: (attrib: Attrib) =>
              attrib instanceof Attrib_Categorical && !attrib.isMultiValued,
            do: (attrib: Attrib_Categorical, action) => {
              if (action === "prompt()") {
                action = Modal.prompt("Enter split format");
                if (!action) return;
              }

              attrib.browser.onLoad.main[
                attrib.template.str
              ] = `SPLIT(${action})`;

              (window as any).dashboard = Base.reloadWithNewConfig(
                attrib.browser,
                attrib.browser.exportConfig()
              );
            },
            options: [
              {
                name: "Space",
                iconXML: "_",
                value: "\\s+",
                hint: "Any whitespace",
              },
              { name: "Comma", iconXML: ",", value: "\\s*,\\s*" },
              { name: "Semicolumn", iconXML: ";", value: "\\s*;\\s*" },
              { name: "Vertical-bar", iconXML: "|", value: "\\s*\\|\\s*" },
              { name: "Plus", iconXML: "+", value: "\\s*\\+\\s*" },
              { name: "Star", iconXML: "*", value: "\\s*\\*\\s*" },
              { name: "Custom", iconXML: "?", value: "prompt()" },
            ],
          },

          {
            id: "convertToCategorical",
            name: "Categorical",
            iconClass: "fa fa-tag",
            helparticle: "5e890d9104286364bc97d4ff",
            when: (attrib: Attrib) => attrib instanceof Attrib_Numeric && !attrib.timeseriesParent,
            do: (attrib: Attrib_Numeric) => {
              Modal.confirm(
                `Do you want to convert <i>${attrib.attribName}</i> to categorical data?`,
                "Convert"
              ).then(
                () => {
                  attrib.browser.onLoad.main[attrib.template.str] = "STR()";

                  var newConfig = attrib.browser.exportConfig();
                  newConfig.summaries
                    .filter((s) => s.name === attrib.attribName)
                    .forEach((s) => {
                      s.type = "categorical";
                    });
                  if (
                    newConfig.metric &&
                    newConfig.metric.summary === attrib.attribName
                  ) {
                    delete newConfig.metric;
                  }
                  (window as any).dashboard = Base.reloadWithNewConfig(
                    attrib.browser,
                    newConfig
                  );
                },
                () => {}
              );
            },
          },
          {
            id: "num_convertToTimestamp",
            name: "Timestamp",
            iconClass: "far fa-calendar-alt",
            helparticle: "5e88ec2c04286364bc97d44b",
            when: (attrib: Attrib) => attrib instanceof Attrib_Numeric && !attrib.timeseriesParent,
            do: (attrib: Attrib_Numeric, action) => {
              if (action === "prompt()") {
                action = Modal.prompt(
                  "Enter datetime format, using https://github.com/d3/d3-time-format#locale_format"
                );
                if (!action) return;
              }
              attrib.browser.onLoad.main[
                attrib.template.str
              ] = `DATETIME(${action})`;

              var newConfig = attrib.browser.exportConfig();
              newConfig.summaries
                .filter((s) => s.name === attrib.attribName)
                .forEach((s) => {
                  delete s.type;
                  delete s.showPercentiles;
                  delete s.skipZero;
                });

              (window as any).dashboard = Base.reloadWithNewConfig(
                attrib.browser,
                newConfig
              );
            },
            options: [
              { 
                name: "YYYY",
                sampleValue: "2019",
                value: "%Y"
              },
              {
                name: "Serial/Sheet date",
                sampleValue: "42010.2",
                value: "%sn",
              },
              // seconds since UNIX epoch
              {
                name: "UNIX epoch-sec",
                sampleValue: "1499310012",
                value: "%s",
              },
              // milliseconds since UNIX epoch
              {
                name: "UNIX epoch-ms",
                sampleValue: "1499310012000",
                value: "%Q",
              },
              { name: "<i>Custom</i>", sampleValue: "?", value: "prompt()" },
            ],
          },
          {
            id: "cat_convertToTimestamp",
            name: "Timestamp",
            iconClass: "far fa-calendar",
            helparticle: "5e88ec2304286364bc97d44a",
            when: (attrib: Attrib) =>
              attrib instanceof Attrib_Categorical &&
              !attrib.isMultiValued &&
              !attrib.catGeo,
            do: (attrib: Attrib_Categorical, action) => {
              if (action === "prompt()") {
                action = Modal.prompt(
                  "Enter datetime format, using https://github.com/d3/d3-time-format#locale_format"
                );
                if (!action) return;
              }
              attrib.browser.onLoad.main[
                attrib.template.str
              ] = `DATETIME(${action})`;

              var newConfig = attrib.browser.exportConfig();
              // Existing summary will have a "categorical" type. delete the type...
              newConfig.summaries
                .filter((s) => s.name === attrib.attribName)
                .forEach((c) => {
                  delete c.type;
                  delete c.catLabel;
                  delete c.catSortBy;
                  delete c.catGeo;
                  delete c.barHeight;
                  delete c.showSetMatrix;
                });

              (window as any).dashboard = Base.reloadWithNewConfig(
                attrib.browser,
                newConfig
              );
            },
            options: [
              {
                name: "YYYY",
                sampleValue: "2019",
                value: "%Y"
              },
              {
                name: "MM/DD/YYYY",
                sampleValue: "12/30/2019",
                value: "%m/%d/%Y",
              },
              {
                name: "DD/MM/YYYY",
                sampleValue: "30/12/2019",
                value: "%d/%m/%Y",
              },
              {
                name: "MM/DD/YY",
                sampleValue: "12/30/16",
                value: "%m/%d/%y",
              },
              {
                name: "YYYY-MM-DD",
                sampleValue: "2019-12-30",
                value: "%Y-%m-%d",
              },
              {
                name: "MM/DD/YYYY hh:mm",
                sampleValue: "12/30/2019 13:10",
                value: "%m/%d/%Y %H:%M",
              },
              {
                name: "DD/MM/YYYY hh:mm",
                sampleValue: "30/12/2019 13:10",
                value: "%d/%m/%Y %H:%M",
              },
              {
                name: "Date-Time-Z",
                sampleValue: "2018-07-02T16:24:36Z",
                value: "%Y-%m-%dT%H:%M:%S%Z",
              },
              { name: "<i>Custom</i>", value: "prompt()" },
            ],
          },
        ],
      },

      // ****************************
      // ADD MAP TO CATEGORY
      mapStandardsMenuOpts,

      // Extract single time key
      {
        id: "extractTimeKey",
        name: "Extract time key",
        iconClass: "far fa-calendar-day",
        when: (attrib: Attrib) => attrib instanceof Attrib_Timeseries,
        options: (attrib: Attrib_Timeseries) =>
          attrib.timeKeys
            .filter((timeKey) => !attrib.timeKeyAttribs[timeKey._time_src])
            .map((timeKey) => ({ name: timeKey._time_src, value: timeKey })),
        do: (attrib: Attrib_Timeseries, action) => {
          var _ = attrib.getTimepointSummary(action);
          _.block.addToPanel(attrib.browser.panels.left);
          attrib.browser.updateLayout();
        },
      },

      // *************************************
      // DERIVE
      {
        id: "deriveMenuOpt",
        name: "Generate",
        iconClass: "fa fa-share",
        when: (attrib: Attrib) => attrib.template.str, // not a custom function
        options: [
          {
            id: "deriveChangeOverTime",
            name: "Change over time",
            when: (attrib: Attrib) => {
              return (
                attrib instanceof Attrib_Timeseries &&
                !attrib.parent &&
                (!attrib.derivatives["TimeseriesChange-%"] ||
                  !attrib.derivatives["TimeseriesChange-#"])
              );
            },
            do: (attrib: Attrib_Timeseries, action) => {
              attrib.createDerivedAttrib(
                `Change(${action})`,
                `${attrib.attribName} - ${
                  action === "%" ? "Percent" : "Absolute"
                } Change`
              );
            },
            options: (attrib: Attrib_Timeseries) => {
              var r = [];
              if (!attrib.derivatives["TimeseriesChange-%"]) {
                r.push({ name: "% Percent change", value: "%" });
              }
              if (!attrib.derivatives["TimeseriesChange-#"]) {
                r.push({ name: "# Absolute change", value: "#" });
              }
              return r;
            },
          },

          {
            id: "time_deriveComponent",
            name: "Time unit",
            iconClass: "far fa-calendar",
            when: (attrib: Attrib) => attrib instanceof Attrib_Timestamp,
            do: (attrib: Attrib_Timestamp, action) =>
              attrib.createDerivedAttrib(action),
            // and time-typed in selected resolution,
            // and not have the specific derived summary
            options: [
              {
                id: "time_deriveYear",
                name: "Year",
                when: (attrib: Attrib_Timestamp) => attrib.timeTyped.year && !attrib.derivatives.Year,
                value: "Year()",
              },
              {
                id: "time_deriveMonth",
                name: "Month",
                when: (attrib: Attrib_Timestamp) => attrib.timeTyped.month && !attrib.derivatives.Month,
                value: "Month()",
              },
              {
                id: "time_deriveDayOfMonth",
                name: "Day of Month",
                when: (attrib: Attrib_Timestamp) => attrib.timeTyped.day && !attrib.derivatives.DayOfMonth,
                value: "DayOfMonth()",
              },
              {
                id: "time_deriveWeekday",
                name: "Weekday",
                when: (attrib: Attrib_Timestamp) => attrib.timeTyped.day && !attrib.derivatives.WeekDay,
                value: "WeekDay()",
              },
              {
                id: "time_deriveHour",
                name: "Hour",
                when: (attrib: Attrib_Timestamp) => attrib.timeTyped.hour && !attrib.derivatives.Hour,
                value: "Hour()",
              },
            ],
          },

          {
            id: "cat_deriveDegree",
            name: "Degree (# of)",
            iconClass: "far fa-hashtag",
            when: (attrib: Attrib) =>
              attrib instanceof Attrib_Categorical && attrib.isMultiValued && !attrib.derivatives.Degree,
            do: (attrib: Attrib_Categorical) => attrib.createDerivedAttrib("Degree()"),
          },
        ],
      },

      // Positive
      {
        id: "num_keepPositive",
        name: "Keep positive (>0) values",
        iconClass: "fa fa-plus",
        when: (attrib: Attrib) =>
          attrib instanceof Attrib_Numeric &&
          attrib.rangeOrg[0] <= 0,
        do: (attrib: Attrib_Numeric) => {
          Modal.confirm(
            `Do you want to remove zero-values from <i>${attrib.attribName}</i>?`,
            "Remove"
          ).then(
            () => {
              attrib.browser.onLoad.main[attrib.template.str] = "POSITIVE()";
              (window as any).dashboard = Base.reloadWithNewConfig(
                attrib.browser,
                attrib.browser.exportConfig()
              );
            },
            () => {}
          );
        },
      },

      // ****************************
      {
        id: "CompareSelectionControl",
        name: "Comparable",
        iconClass: "fa fa-clone",
        do: (attrib: Attrib, action: boolean) => attrib.isComparable.set(action),
        options: [
          {
            name: "Enable",
            value: true,
            iconClass: "far fa-check",
            active: (attrib: Attrib) => attrib.isComparable.is(true),
          },
          {
            name: "Disable",
            value: false,
            iconClass: "far fa-times",
            active: (attrib: Attrib) => !attrib.isComparable.is(true),
          },
        ],
      },
      // ****************************
      {
        id: "aggregateFunctions",
        name: "Aggregation",
        iconClass: "fa fa-cubes",
        helparticle: "5e8944dd04286364bc97d5f0",
        when: (attrib: Attrib) => attrib.canHaveMetricFuncs && !attrib.hasTimeSeriesParent(),
        options: [
          {
            name: "Average",
            do: (attrib: Attrib, action: boolean) => {
              if (action) {
                attrib.addSupportedMetricFunc("Avg");
              } else {
                attrib.removeSupportedMetricFunc("Avg");
              }
            },
            options: [
              {
                name: "Enabled",
                value: true,
                iconClass: "far fa-check",
                active: (attrib: Attrib) => attrib.supportedMetricFuncs.includes("Avg"),
              },
              {
                name: "Disabled",
                value: false,
                iconClass: "far fa-times",
                active: (attrib: Attrib) => !attrib.supportedMetricFuncs.includes("Avg"),
              },
            ],
          },
          {
            name: "Sum",
            do: (attrib: Attrib, action: boolean) => {
              if (action) {
                attrib.addSupportedMetricFunc("Sum");
              } else {
                attrib.removeSupportedMetricFunc("Sum");
              }
            },
            options: [
              {
                name: "Enabled",
                value: true,
                iconClass: "far fa-check",
                active: (attrib: Attrib) => attrib.supportedMetricFuncs.includes("Sum"),
              },
              {
                name: "Disabled",
                value: false,
                iconClass: "far fa-times",
                active: (attrib: Attrib) => !attrib.supportedMetricFuncs.includes("Sum"),
              },
            ],
          },
        ],
      },

      // Delete map modification
      {
        id: "removeMap",
        name: "Remove map",
        iconClass: "far fa-undo",
        when: (attrib: Attrib) =>
          attrib instanceof Attrib_Categorical && attrib.catGeo !== null,
        do: (attrib: Attrib_Categorical) => attrib.removeCatGeo(),
      },

      // Delete derivative
      {
        id: "removeDerive",
        name: "Remove derivation",
        iconClass: "far fa-undo",
        when: (attrib: Attrib) => attrib.template.special,
        do: (attrib: Attrib) => attrib.destroy(),
      },

      // Delete derived information
      {
        id: "removeRecordGeo",
        name: "Remove record geography",
        iconClass: "far fa-undo",
        when: (attrib: Attrib) => attrib instanceof Attrib_RecordGeo,
        do: (attrib: Attrib_RecordGeo) => {
          attrib.destroy();
          (window as any).dashboard = Base.reloadWithNewConfig(
            attrib.browser,
            attrib.browser.exportConfig()
          );
        },
      },

      // Delete onLoad modification
      {
        id: "removeModification",
        name: "Remove modification",
        iconClass: "far fa-undo",
        when: (attrib: Attrib) => !!attrib.browser.onLoad.main[attrib.template.str],
        do: (attrib: Attrib) => {
          var name = attrib.template.str;
          Modal.confirm(
            `Do you want to delete the modification ${attrib.browser.onLoad.main[name]} ?`,
            i18n.Delete
          ).then(() => {
            delete attrib.browser.onLoad.main[name];
            (window as any).dashboard = Base.reloadWithNewConfig(
              attrib.browser,
              attrib.browser.exportConfig()
            );
          });
        },
      },

      {
        id: "setAsRecordID",
        name: "Set as record ID",
        iconClass: "far fa-fingerprint",
        when: (attrib: Attrib) => {
          if (attrib.attribName === attrib.browser.idSummaryName)
            return false;
          return (
            attrib._aggrs &&
            attrib._aggrs.length === attrib.browser.records.length &&
            !attrib.template.special
          );
        },
        do: (attrib: Attrib) => {
          if (!attrib.template.str) {
            Modal.alert("Not supported. [756]");
            return;
          }
          var newConfig = attrib.browser.exportConfig();
          newConfig.source[0].id = attrib.template.str;
          newConfig.summaries = newConfig.summaries.filter(
            (s) => s.name !== attrib.browser.idSummaryName
          );

          (window as any).dashboard = Base.reloadWithNewConfig(attrib.browser, newConfig);
        },
      },
    ],
  },
};
