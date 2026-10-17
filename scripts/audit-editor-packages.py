"""Read derived PSDs through Pixpil's bundled reader and importer helpers."""

import sys, pathlib, types, json, tempfile, ast, os
from PIL import Image

root = pathlib.Path(
    sys.argv[1] if len(sys.argv) > 1 else "extract/eastward-source-final"
)
gii = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "../gii").resolve()
sys.path.append(str(gii / "lib/3rdparty/windows"))
from psd_tools import PSDImage

# Load helper modules without initializing Gii's desktop application.
for name, location in [
    ("mock", gii / "lib/mock"),
    ("mock.asset", gii / "lib/mock/asset"),
    ("mock.asset.helper", gii / "lib/mock/asset/helper"),
]:
    module = types.ModuleType(name)
    module.__path__ = [str(location)]
    sys.modules[name] = module
from mock.asset.helper.PSDLayerExtractor import PSDLayerExtractor
from mock.asset.helper.psd2tileset import TilesetProject

# Execute the developer's folder manager class with only its application services stubbed.
tree = ast.parse(
    (gii / "lib/mock/asset/PSDDeckPackAsset.py").read_text(encoding="utf-8")
)
manager_class = next(
    n
    for n in tree.body
    if isinstance(n, ast.ClassDef) and n.name == "DeckPackFolderAssetManager"
)
namespace = {
    "DeckPSDAssetManager": object,
    "os": os,
    "JSONHelper": types.SimpleNamespace(
        tryLoadJSON=lambda file: json.loads(
            pathlib.Path(file).read_text(encoding="utf-8")
        )
    ),
}
exec(
    compile(
        ast.Module(body=[manager_class], type_ignores=[]),
        "PSDDeckPackAsset.py",
        "exec",
    ),
    namespace,
)
manager = namespace["DeckPackFolderAssetManager"]()
metadata = json.loads(
    (root / ".eastward-project.json").read_text(encoding="utf-8")
)
errors = {}
counts = {"textureLayers": 0, "tiles": 0, "deckpacks": 0}
for logical, record in metadata["assets"].items():
    file = root / record
    try:
        if logical.endswith(".textures.psd"):
            pathlib.Path("node_modules/.cache").mkdir(
                parents=True, exist_ok=True
            )
            with tempfile.TemporaryDirectory(dir="node_modules/.cache") as out:
                results = PSDLayerExtractor().extract(str(file), out)
                expected = file.parent / (file.name + ".recovered")
                assert {name for name, _, _ in results} == {
                    p.stem for p in expected.glob("*.png")
                }
                for name, image, _ in results:
                    assert (
                        Image.open(image).convert("RGBA").tobytes()
                        == Image.open(expected / (name + ".png"))
                        .convert("RGBA")
                        .tobytes()
                    )
                    counts["textureLayers"] += 1
        elif logical.endswith(".ntileset.psd"):
            expected = json.loads(
                (
                    file.parent / (file.name + ".recovered") / "tileset.json"
                ).read_text(encoding="utf-8")
            )
            atlas = Image.open(
                file.parent / (file.name + ".recovered") / "atlas.png"
            ).convert("RGBA")
            project = TilesetProject()
            project.loadPSD(str(file))
            assert len(project.themes) == len(expected["themes"])
            for theme, data in zip(project.themes, expected["themes"]):
                theme.build()
                assert theme.rawName == data["raw_name"]
                assert len(theme.groups) == len(data["groups"])
                for group, original in zip(theme.groups, data["groups"]):
                    assert group.rawName == original["raw_name"]
                    assert len(group.tiles) == len(original["tiles"])
                    lookup = {t["basename"]: t for t in original["tiles"]}
                    for tile in group.tiles:
                        t = lookup[tile.name]
                        assert list(tile.rawRect) == t["raw_rect"]
                        assert list(tile.deckRect) == t["deck_rect"]
                        assert list(tile.deckOffset) == t["deck_offset"]
                        x, y, w, h = t["rect"]
                        assert (
                            tile.getImage().convert("RGBA").tobytes()
                            == atlas.crop((x, y, x + w, y + h)).tobytes()
                        )
                        counts["tiles"] += 1
            with tempfile.TemporaryDirectory(dir="node_modules/.cache") as out:
                project.save(out + "/atlas.png", out + "/tileset.json")
                rebuilt = json.loads(
                    pathlib.Path(out + "/tileset.json").read_text(
                        encoding="utf-8"
                    )
                )
                rebuilt_atlas = Image.open(out + "/atlas.png").convert("RGBA")
                for theme, data in zip(rebuilt["themes"], expected["themes"]):
                    assert (
                        theme["raw_name"] == data["raw_name"]
                        and theme["size"] == data["size"]
                    )
                    for group, original in zip(theme["groups"], data["groups"]):
                        assert (
                            group["raw_name"] == original["raw_name"]
                            and group["type"] == original["type"]
                            and group["alt"] == original["alt"]
                        )
                        lookup = {t["basename"]: t for t in original["tiles"]}
                        for tile in group["tiles"]:
                            t = lookup[tile["basename"]]
                            for key in [
                                "name",
                                "fullname",
                                "deck_rect",
                                "deck_offset",
                                "raw_rect",
                            ]:
                                assert tile[key] == t[key]
                            x, y, w, h = tile["rect"]
                            ox, oy, ow, oh = t["rect"]
                            assert (
                                rebuilt_atlas.crop(
                                    (x, y, x + w, y + h)
                                ).tobytes()
                                == atlas.crop(
                                    (ox, oy, ox + ow, oy + oh)
                                ).tobytes()
                            )
        elif logical in metadata.get("pathRemappings", {}):
            assert file.is_dir() and file.name.endswith(".deckpack")
            original = root / "game/asset" / (logical + ".recovered")
            assert json.loads(
                (file / "decks.json").read_text(encoding="utf-8")
            ) == json.loads(
                (original / "decks.json").read_text(encoding="utf-8")
            )
            assert manager.acceptAssetFile(str(file))
            children = []
            objects = {}
            node = types.SimpleNamespace(
                setBundle=lambda: None,
                getFilePath=lambda: str(file),
                setObjectFile=lambda role, value: objects.update({role: value}),
                affirmChildNode=lambda name, kind, manager: children.append(
                    (name, kind)
                ),
            )
            assert manager.importAsset(node)
            assert (
                node.assetType == "deck_pack_raw"
                and node.groupType == "package"
            )
            assert objects["export"] == str(file)
            assert children == [
                (d["name"], d["type"])
                for d in json.loads(
                    (file / "decks.json").read_text(encoding="utf-8")
                )["decks"]
            ]
            for name in ["decks.png", "decks_n.png"]:
                assert (file / name).read_bytes() == (
                    original / name
                ).read_bytes()
            counts["deckpacks"] += 1
    except Exception as error:
        errors[logical] = repr(error)
result = {"counts": counts, "errors": errors}

print(json.dumps(result, ensure_ascii=False))
sys.exit(bool(errors))
