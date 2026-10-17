import pathlib, sys, types, hashlib, json, urllib.parse
from PIL import Image

sys.path.insert(
    0,
    str(
        pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "../gii").resolve()
        / "lib"
    ),
)
sys.modules["xxhash"] = types.SimpleNamespace(
    xxh64=lambda data: hashlib.sha256(data)
)
from util.AsepriteFile.AsepriteFile import ASEDocument

root = (
    pathlib.Path(
        sys.argv[1] if len(sys.argv) > 1 else "extract/eastward-source-final"
    )
    / "game/asset"
)
errors = {}
docs = frames = tags = 0
for directory in root.rglob("*.msprite"):
    try:
        definition = json.loads(
            (directory / "runtime-definition.json").read_text(encoding="utf-8")
        )
        atlas_ids = list(definition["atlases"])
        atlases = {
            key: Image.open(
                directory
                / (
                    "atlas.png"
                    if len(atlas_ids) == 1
                    else "atlases/" + urllib.parse.quote(key, safe="") + ".png"
                )
            ).convert("RGBA")
            for key in atlas_ids
        }
        animations = {a["name"]: a for a in definition["anims"].values()}
        for filename in directory.glob("*.ase"):
            anim = animations[urllib.parse.unquote(filename.stem)]
            document = ASEDocument()
            document.load(str(filename))
            assert len(document.frames) == len(anim["seq"])
            expected_tags = [
                (
                    a["name"][len(anim["name"]) + 1 :],
                    bool(a.get("deprecated", False)),
                    a["seq"],
                )
                for a in definition["anims"].values()
                if a["name"].startswith(anim["name"] + ":") and a["seq"]
            ]
            actual_tags = [
                (
                    tag.name[3:] if tag.name.startswith("///") else tag.name,
                    tag.name.startswith("///"),
                    anim["seq"][tag.frameFrom : tag.frameTo + 1],
                )
                for tag in document.tags
            ]
            assert sorted(actual_tags, key=lambda v: json.dumps(v)) == sorted(
                expected_tags, key=lambda v: json.dumps(v)
            )
            for frame, entry in zip(document.frames, anim["seq"]):
                assert frame.duration == round(entry[1] * 1000)
                parts = definition["frames"][str(entry[0])]["parts"]
                cels = [
                    cel
                    for cel in frame.cels
                    if not cel.layer.name.startswith("@")
                ]
                assert len(cels) == len(parts)
                origin = [
                    cel for cel in frame.cels if cel.layer.name == "@origin"
                ][0]
                ox = origin.x
                oy = origin.y + 1
                for cel, part in zip(cels, parts):
                    module = definition["modules"][str(part[0])]
                    feature_names = []
                    layer = cel.layer
                    while layer:
                        if layer.name.startswith("#"):
                            feature_names.insert(0, layer.name[1:])
                        layer = layer.parent
                    expected_feature = next(
                        (
                            f["name"]
                            for f in definition.get("features", [])
                            if f["id"] == module["feature"]
                        ),
                        "",
                    )
                    assert ".".join(feature_names) == expected_feature
                    x, y, w, h = module["rect"]
                    image = atlases[str(module["atlas"])].crop(
                        (x, y, x + w, y + h)
                    )
                    bbox = image.getbbox()
                    if bbox:
                        assert (
                            cel.x + cel.bbox[0] - ox
                            == part[1] + entry[2] + bbox[0]
                        )
                        assert (
                            cel.y + cel.bbox[1] - oy
                            == part[2] + entry[3] + bbox[1]
                        )
                        actual = cel.getImage().convert("RGBA")
                        expected = image.crop(bbox)
                        a = actual.tobytes()
                        b = expected.tobytes()
                        assert actual.size == expected.size
                        assert all(
                            a[i : i + 4] == b[i : i + 4]
                            for i in range(0, len(a), 4)
                            if a[i + 3] or b[i + 3]
                        )
            docs += 1
            frames += len(document.frames)
            tags += len(document.tags)
    except Exception as e:
        errors[str(directory)] = repr(e)
report = {"documents": docs, "frames": frames, "tags": tags, "errors": errors}

print(json.dumps(report))

sys.exit(bool(errors))
