# eastward.js

English | [한국어](README.ko.md)

An unofficial TypeScript library for reading and exporting Eastward assets.

**No browser support.**

Requires Node.js 24 or newer.

## Installation

```sh
npm install eastward.js
```

## How to use

### CLI usage

Run `npx eastward --help` for usage information.

Extract assets:

```sh
npx eastward extract --root "/path/to/Eastward" --out ./assets
```

Use `--type` to select an asset type.

Export an editable file tree or a resource backup:

```sh
npx eastward restore-project --root "/path/to/Eastward" --out ./source-project
npx eastward export-project --root "/path/to/Eastward" --out ./resource-backup
```

`restore-project` builds an editable file tree from the assets and indexes included in the game. It cannot recover original project settings or editing information absent from the shipped game. `export-project` preserves indexes and resources together.

| Command | Function |
| --- | --- |
| `unzip`, `zip`, `inject` | Extract, create or replace files in `.g` archives |
| `hmg2png`, `png2hmg` | Convert HMG/PNG images |
| `json2msg` | Convert JSON to MessagePack |

### Source code usage

Extract assets from a game directory:

```js
import { Eastward, registerAll } from 'eastward.js';

const eastward = new Eastward({ root: '/path/to/Eastward' });
await eastward.init();
registerAll(eastward);
await eastward.extractTo('./assets');
```

You can also register only the asset types you need:

```js
import { Eastward, LocalePackAsset } from 'eastward.js';

const eastward = new Eastward({ root: '/path/to/Eastward' });
await eastward.init();
eastward.registerAssetLoader('locale_pack', LocalePackAsset);
await eastward.extractTo('./locales');
```

Converting LuaJIT bytecode to Lua code requires the native decompiler. The result may differ from the original source written by the developers. See the [decompiler repository](https://github.com/VriskaSerket51/node-luajit-decompiler) for build requirements.

## Development

```sh
npm ci
npm run build
```

JavaScript and type declarations are generated in `dist`.

See the [HMG format](docs/hmg-format.md) and [language patch guide](https://github.com/VriskaSerket51/EastwardModLoader/blob/main/docs/language-patches.md).
