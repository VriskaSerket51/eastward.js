"""Read-only round trips through Pixpil's public SQ and XLS importers; no engine execution."""

import importlib.util
import inspect
import json
import pathlib
import sys
import six.moves
import csv

sys.stdout.reconfigure(encoding="utf-8")

root = pathlib.Path(sys.argv[1]).resolve()
recovery = pathlib.Path(sys.argv[2]).resolve()
gii = pathlib.Path(sys.argv[3]).resolve()
# The public importer targets Python 3.8; this compatibility shim is audit-only.
if not hasattr(inspect, "getargspec"):
    inspect.getargspec = inspect.getfullargspec
sys.path.insert(0, str(gii / "lib/3rdparty/common"))
spec = importlib.util.spec_from_file_location(
    "pixpil_sq", gii / "lib/util/SQScript/SQScriptCompiler.py"
)
sq = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sq)
import xlrd

# Use only the pure XLS conversion functions, before editor registration/imports.
xls_path = gii / "lib/mock/asset/DataXLSAsset.py"
text = xls_path.read_text(encoding="utf-8")
start = text.index("def cellValue(")
end = text.index("def _getModulePath(")
xls = {"re": __import__("re"), "logging": __import__("logging"), "xlrd": xlrd}
exec(compile(text[start:end], str(xls_path), "exec"), xls)


def semantic(value):
    if isinstance(value, (list, tuple)):
        return [semantic(v) for v in value]
    if isinstance(value, dict):
        return {
            k: semantic(v)
            for k, v in value.items()
            if k not in ("line", "lineCount")
        }
    return value


def difference(a, b, location="root"):
    if type(a) != type(b):
        return location + ": " + repr(a)[:120] + " != " + repr(b)[:120]
    if isinstance(a, dict):
        if a.keys() != b.keys():
            return location + ": keys " + repr(list(a)) + " != " + repr(list(b))
        for key in a:
            result = difference(a[key], b[key], location + "." + str(key))
            if result:
                return result
    elif isinstance(a, list):
        if len(a) != len(b):
            return location + ": lengths " + str(len(a)) + " != " + str(len(b))
        for i, (x, y) in enumerate(zip(a, b)):
            result = difference(x, y, location + "[" + str(i) + "]")
            if result:
                return result
    elif a != b:
        return location + ": " + repr(a)[:120] + " != " + repr(b)[:120]


metadata = json.loads(
    (root / ".eastward-project.json").read_text(encoding="utf-8")
)
manifest = json.loads((recovery / "project.json").read_text(encoding="utf-8"))
counts = {"sq": 0, "xls": 0, "csv": 0}
errors = {}
for logical, record in metadata["assets"].items():
    kind = manifest["assets"].get(logical, {}).get("type")
    if kind not in ("sq_script", "data_xls", "data_csv"):
        continue
    folder = recovery / manifest["assets"][logical]["folder"]
    try:
        if kind == "sq_script":
            expected = json.loads(
                (folder / "data.json").read_text(encoding="utf-8")
            )
            actual = (
                sq.SQScriptCompiler()
                .parseFile(str(root / record), logical)
                .toJSON()
            )
            if semantic(expected) != semantic(actual):
                raise ValueError(
                    difference(semantic(expected), semantic(actual))
                )
            counts["sq"] += 1
        elif kind == "data_xls":
            expected = json.loads(
                (folder / "data.json").read_text(encoding="utf-8")
            )
            actual, metadata = xls["convertWorkbookToData"](
                xlrd.open_workbook(str(root / record))
            )
            if actual != expected:
                raise ValueError("XLS data differs")
            counts["xls"] += 1
        else:
            expected = json.loads(
                (folder / "data.json").read_text(encoding="utf-8")
            )

            def cell(value):
                if not value:
                    return None
                try:
                    return float(value)
                except ValueError:
                    return value

            with (root / record).open(
                encoding="utf-8", newline=""
            ) as file:
                rows = [[cell(v) for v in row] for row in csv.reader(file)]
            if logical.endswith(".dict.csv"):
                actual = {str(row[0]): row[1] for row in rows if row[0]}
            elif logical.endswith(".list.csv"):
                actual = (
                    [dict(zip(rows[0], row)) for row in rows[1:]]
                    if rows
                    else None
                )
            else:
                actual = rows
            if actual != expected:
                raise ValueError("CSV data differs")
            counts["csv"] += 1
    except Exception as error:
        errors[logical] = str(error)

print(
    json.dumps(
        {
            "verified": counts,
            "errorCount": len(errors),
            "examples": dict(list(errors.items())[:5]),
        },
        ensure_ascii=False,
    )
)
sys.exit(bool(errors))
