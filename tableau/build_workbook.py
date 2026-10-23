"""Build the Tableau workbook (tableau/FPL Points Lab.twbx) from the CSV extracts.

Generating the workbook from code means it can be rebuilt whenever the data changes,
and every color and font choice lives in one place. Open the .twbx in Tableau
Desktop or Tableau Public and use File > Save to Tableau Public to publish it.

Run:  python tableau/build_workbook.py
"""
import re
import sys
import uuid
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from fpl.config import LIVE_SEASON  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE / "FPL Points Lab.twbx"
USER_NS = "http://www.tableausoftware.com/xml/user"
ET.register_namespace("user", USER_NS)

# Theme: same palette as the web app and README charts.
INK, INK_2, MUTED = "#1d2433", "#4d5566", "#7a8190"
PAPER, RULE = "#f6f7f4", "#dfe3dc"
MODEL, BASE, FORM = "#2a78d6", "#a9a8a2", "#eb6834"
POSITION_COLORS = {"GK": "#eda100", "DEF": "#2a78d6", "MID": "#1baf7a", "FWD": "#eb6834"}
FONT, FONT_BOLD = "Tableau Book", "Tableau Semibold"

DATA_FILES = {
    "weekly": ("weekly_xi_points.csv", "Season race"),
    "edges": ("model_edges.csv", "Model edges"),
    "bias": ("model_bias_by_position.csv", "Bias by position"),
    "players": ("player_season.csv", "Player seasons"),
    "teams": ("team_season.csv", "Team seasons"),
    "diffs": ("differentials.csv", "Differentials"),
}


def uid() -> str:
    return "{" + str(uuid.uuid4()).upper() + "}"


def sub(parent, tag, text=None, **attrs):
    el = ET.SubElement(parent, tag, {k.replace("__", ":").replace("_", "-") if not k.startswith("user")
                                     else k: str(v) for k, v in attrs.items()})
    if text is not None:
        el.text = text
    return el


def fmt(parent, attr, value, scope=None):
    a = {"attr": attr, "value": value}
    if scope:
        a["scope"] = scope
    return ET.SubElement(parent, "format", a)


# ------------------------------------------------------------------ data sources
def infer(series: pd.Series) -> str:
    if pd.api.types.is_bool_dtype(series):
        return "boolean"
    if pd.api.types.is_integer_dtype(series):
        return "integer"
    if pd.api.types.is_float_dtype(series):
        return "real"
    return "string"


class Source:
    def __init__(self, key: str, filename: str, caption: str):
        self.key, self.filename, self.caption = key, filename, caption
        self.name = f"federated.fpl_{key}"
        self.df = pd.read_csv(HERE / filename)
        self.types = {c: infer(self.df[c]) for c in self.df.columns}
        self.calcs = {}      # name -> (caption, datatype, role, type, formula)
        self.palettes = {}   # field instance -> {value: color}
        self.formats = {}    # column -> Tableau number format, e.g. "n#,##0.00"
        self.captions = {}   # column -> display name

    def ref(self, inst: str) -> str:
        return f"[{self.name}].[{inst}]"

    def xml(self, parent):
        ds = sub(parent, "datasource", caption=self.caption, inline="true", name=self.name, version="18.1")
        conn = sub(ds, "connection", **{"class": "federated"})
        named = sub(sub(conn, "named-connections"), "named-connection",
                    caption=self.filename[:-4], name=f"textscan.{self.key}")
        sub(named, "connection", **{"class": "textscan", "directory": "Data/tableau",
                                    "filename": self.filename, "password": "", "server": ""})
        self._relation(conn)
        sub(ds, "aliases", enabled="yes")
        for col, t in self.types.items():
            role = "measure" if t in ("integer", "real") else "dimension"
            typ = "quantitative" if role == "measure" else "nominal"
            extra = {"default-format": self.formats[col]} if col in self.formats else {}
            sub(ds, "column", caption=self.captions.get(col, col.replace("_", " ").capitalize()), datatype=t,
                name=f"[{col}]", role=role, type=typ, **extra)
        for name, (caption, dt, role, typ, formula) in self.calcs.items():
            c = sub(ds, "column", caption=caption, datatype=dt, name=f"[{name}]", role=role, type=typ)
            sub(c, "calculation", **{"class": "tableau", "formula": formula})
        for inst in self.palettes:  # Tableau only applies a palette to a declared column-instance
            deriv, field, kind = inst.split(":")
            sub(ds, "column-instance", column=f"[{field}]", derivation="None", name=f"[{inst}]",
                pivot="key", type="nominal")
        sub(ds, "layout", **{"dim-ordering": "alphabetic", "measure-ordering": "alphabetic",
                             "show-structure": "true"})
        if self.palettes:
            rule = sub(sub(ds, "style"), "style-rule", element="mark")
            for inst, mapping in self.palettes.items():
                enc = sub(rule, "encoding", attr="color", field=f"[{inst}]", type="palette")
                for value, color in mapping.items():
                    m = sub(enc, "map", to=color)
                    sub(m, "bucket", f'"{value}"')
        obj = sub(sub(ds, "object-graph"), "objects")
        o = sub(obj, "object", caption=self.filename, id=f"{self.key}_obj")
        self._relation(sub(o, "properties", context=""))

    def _relation(self, parent):
        rel = sub(parent, "relation", connection=f"textscan.{self.key}", name=self.filename,
                  table=f"[{self.filename[:-4]}#csv]", type="table")
        cols = sub(rel, "columns", **{"character-set": "UTF-8", "header": "yes", "locale": "en_US",
                                      "separator": ","})
        for i, (col, t) in enumerate(self.types.items()):
            sub(cols, "column", datatype=t, name=col, ordinal=str(i))


def parameters_xml(parent, seasons):
    ds = sub(parent, "datasource", hasconnection="false", inline="true", name="Parameters", version="18.1")
    sub(ds, "aliases", enabled="yes")
    c = sub(ds, "column", caption="Season", datatype="string", name="[Season Parameter]",
            **{"param-domain-type": "list", "role": "measure", "type": "nominal",
               "value": f'"{seasons[-1]}"'})
    sub(c, "calculation", **{"class": "tableau", "formula": f'"{seasons[-1]}"'})
    members = sub(c, "members")
    for s in seasons:
        sub(members, "member", value=f'"{s}"')


# ------------------------------------------------------------------ worksheets
INSTANCE = {"none": "None", "sum": "Sum", "avg": "Avg", "attr": "Attribute"}


def instance(src: Source, deriv: str, field: str, kind: str) -> str:
    return f"{deriv}:{field}:{kind}"


def sheet_style(table, extra_rules=(), axes=()):
    style = sub(table, "style")
    r = sub(style, "style-rule", element="worksheet")
    fmt(r, "font-family", FONT)
    fmt(r, "color", INK_2)
    r = sub(style, "style-rule", element="axis")
    fmt(r, "font-family", FONT)
    fmt(r, "font-size", "9")
    fmt(r, "color", INK_2)
    for field_ref, scope, reverse in axes:  # axis that doesn't start at zero, optionally flipped
        attrs = {"attr": "space", "class": "0", "domain-expand": "false", "field": field_ref,
                 "field-type": "quantitative", "scope": scope, "type": "space"}
        if reverse:
            attrs["reverse"] = "true"
        ET.SubElement(r, "encoding", attrs)
    r = sub(style, "style-rule", element="header")
    fmt(r, "font-family", FONT)
    r = sub(style, "style-rule", element="label")
    fmt(r, "font-family", FONT)
    fmt(r, "color", INK)
    r = sub(style, "style-rule", element="gridline")
    fmt(r, "line-visibility", "off", scope="cols")
    for element, attrs in extra_rules:
        r = sub(style, "style-rule", element=element)
        for a, v, *scope in attrs:
            fmt(r, a, v, scope[0] if scope else None)
    return style


def worksheet(parent, name, src: Source, *, rows=(), cols=(), mark="Automatic", color=None, size=None,
              text=(), detail=(), tooltip=(), mark_color=None, deps=(), filters=(), uses_param=False,
              title=None, sort=None, extra_style=(), label_marks=False, axes=()):
    ws = sub(parent, "worksheet", name=name)
    if title:
        ft = sub(sub(sub(ws, "layout-options"), "title"), "formatted-text")
        sub(ft, "run", title, bold="true", fontcolor=INK, fontname=FONT_BOLD, fontsize="12")
    table = sub(ws, "table")
    view = sub(table, "view")
    dss = sub(view, "datasources")
    sub(dss, "datasource", caption=src.caption, name=src.name)  # first listed = the sheet's main source
    if uses_param:
        sub(dss, "datasource", name="Parameters")
    if uses_param:
        pdep = sub(view, "datasource-dependencies", datasource="Parameters")
        pc = sub(pdep, "column", caption="Season", datatype="string", name="[Season Parameter]",
                 **{"param-domain-type": "list", "role": "measure", "type": "nominal", "value": '"2025-26"'})
        sub(pc, "calculation", **{"class": "tableau", "formula": '"2025-26"'})
    dep = sub(view, "datasource-dependencies", datasource=src.name)
    fields_used = {}
    for inst in deps:
        deriv, field, kind = inst.split(":")
        fields_used[field] = True
        if field in src.calcs:  # a calculation needs the columns it reads
            for ref in re.findall(r"(?<!\.)\[([a-z_]+)\]", src.calcs[field][4]):
                if ref in src.types:
                    fields_used[ref] = True
    for field in fields_used:
        if field in src.calcs:
            caption, dt, role, typ, formula = src.calcs[field]
            c = sub(dep, "column", caption=caption, datatype=dt, name=f"[{field}]", role=role, type=typ)
            sub(c, "calculation", **{"class": "tableau", "formula": formula})
        else:
            t = src.types[field]
            role = "measure" if t in ("integer", "real") else "dimension"
            sub(dep, "column", datatype=t, name=f"[{field}]", role=role,
                type="quantitative" if role == "measure" else "nominal")
    for inst in deps:
        deriv, field, kind = inst.split(":")
        typ = {"nk": "nominal", "qk": "quantitative", "ok": "ordinal"}[kind]
        sub(dep, "column-instance", column=f"[{field}]", derivation=INSTANCE[deriv], name=f"[{inst}]",
            pivot="key", type=typ)
    for f in filters:
        f(view, src)
    if sort:
        dim, measure, direction = sort
        sub(view, "computed-sort", column=src.ref(dim), direction=direction, using=src.ref(measure))
    sub(view, "aggregation", value="true")
    sheet_style(table, extra_style, [(src.ref(i), sc, rv) for i, sc, rv in axes])
    pane = sub(sub(table, "panes"), "pane", **{"selection-relaxation-option": "selection-relaxation-allow"})
    sub(sub(pane, "view"), "breakdown", value="auto")
    sub(pane, "mark", **{"class": mark})
    enc = sub(pane, "encodings")
    if color:
        sub(enc, "color", column=src.ref(color))
    if size:
        sub(enc, "size", column=src.ref(size))
    for t in text:
        sub(enc, "text", column=src.ref(t))
    for d in detail:
        sub(enc, "lod", column=src.ref(d))
    for t in tooltip:
        sub(enc, "tooltip", column=src.ref(t))
    pstyle = sub(pane, "style")
    mr = sub(pstyle, "style-rule", element="mark")
    if mark_color:
        fmt(mr, "mark-color", mark_color)
    if label_marks:
        fmt(mr, "mark-labels-show", "true")
        fmt(mr, "mark-labels-cull", "true")
    sub(table, "rows", " * ".join(src.ref(r) for r in rows) if rows else None)
    sub(table, "cols", " * ".join(src.ref(c) for c in cols) if cols else None)
    sub(ws, "simple-id", uuid=uid())
    return ws


def param_filter(view, src):
    sub(view, "filter", **{"class": "categorical", "column": src.ref("none:season_selected:nk")})
    view[-1].append(ET.Element("groupfilter", {"function": "member", "level": "[none:season_selected:nk]",
                                               "member": "true", f"{{{USER_NS}}}ui-domain": "database",
                                               f"{{{USER_NS}}}ui-enumeration": "inclusive",
                                               f"{{{USER_NS}}}ui-marker": "enumerate"}))


def min_filter(inst, minimum):
    def f(view, src):
        flt = sub(view, "filter", **{"class": "quantitative", "column": src.ref(inst),
                                     "included-values": "in-range"})
        sub(flt, "min", str(minimum))
    return f


# ------------------------------------------------------------------ dashboards
class Layout:
    """Tiled dashboard built from absolute boxes in Tableau's 0-100000 coordinate space."""

    def __init__(self, width, height):
        self.w, self.h, self.next_id = width, height, 3
        self.zones = []

    def _box(self, x, y, w, h):
        return {"x": str(round(x / self.w * 100000)), "y": str(round(y / self.h * 100000)),
                "w": str(round(w / self.w * 100000)), "h": str(round(h / self.h * 100000))}

    def add(self, x, y, w, h, **attrs):
        self.next_id += 1
        z = {"id": str(self.next_id), **self._box(x, y, w, h), **attrs}
        self.zones.append(z)
        return z


def zone_style(z, background=None, padding=8):
    zs = ET.SubElement(z, "zone-style")
    fmt(zs, "border-color", "#000000")
    fmt(zs, "border-style", "none")
    fmt(zs, "border-width", "0")
    fmt(zs, "margin", "4")
    fmt(zs, "padding", str(padding))
    if background:
        fmt(zs, "background-color", background)


def dashboard(parent, name, layout: Layout, texts, sources):
    d = sub(parent, "dashboard", name=name)
    st = sub(d, "style")
    r = sub(st, "style-rule", element="table")
    fmt(r, "background-color", PAPER)
    sub(d, "size", maxheight=str(layout.h), maxwidth=str(layout.w), minheight=str(layout.h),
        minwidth=str(layout.w), **{"sizing-mode": "fixed"})
    dss = sub(d, "datasources")
    for s in sources:
        sub(dss, "datasource", **({"name": "Parameters"} if s == "Parameters" else
                                  {"caption": s.caption, "name": s.name}))
    zones = sub(d, "zones")
    root = sub(zones, "zone", h="100000", id="2", w="100000", x="0", y="0", **{"type-v2": "layout-basic"})
    for z in layout.zones:
        z = dict(z)
        runs = texts.get(z["id"])
        el = ET.SubElement(root, "zone", {k: v for k, v in z.items() if not k.startswith("_")})
        if runs:
            ft = ET.SubElement(el, "formatted-text")
            for txt, size, bold, color in runs:
                ET.SubElement(ft, "run", {"bold": "true" if bold else "false", "fontcolor": color,
                                          "fontname": FONT_BOLD if bold else FONT, "fontsize": str(size)}).text = txt
        zone_style(el, background=z.get("_bg"), padding=int(z.get("_pad", 8)))
    zs = ET.SubElement(root, "zone-style")
    fmt(zs, "background-color", PAPER)
    sub(d, "simple-id", uuid=uid())
    return d


# ------------------------------------------------------------------ build
def build():
    diffs = pd.read_csv(HERE.parent / "reports" / "sql_results" / "02_top_differentials.csv")
    diffs.rename(columns={"web_name": "player"}).to_csv(HERE / "differentials.csv", index=False)

    src = {k: Source(k, f, c) for k, (f, c) in DATA_FILES.items()}
    weekly, edges, bias, players, teams, diffs_src = (src[k] for k in DATA_FILES)
    # Finished seasons only: after a few gameweeks of the live season nobody has 900 minutes yet.
    seasons = sorted(s for s in players.df["season"].unique() if s != LIVE_SEASON)

    weekly.palettes["none:method:nk"] = {"Model": MODEL, "Season average": BASE, "Recent form": FORM}
    bias.calcs["is_def"] = ("Is defender", "string", "dimension", "nominal",
                            'IF [position] = "DEF" THEN "Defenders" ELSE "Other positions" END')
    bias.palettes["none:is_def:nk"] = {"Defenders": MODEL, "Other positions": BASE}
    bias.formats["bias"] = "n#,##0.00;-#,##0.00"
    bias.captions["bias"] = "Predicted minus actual"
    edges.palettes["none:verdict:nk"] = {"Real": MODEL, "Could be luck": MUTED}
    edges.captions.update({"metric": "Measure", "baseline": "Compared with", "edge_label": "Model edge",
                           "range_label": "95% range", "verdict": "Verdict"})
    bias.captions["position"] = "Pos"
    weekly.captions.update({"gw": "Gameweek", "cumulative_points": "Total points", "xi_points": "Points this gameweek"})
    teams.captions.update({"goals_for": "Goals for", "goals_against": "Goals against",
                           "finishing_vs_xg": "Goals minus xG"})
    players.captions.update({"avg_price": "Average price (£m)", "total_points": "Total points",
                             "points_per_million": "Points per £m", "avg_ownership_pct": "Ownership %"})
    for s in (players, teams, diffs_src):
        s.calcs["season_selected"] = ("Season selected", "boolean", "dimension", "nominal",
                                      "[season] = [Parameters].[Season Parameter]")
    players.palettes["none:position:nk"] = POSITION_COLORS
    diffs_src.palettes["none:position:nk"] = POSITION_COLORS
    teams.calcs["xg_for_pm"] = ("xG for per match", "real", "measure", "quantitative",
                                "SUM([xg_for]) / SUM([xg_matches])")
    teams.calcs["xg_against_pm"] = ("xG against per match", "real", "measure", "quantitative",
                                    "SUM([xg_against]) / SUM([xg_matches])")

    wb = ET.Element("workbook", {"original-version": "18.1", "source-build": "2026.2.3 (20262.26.0912.1023)",
                                 "source-platform": "mac", "version": "18.1"})
    manifest = sub(wb, "document-format-change-manifest")
    for tag in ("AnimationOnByDefault", "MarkAnimation", "ObjectModelEncapsulateLegacy",
                "ObjectModelTableType", "SchemaViewerObjectModel", "SetMembershipControl",
                "SheetIdentifierTracking", "SortTagCleanup", "WindowsPersistSimpleIdentifiers"):
        sub(manifest, tag)
    dsx = sub(wb, "datasources")
    parameters_xml(dsx, seasons)
    for s in src.values():
        s.xml(dsx)

    w = sub(wb, "worksheets")
    worksheet(w, "Season race", weekly, cols=["none:gw:qk"], rows=["sum:cumulative_points:qk"], mark="Line",
              color="none:method:nk", tooltip=["sum:xi_points:qk"],
              deps=["none:gw:qk", "sum:cumulative_points:qk", "none:method:nk", "sum:xi_points:qk"],
              title="Running total of points scored by each method's best XI, 2025-26")
    worksheet(w, "Edge scorecard", edges,
              rows=["none:metric:nk", "none:baseline:nk", "none:edge_label:nk", "none:range_label:nk"],
              mark="Text", color="none:verdict:nk", text=["none:verdict:nk"],
              deps=["none:metric:nk", "none:baseline:nk", "none:edge_label:nk", "none:range_label:nk",
                    "none:verdict:nk"],
              title="Model's edge over each simple rule, per gameweek",
              extra_style=[("header", [("font-size", "10"), ("color", INK)]),
                           ("cell", [("font-size", "10")])])
    worksheet(w, "Bias by position", bias, rows=["none:position:nk"], cols=["sum:bias:qk"], mark="Bar",
              color="none:is_def:nk", text=["sum:bias:qk"], label_marks=True,
              deps=["none:position:nk", "sum:bias:qk", "none:is_def:nk"],
              sort=("none:position:nk", "sum:bias:qk", "ASC"),
              title="Average predicted minus actual points, regular starters")
    worksheet(w, "Value scatter", players, cols=["sum:avg_price:qk"], rows=["sum:total_points:qk"],
              mark="Circle", color="none:position:nk",
              detail=["none:player:nk", "none:team:nk"],
              tooltip=["sum:points_per_million:qk", "sum:avg_ownership_pct:qk"],
              deps=["sum:avg_price:qk", "sum:total_points:qk", "none:position:nk", "none:player:nk",
                    "none:team:nk", "sum:points_per_million:qk",
                    "sum:avg_ownership_pct:qk", "none:season_selected:nk", "sum:minutes:qk"],
              filters=[param_filter, min_filter("sum:minutes:qk", 900)], uses_param=True,
              axes=[("sum:avg_price:qk", "cols", False), ("sum:total_points:qk", "rows", False)],
              title="Points vs price, players with 900+ minutes")
    worksheet(w, "Differentials", diffs_src, rows=["none:player:nk"], cols=["sum:points:qk"], mark="Bar",
              color="none:position:nk", text=["sum:points:qk"], label_marks=True,
              tooltip=["sum:avg_ownership_pct:qk", "sum:avg_price:qk"],
              deps=["none:player:nk", "sum:points:qk", "none:position:nk", "sum:avg_ownership_pct:qk",
                    "sum:avg_price:qk", "none:season_selected:nk"],
              filters=[param_filter], uses_param=True, sort=("none:player:nk", "sum:points:qk", "DESC"),
              title="Top scorers owned by under 5% of managers")
    worksheet(w, "Team quadrant", teams, cols=["none:xg_for_pm:qk"], rows=["none:xg_against_pm:qk"],
              mark="Circle", text=["none:short_name:nk"], detail=["none:team:nk"], mark_color=INK,
              tooltip=["sum:goals_for:qk", "sum:goals_against:qk", "sum:finishing_vs_xg:qk"],
              label_marks=True,
              deps=["none:xg_for_pm:qk", "none:xg_against_pm:qk", "none:short_name:nk", "none:team:nk",
                    "sum:goals_for:qk", "sum:goals_against:qk", "sum:finishing_vs_xg:qk",
                    "none:season_selected:nk"],
              filters=[param_filter], uses_param=True,
              axes=[("usr:xg_for_pm:qk", "cols", False), ("usr:xg_against_pm:qk", "rows", True)],
              title="xG created vs xG conceded per match (top right is best)")
    _fix_calc_measures(w, teams)

    dbs = sub(wb, "dashboards")
    W, H = 1200, 820
    # Dashboard 1: model scorecard
    L = Layout(W, H)
    t1 = L.add(24, 16, 1152, 46, **{"type-v2": "text"})
    t2 = L.add(24, 60, 1152, 40, **{"type-v2": "text"})
    L.add(24, 108, 700, 420, name="Season race")
    L.add(740, 108, 436, 96, **{"type-v2": "color", "name": "Season race",
                                "param": weekly.ref("none:method:nk"), "pane-specification-id": "0"})
    how = L.add(740, 214, 436, 314, **{"type-v2": "text"})
    L.add(24, 540, 700, 264, name="Edge scorecard")
    L.add(740, 540, 436, 264, name="Bias by position")
    texts = {
        t1["id"]: [("FPL Points Lab: does the model beat simple rules?", 22, True, INK)],
        t2["id"]: [("Every number comes from 2025-26, a full season the model never saw in training. "
                    "Each week every method picks its best XI; points are what those players scored.",
                    11, False, INK_2)],
        how["id"]: [("How to read this\n", 12, True, INK),
                                 ("The model's XI scored about 260 more points than picking by season "
                                  "average. In the table below, \"Real\" means the edge holds up when the 38 "
                                  "gameweeks are resampled 4,000 times.\n\n"
                                  "Defenders are under-predicted: 2025-26 added points for defensive "
                                  "contributions, a rule the model never saw.", 10, False, INK_2)],
    }
    dashboard(dbs, "Model scorecard", L, texts, [weekly, edges, bias])

    # Dashboard 2: value finder
    L = Layout(W, H)
    t1 = L.add(24, 16, 900, 46, **{"type-v2": "text"})
    t2 = L.add(24, 60, 900, 40, **{"type-v2": "text"})
    L.add(940, 24, 236, 70, **{"type-v2": "paramctrl", "param": "[Parameters].[Season Parameter]",
                               "mode": "compact"})
    L.add(24, 108, 776, 696, name="Value scatter")
    L.add(816, 108, 360, 110, **{"type-v2": "color", "name": "Value scatter",
                                 "param": players.ref("none:position:nk"), "pane-specification-id": "0"})
    L.add(816, 228, 360, 300, name="Differentials")
    note = L.add(816, 540, 360, 264, **{"type-v2": "text"})
    texts = {
        t1["id"]: [("Who gave the most points for the money?", 22, True, INK)],
        t2["id"]: [("Every dot is a player-season. Hover for details, pick a season at the top right.",
                    11, False, INK_2)],
        note["id"]: [("How to read this\n", 12, True, INK),
                     ("Dots high and to the left scored a lot for a low price. Across 2022-26, "
                      "goalkeepers and mid-priced (£6.5-8.4m) defenders and midfielders gave the most "
                      "points per million; the cheapest defenders and midfielders gave the least."
                      "\n\nDifferentials are players owned by "
                      "fewer than 5% of managers, the picks that move you up the rankings.",
                      10, False, INK_2)],
    }
    dashboard(dbs, "Value finder", L, texts, ["Parameters", players, diffs_src])

    # Dashboard 3: team attack vs defence
    L = Layout(W, H)
    t1 = L.add(24, 16, 900, 46, **{"type-v2": "text"})
    t2 = L.add(24, 60, 900, 40, **{"type-v2": "text"})
    L.add(940, 24, 236, 70, **{"type-v2": "paramctrl", "param": "[Parameters].[Season Parameter]",
                               "mode": "compact"})
    L.add(24, 108, 1152, 696, name="Team quadrant")
    texts = {
        t1["id"]: [("Which teams create more than they concede?", 22, True, INK)],
        t2["id"]: [("Expected goals per match. Right means more chances created; higher means fewer conceded.", 11, False, INK_2)],
    }
    dashboard(dbs, "Team attack vs defence", L, texts, ["Parameters", teams])

    windows = sub(wb, "windows", **{"source-height": "30"})
    for ws in w.findall("worksheet"):
        win = sub(windows, "window", **{"class": "worksheet", "name": ws.get("name")})
        cards = sub(win, "cards")
        left = sub(sub(cards, "edge", name="left"), "strip", size="160")
        for card in ("pages", "filters", "marks"):
            sub(left, "card", type=card)
        top = sub(cards, "edge", name="top")
        for card, size in (("columns", "2147483647"), ("rows", "2147483647"), ("title", "31")):
            sub(sub(top, "strip", size=size), "card", type=card)
        sub(win, "simple-id", uuid=uid())
    for i, d in enumerate(dbs.findall("dashboard")):
        attrs = {"class": "dashboard", "name": d.get("name")}
        if i == 0:
            attrs["maximized"] = "true"
        win = sub(windows, "window", **attrs)
        vps = sub(win, "viewpoints")
        for z in d.iter("zone"):
            if z.get("name") and not z.get("type-v2"):
                vp = sub(vps, "viewpoint", name=z.get("name"))
                sub(vp, "zoom", type="entire-view")  # stretch the chart to fill its box
        sub(win, "active", id="-1")
        sub(win, "simple-id", uuid=uid())

    ET.indent(wb, space="  ")
    xml = "<?xml version='1.0' encoding='utf-8' ?>\n\n" + ET.tostring(wb, encoding="unicode")
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("FPL Points Lab.twb", xml)
        for s in src.values():
            z.write(HERE / s.filename, f"Data/tableau/{s.filename}")
    print(f"[tableau] wrote {OUT.name} ({OUT.stat().st_size // 1024} KB)")


def _fix_calc_measures(worksheets_el, teams: Source):
    """Calculated aggregates (xg_for_pm) are already aggregated, so reference them with 'usr' derivation."""
    for ws in worksheets_el.findall("worksheet"):
        if ws.get("name") != "Team quadrant":
            continue
        for ci in ws.iter("column-instance"):
            if ci.get("column") in ("[xg_for_pm]", "[xg_against_pm]"):
                field = ci.get("column")[1:-1]
                ci.set("derivation", "User")
                ci.set("name", f"[usr:{field}:qk]")
        for tag in ("rows", "cols"):
            el = ws.find(f"table/{tag}")
            el.text = el.text.replace("none:xg_for_pm:qk", "usr:xg_for_pm:qk").replace(
                "none:xg_against_pm:qk", "usr:xg_against_pm:qk")


if __name__ == "__main__":
    build()
