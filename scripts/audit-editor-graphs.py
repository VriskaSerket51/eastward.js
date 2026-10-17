import importlib.util, json, pathlib, sys, contextlib, io

gii = pathlib.Path(sys.argv[3] if len(sys.argv) > 3 else "../gii").resolve()
backup = pathlib.Path(
    sys.argv[2] if len(sys.argv) > 2 else "extract/recovered-eastward"
)
sys.path.insert(0, str(gii / "lib"))
root = pathlib.Path(
    sys.argv[1] if len(sys.argv) > 1 else "extract/eastward-source-final"
)
metadata = json.loads(
    (root / ".eastward-project.json").read_text(encoding="utf-8")
)
index_file = backup / "metadata/asset-index.json"
idx = (
    json.loads(index_file.read_text(encoding="utf-8"))
    if index_file.exists()
    else {}
)
cache = backup / "resources"
spec = importlib.util.spec_from_file_location(
    "quest_compat", pathlib.Path(__file__).with_name("import-quest-graph.py")
)
quest_compat = importlib.util.module_from_spec(spec)
spec.loader.exec_module(quest_compat)
mods = {}
for kind, filename in [
    ("quest_scheme", "ML2QuestScheme.py"),
    ("scene_portal_graph", "ML2PortalGraph.py"),
    ("fsm_scheme", "ml2fsm.py"),
]:
    spec = importlib.util.spec_from_file_location(
        kind, gii / "lib/mock/asset/tools" / filename
    )
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    mods[kind] = m
errors = {}
counts = {}
fsm = []
compatibility = {}
for logical, entry in metadata["assets"].items():
    kind = idx.get(logical, {}).get("type") or next(
        (
            kind
            for kind, suffix in [
                ("fsm_scheme", ".fsm.graphml"),
                ("quest_scheme", ".quest.graphml"),
                ("scene_portal_graph", ".portal.graphml"),
            ]
            if entry.endswith(suffix)
        ),
        None,
    )
    if kind not in mods:
        continue
    try:
        module = mods[kind]
        if kind == "fsm_scheme":
            parser = module.FSMParser()
            with contextlib.redirect_stdout(io.StringIO()):
                code = parser.parse(str(root / entry))
            fsm.append(
                {
                    "path": logical,
                    "original": (
                        (cache / idx[logical]["objectFiles"]["def"]).read_text(
                            encoding="utf-8"
                        )
                        if logical in idx
                        else pathlib.Path(
                            str(root / entry) + ".runtime.lua"
                        ).read_text(encoding="utf-8")
                    ),
                    "recompiled": code,
                }
            )
        else:
            parser = (
                module.QuestSchemeParser()
                if kind == "quest_scheme"
                else module.PortalGraphParser()
            )
            parser.parse(str(root / entry))
            actual = (
                quest_compat.import_quest_graph(root / entry, gii)
                if kind == "quest_scheme"
                else parser.saveToData()
            )
            expected = json.loads(
                (cache / idx[logical]["objectFiles"]["def"]).read_text(
                    encoding="utf-8"
                )
                if logical in idx
                else pathlib.Path(
                    str(root / entry) + ".runtime.json"
                ).read_text(encoding="utf-8")
            )

            def normalize(value):
                if isinstance(value, dict):
                    return {
                        k: normalize(v)
                        for k, v in value.items()
                        if k != "transition"
                    }
                if isinstance(value, list):
                    return sorted(
                        [normalize(v) for v in value],
                        key=lambda v: json.dumps(v, sort_keys=True),
                    )
                return value

            if kind == "quest_scheme" and actual != expected:
                raise ValueError("Quest transition-aware importer differs")
            if normalize(actual) != normalize(expected):
                raise ValueError("Importer round-trip differs")

            def transitions(nodes):
                result = {
                    n["id"]: n["transition"]
                    for n in nodes
                    if n.get("transition")
                }
                for node in nodes:
                    result.update(transitions(node.get("children", [])))
                return result

            if kind == "quest_scheme" and transitions(expected["nodes"]):
                from xml.etree import ElementTree as ET

                doc = ET.parse(root / entry)
                ns = {"g": "http://graphml.graphdrawing.org/xmlns"}
                values = {
                    n.attrib["id"]: json.loads(
                        n.find('g:data[@key="d2"]', ns).text
                    )
                    for n in doc.findall(".//g:node", ns)
                    if n.find('g:data[@key="d2"]', ns) is not None
                }
                if values != transitions(expected["nodes"]):
                    raise ValueError("Transition metadata not preserved")
                compatibility[logical] = (
                    "Public Gii importer lacks transition metadata support; retained in GraphML and runtime JSON."
                )
        counts[kind] = counts.get(kind, 0) + 1
    except Exception as e:
        errors[logical] = str(e)
import subprocess

node_script = r"""
const {Lua}=require('wasmoon-lua5.1');
const norm=v=>v instanceof Map?Object.fromEntries([...v].sort(([a],[b])=>String(a).localeCompare(String(b))).map(([k,val])=>[String(k),norm(val)])):v;
let input='';process.stdin.on('data',b=>input+=b);process.stdin.on('end',async()=>{const errors={};for(const e of JSON.parse(input)){const l=await Lua.create();try{if(JSON.stringify(norm((await l.doString(e.original)).$detach()))!==JSON.stringify(norm((await l.doString(e.recompiled)).$detach())))errors[e.path]='effective FSM tables differ';}finally{l.global.close();}}process.stdout.write(JSON.stringify(errors));});
"""
check = subprocess.run(
    ["node", "-e", node_script],
    input=json.dumps(fsm),
    capture_output=True,
    text=True,
    encoding="utf-8",
    check=True,
)
semantic_errors = json.loads(check.stdout)

print(
    json.dumps(
        {
            "counts": counts,
            "errors": errors,
            "compatibility": compatibility,
            "fsmSemanticErrors": semantic_errors,
        },
        ensure_ascii=False,
    )
)


sys.exit(bool(errors or semantic_errors))
