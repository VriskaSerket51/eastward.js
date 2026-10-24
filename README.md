# eastward.js

English | [한국어](README.ko.md)

Unofficial TypeScript library for reading and exporting Eastward assets.

Node.js 24+ required. No browser support.

## Installation

```sh
npm install eastward.js
```

## How to use

Extract assets from the game folder:

```js
import { Eastward, registerAll } from 'eastward.js';

const eastward = new Eastward({ root: '/path/to/Eastward' });
await eastward.init();
registerAll(eastward);
await eastward.extractTo('./assets');
```

To extract one type, replace `registerAll` with:

```js
import { LocalePackAsset } from 'eastward.js';

eastward.registerAssetLoader('locale_pack', LocalePackAsset);
```

## CLI

```sh
npx eastward extract --root "/path/to/Eastward" --out ./assets
```

Use `--type` to select an asset type. See `npx eastward --help` for other commands.

Export editable files:

```sh
npx eastward restore-project --root "/path/to/Eastward" --out ./source-project
```

Keep `.eastward-project.json` with the exported files. Project settings and editing data missing from the game cannot be recovered. Use `export-project` for a resource backup instead.

Lua source export uses the [native decompiler](https://github.com/VriskaSerket51/node-luajit-decompiler). Decompiled code may differ from the original source.

## Development

```sh
npm ci
npm run build
```

Output: `dist/`.

## Documentation

The HMG file layout is documented in the [HMG format guide](docs/hmg-format.md).
