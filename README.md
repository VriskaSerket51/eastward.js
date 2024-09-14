# eastward.js

Typescript library for imort/export assets of the video game Eastward.

**No Browser Support**

## Installation into an existing project

To install `eastward.js` as a dependency of your Node.js project:

```sh
npm install eastward.js
```

`eastward.js` is made with TypeScript.

## How to use

Example for extract some assets from the root game folder.

```javascript
import { Eastward, registerAll } from "eastward.js";

const root = "C:/SteamLibrary/steamapps/common/Eastward";
const eastward = new Eastward({ root });
await eastward.init();
registerAll(eastward); // register all asset types

await eastward.extractTo("./extract");

console.log("extracting finished");
```

Or you can just extract some types of assets.

```javascript
import { Eastward, LocalePackAsset } from "eastward.js";

const root = "C:/SteamLibrary/steamapps/common/Eastward";
const eastward = new Eastward({ root });
await eastward.init();
eastward.registerAssetLoader("locale_pack", LocalePackAsset);

await eastward.extractTo("./extract_locale_pack");

console.log("extracting locale_pack finished");
```

Example for reading asset from archive.

```javascript
import { GArchive } from "eastward.js";
import { writeFile } from "fs/promises";

const archive = new GArchive();
await archive.load(
  "C:/SteamLibrary/steamapps/common/Eastward/content/game/locale.g"
);

const localePackData = await archive.getFileData(
  "1fbba5dfab829f507358f58c1c2dc59a"
);
if (localePackData == null) {
  process.exit(-1);
}
writeFile("./CH1.lua", localePackData);
```

Example for writing asset to archive.

```javascript
import { GArchive } from "eastward.js";
import { readFile } from "fs/promises";

const archive = new GArchive();
await archive.load(
  "C:/SteamLibrary/steamapps/common/Eastward/content/game/locale.g"
);
const data = await readFile("./CH1.lua");

await archive.setFileData("1fbba5dfab829f507358f58c1c2dc59a", data);

await archive.saveFile("./locale.g");
```
