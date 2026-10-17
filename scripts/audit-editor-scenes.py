"""Run Pixpil's scene importer with filesystem cache services, without starting Gii."""

import ast
import base64
import hashlib
import importlib.util
import json
import logging
import os
import pathlib
import sys
import tempfile
import types

root = pathlib.Path(sys.argv[1]).resolve()
gii = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "../gii").resolve()
source = gii / "lib/mock/asset/SceneAsset.py"
tree = ast.parse(source.read_text(encoding="utf-8"))
manager_class = next(
    node
    for node in tree.body
    if isinstance(node, ast.ClassDef) and node.name == "SceneAssetManager"
)
outputs = {}
native_cache = "--native-cache" in sys.argv[3:]
if native_cache:
    sys.path.append(str(gii / "lib/3rdparty/windows"))
    import msgpack

    spec = importlib.util.spec_from_file_location(
        "pixpil_json", gii / "lib/gii/core/JSONHelper.py"
    )
    json_helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(json_helper)


def read_json(file):
    return json.loads(pathlib.Path(file).read_text(encoding="utf-8"))


def save_data(data, file):
    if native_cache:
        json_helper.saveMsgPack(data, file)
        outputs[str(pathlib.Path(file))] = msgpack.unpackb(
            pathlib.Path(file).read_bytes(), raw=False, strict_map_key=False
        )
    else:
        outputs[str(pathlib.Path(file))] = data


namespace = {
    "AssetManager": object,
    "os": os,
    "logging": logging,
    "base64": base64,
    "hashlib": hashlib,
    "SCENE_INDEX_NAME": "scene_index.json",
    "SCENE_GROUP_EXTENSION": ".scene_group",
    "JSONHelper": types.SimpleNamespace(
        tryLoadJSON=read_json,
        saveMsgPack=save_data,
        convertJSONFileToMsgPack=lambda file, target: save_data(
            read_json(file), target
        ),
    ),
    "calcFileMD5": lambda file: hashlib.md5(
        pathlib.Path(file).read_bytes()
    ).hexdigest(),
}
exec(
    compile(
        ast.Module(body=[manager_class], type_ignores=[]), str(source), "exec"
    ),
    namespace,
)
manager = namespace["SceneAssetManager"]()
metadata = json.loads(
    (root / ".eastward-project.json").read_text(encoding="utf-8")
)
counts = {"scenes": 0, "groups": 0, "prototypes": 0}
errors = {}
cache = pathlib.Path("node_modules/.cache").resolve()
cache.mkdir(parents=True, exist_ok=True)
for logical, record in metadata["assets"].items():
    if not record.endswith(".scene"):
        continue
    file = root / record
    try:
        with tempfile.TemporaryDirectory(dir=cache) as temporary:
            outputs.clear()
            objects, children = {}, {}

            def child(name, kind, manager):
                if name not in children:
                    directory = pathlib.Path(temporary) / (
                        "proto" + str(len(children))
                    )
                    directory.mkdir()
                    children[name] = types.SimpleNamespace(
                        getAbsCacheFile=lambda role, directory=directory: str(
                            directory / role
                        ),
                        getCacheFile=lambda role, directory=directory: str(
                            directory / role
                        ),
                        setObjectFile=lambda role, value: None,
                    )
                return children[name]

            node = types.SimpleNamespace(
                isVirtual=lambda: False,
                setBundle=lambda: None,
                getFilePath=lambda: str(file),
                getCacheDir=lambda role: temporary,
                setObjectFile=lambda role, value: objects.update({role: value}),
                affirmChildNode=child,
            )
            assert manager.acceptAssetFile(str(file))
            assert manager.importAsset(node)
            assert node.assetType == "scene" and node.groupType == "package"
            if file.is_dir():
                assert objects["def"] == str(file)
                assert outputs[
                    str(pathlib.Path(temporary) / "scene_index.json.packed")
                ] == read_json(file / "scene_index.json")
                for group in file.glob("*.scene_group"):
                    assert outputs[
                        str(pathlib.Path(temporary) / (group.name + ".packed"))
                    ] == read_json(group)
                    counts["groups"] += 1
            else:
                assert objects["def"] == str(file)
            for item in children.values():
                assert outputs[item.getAbsCacheFile("packed_def")] == read_json(
                    item.getAbsCacheFile("data")
                )
            counts["prototypes"] += len(children)
            counts["scenes"] += 1
    except Exception as error:
        errors[logical] = str(error)
print(
    json.dumps(
        {
            "counts": counts,
            "cacheEncoding": "gii-msgpack" if native_cache else "value-capture",
            "errorCount": len(errors),
            "examples": dict(list(errors.items())[:5]),
        }
    )
)
sys.exit(bool(errors))
