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

Sample for extract some assets from the root game folder.
```javascript
import { Eastward } from "eastward.js";
import { BMFontAsset, TTFFontAsset } from "eastward.js";
import { TextureAsset } from "eastward.js";
import { LocalePackAsset } from "eastward.js";
import { SqScriptAsset } from "eastward.js";

const root = "C:/SteamLibrary/steamapps/common/Eastward";
const eastward = new Eastward(root);

await eastward.init();
eastward.registerAssetLoader("font_bmfont", BMFontAsset, true);
eastward.registerAssetLoader("font_ttf", TTFFontAsset, true);
eastward.registerAssetLoader("texture", TextureAsset, true);
eastward.registerAssetLoader("locale_pack", LocalePackAsset, true);
eastward.registerAssetLoader("sq_script", SqScriptAsset, true);

await eastward.extractTo("./extract");
console.log("extract finished");
```
