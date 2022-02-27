import { Base } from "./Base";

export default class i18n_EN {
  constructor() {
    this.LANG_NAME = "English";

    this.LoadingData = "Loading data...";
    this.CreatingBrowser = "Creating Dashboard...";
    this.Close = "Close";
    this.Help = "Help";

    this.RemoveFilter = "Remove filter";
    this.RemoveHighlight = "Remove highlight";
    this.RemoveAllFilters = "Remove all filters";
    this.LockToCompare = "Compare";
    this.Unlock = "Remove comparison";
    this.CompareTopCategories = "Compare top categories";
    this.Compare = "Compare";

    (this.LockCrumbMode = (stacked) =>
      `<b>${
        stacked ? "Stacked" : "Side-by-side"
      } charts</b><br> are used for comparison.<br><br>
        Click to switch to ${stacked ? "side-by-side" : "stacked"} charts.`),
      (this.SideBySide = "Side-by-Side");
    this.Stacked = "Stacked";
    this.GroupView = "Group-View";

    this.CollapseSummary = "Close";
    this.OpenSummary = "Open";
    this.ExpandSummary = "Maximize";
    this.RemoveSummary = "Remove";

    this.Confirm = "Confirm";
    this.Cancel = "Cancel";
    this.OK = "OK";
    this.Delete = "Delete";

    this.NoAttribute = "(None)";

    this["No [Record]"] = "No";

    this["Absolute (Breakdown)"] = "Absolute";

    this.SetPairTitle = (v) => `${v}->Relations`;

    this.DialogSideBySideCharts =
      "<u class='learnIcon' data-helparticle='5e88ff692c7d3a7e9aea6475'>Stacked charts</u>";
    this.DialogStackedCharts =
      "<u class='learnIcon' data-helparticle='5e88ff692c7d3a7e9aea6475'>Stacked charts</u>";
    this.DialogComparisonSelection =
      "<u class='learnIcon' data-helparticle='5e8905262c7d3a7e9aea6483'>Compare-selection</u>";
    this.DialogRelativeBreakdown =
      "<u class='learnIcon' data-helparticle='5e8944932c7d3a7e9aea659c'>%-of-groups breakdown</u>";
    this.DialogDependentBreakdown =
      "<u class='learnIcon' data-helparticle='5e8944812c7d3a7e9aea659b'>%-of-compared breakdown</u>";

    (this.DialogEmptyResultSet =
      "Removing this category will create an empty result list."),
      (this.DialogChangeCompare = (_to, _from) =>
        `To compare by <i>${_to}</i>,<br> we need to remove the current comparison on <i>${_from}</i>.`);
    this.DialogStackedMultiValue = (_name) =>
      this.DialogStackedCharts +
      ` cannot be enabled while comparing on<br> multi-valued categorical attribute:<br><i>${_name}</i>.`;
    this.DialogSideBySideSingleValue = (_name) =>
      this.DialogSideBySideCharts +
      ` cannot be enabled while comparing on<br> single-valued categorical attribute:<br><i>${_name}</i><br>using ${this.DialogRelativeBreakdown}.`;
    this.DialogCompareForRelative = `Apply ${this.DialogComparisonSelection} first before switching to ${this.DialogRelativeBreakdown}.`;
    this.ComparedSelectionsLimit =
      "You cannot compare across more than five data groups.";

    this.ZoomLevelWarning =
      "" +
      "Your current browser zoom level may not be optimal for charting.<br>" +
      "For best results, " +
      "<span class='link attemptToFix'><i class='fa fa-magic'></i>click here to fix and refresh</span>, or<br>" +
      "if issue persists, manually reset your browser zoom and refresh the page.<br>" +
      "<a class='link' style='font-weight: 300' href='https://help.keshif.me/article/49-resolving-chart-display-issues'>" +
      "More info</a>";

    this.MeasureDescrLabel = (dashboard, summary) => {
      var measureText_simple = dashboard.measureFunc_Count
        ? ""
        : dashboard.measureFunc +
          " of " +
          dashboard.measureSummary.val.printName;

      var measureText = measureText_simple || dashboard.recordName;

      var _all = dashboard.isFiltered() ? "filtered" : "all";

      var measureText_all =
        measureText_simple || _all + " " + dashboard.recordName;

      var comparedBy = dashboard.comparedSummary
        ? dashboard.comparedSummary.printName
        : null;

      var breakdown = dashboard.breakdownMode.val;

      if (breakdown == "absolute") {
        return measureText + (comparedBy ? " by " + comparedBy : "");
      }

      // PERCENTAGE-BASED BREAKDOWN

      if (!comparedBy) {
        return "% of " + measureText_all;
      }

      var summaryName = summary.printName;

      if (breakdown == "dependent") {
        return summaryName + " % , out of " + comparedBy + measureText_simple;
      }
      if (breakdown == "relative") {
        return comparedBy + " % , out of " + summaryName + measureText_simple;
      }
      if (breakdown == "total") {
        return "Combined % , out of " + measureText_all;
      }
    };

    this.measureText = (dashboard) => {
      if (dashboard.measureFunc_Count) return dashboard.recordName;
      return (
        dashboard.measureFunc + " of " + dashboard.measureSummary.val.printName
      );
    };

    this.measureText_2 = (dashboard) => {
      if (dashboard.measureFunc_Count) return "";
      return (
        dashboard.measureFunc +
        " of " +
        dashboard.measureSummary.val.printName +
        " of "
      );
    };

    this.ListButton = "List";
    this.MapButton = "Map";
    this.NodeButton = "Node-Link";
    this.TimeSeriesButton = "Time";
    this.ScatterButton = "Scatter";
    this.RecordViewTypeTooltip = (v) =>
      `View ${Base.browser.recordName} on <br><b>${v}</b> chart`;

    this.Boost_NoSuggestions = "No suggested changes. Explore on!";

    this.TooltipOne = (_v, dashboard) => `${dashboard.getValueLabel(
      _v,
      false,
      1,
      true
    )} of
        ${dashboard.isFiltered() ? dashboard.getFilteredSummaryText() : "all"}
        ${dashboard.recordName}`;

    this.Tooltip_OutOf = (_v, dashboard) => {
      var str = "";
      if (dashboard.absoluteBreakdown) return str;

      str += "<div class='percentageExplainer'>";
      if (dashboard.relativeBreakdown) {
        str += "% out of <i>" + _v + "</i>";
      } else if (dashboard.dependentBreakdown) {
        str += "% out of <i>" + dashboard.comparedSummary.printName + "</i>";
      } else {
        str += "% out of all";
      }
      str += "</div>";
      return str;
    };

    this.Size = "Size";
    this.Larger = "Larger";
    this.Smaller = "Smaller";
    this.Pairs = "Pairs";

    this.Color = "Color";
    this.InvertColorTheme = "Invert color theme";
    this.ChangeColorTheme = "Change color theme";

    this.ReverseOrder = "Reverse order";
    this.Reorder = "Reorder";
    this.SwapAxis = "Swap axis";
    this.Percentiles = "Percentiles";

    this.OpenDataSource = "Open Data Source";
    this.ShowInfoCredits = "Info";
    this.ShowFullscreen = "Fullscreen";
    this.PrintButton =
      "Click to activate print style<br><b>Shift+click</b> to print.";

    this.Search = "Search";
    (this.TextSearchForRecords = `Type to search and highlight.<br><br>+
        <b><u>Enter</u></b> to filter <i class="fa fa-filter"></i>`),
      (this.ClearTextSearch = "Clear");
    this.Rows = "Rows";
    this.More = "More";
    this.ScrollToTop = "Top";
    this.Percent = "Percent";
    this.Absolute = "Absolute";
    this.Relative = "Relative";
    this.Dependent = "Dependent";
    this.Breakdown = "Breakdown";
    this.BreakdownBy = "Breakdown by";
    this.Total = "Prozentuale";
    this.SeeBreakdown = (v) =>
      `See <b>${this[v.charAt(0).toUpperCase() + v.slice(1)]}</b> Breakdown`;
    this.DragToFilter = "Drag";
    this.And = "And";
    this.Or = "Or";
    this.Not = "Not";
    this.NoData = "Missing data";
    this.ValidData = "Valid data";
    this.KeepNoData = "Keep missing data";
    this.KeepValidData = "Keep valid data";

    this.ZoomToFit = "Zoom to fit";
    this.ZoomIn = "Zoom In";
    this.ZoomOut = "Zoom Out";

    this.MeasureScale = "Scale";
    this.RowHeight = "Bar Height";
    this.RowOrder = "Order";

    this.Charts = "Charts";
    this.Charts_Histogram = "Histogram";
    this.Charts_Percentiles = "Percentiles";

    this.BinScale = "Value Axis Scale";

    this.BinWidth = "Bin Width";
    this.BinWidth_Narrow = "Narrow";
    this.BinWidth_Medium = "Medium";
    this.BinWidth_Wide = "Wide";

    this.BinHeight = "Height";
    this.BinHeight_Compact = "Compact";
    this.BinHeight_Short = "Short";
    this.BinHeight_Medium = "Medium";
    this.BinHeight_Tall = "Tall";

    this.DashboardAnalyticsConfig = "Dashboard Configuration";
    this.ViewAsMap = "View as Map";
    this.ViewAsList = "View as List";
    this.ViewSetMatrix = "Show/Hide pair-wise relations";

    this.MissingLocations = "Missing<br>Locations";
    this.Reset = "Reset";

    this.measure_Sum = "Sum";
    this.measure_Avg = "Average";
    this.measure_Count = "Count";

    this.Of_NumberRecord = "of";

    this.AutoPlay = "Autoplay";
    this.StopAutoPlay = "Stop Autoplay";

    this.SaveSelection = "Save selection";
    this.EditFormula = "Edit formula";

    this.Attributes = "Attributes";
    this.DatasetButton = "Attributes";
    this.AdjustButton = "Adjust";

    this.SaveShareButton = "Save";

    this.CategoricalAttribute = "Categorical";
    this.NumericAttribute = "Numeric";
    this.TimestampAttribute = "Timestamp";
    this.TimeseriesAttribute = "Timeseries";
    this.LocationAttribute = "Geographic";
    this.UnknownAttribute = "Unknown";
    this.UniqueAttribute = "Unique";
    this.MultiValuedAttribute = "Multi-valued";
    this.FunctionAttribute = "Uses Custom Function";
    this.ContentAttribute = "Content";

    this.Configure = "Configure";
    this.Derive = "Derive";

    // Adjust
    this.EditTitle = "Rename";
    this.RemoveRecordPanel = "Remove record panel";

    this.EmptyDashboardNotice = `To add data into the dashboard : <br><br>
          <i class='far fa-angle-double-down'></i> switch to <span style='font-weight: bolder'>Author</span> mode,<br>and <br>
          <i class='far fa-angle-double-left'></i> double-click, or
          click+drag an attribute into this canvas.
          <br> <img class='kshfLogo_K'>`;

    this.LinearSequence =
      "<span style='font-size:0.8em; opacity: 0.75'>(1,2,3,4)</span>";
    this.Log2Sequence =
      "<span style='font-size:0.8em; opacity: 0.75'>(1,2,4,8)</span>";
    this.Log10Sequence =
      "<span style='font-size:0.8em; opacity: 0.75'>(1,10,100)</span>";

    this.Error_CannotFindMap = mapName => `<i class='fal fa-frown'></i> We could not find the map [${mapName}].`;
    this.Error_CannotLoadMap = mapName => `<i class='fal fa-frown'></i> We could not load the map [${mapName}].`;
    this.Error_CannotMatchMap = mapName => `<i class='fal fa-frown'></i> We could not match any location name with the map [${mapName}].`;

    // Platform-specific
    this.RemoveDataset = "Remove Dataset";
    this.Bookmark = "Bookmark<br><i>Shift+Click to delete</i>";
    // Keeping these because they are referenced from lang table to create derived summaries
    this.Lookup_Months = {
      0: "January",
      1: "February",
      2: "March",
      3: "April",
      4: "May",
      5: "June",
      6: "July",
      7: "August",
      8: "September",
      9: "October",
      10: "November",
      11: "December",
    };
    this.Lookup_DaysOfWeek = {
      0: "Sunday",
      1: "Monday",
      2: "Tuesday",
      3: "Wednesday",
      4: "Thursday",
      5: "Friday",
      6: "Saturday",
    };
  }
}
