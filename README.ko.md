# eastward.js

[English](README.md) | 한국어

Eastward 에셋을 읽고 내보내는 비공식 TypeScript 라이브러리입니다.

**브라우저는 지원하지 않습니다.**

Node.js 24 이상이 필요합니다.

## 설치

```sh
npm install eastward.js
```

## 사용 방법

### CLI 사용법

`npx eastward --help`로 사용법을 볼 수 있습니다.

에셋을 추출하는 예제입니다.

```sh
npx eastward extract --root "/path/to/Eastward" --out ./assets
```

`--type`으로 추출할 에셋 종류를 지정할 수 있습니다.

편집용 파일 트리와 리소스 백업을 만드는 예제입니다.

```sh
npx eastward restore-project --root "/path/to/Eastward" --out ./source-project
npx eastward export-project --root "/path/to/Eastward" --out ./resource-backup
```

`restore-project`는 게임에 포함된 에셋과 인덱스를 바탕으로 편집용 파일 트리를 만듭니다. 배포본에 없는 원본 프로젝트 설정과 편집 정보는 복원하지 못합니다. `export-project`는 인덱스와 리소스를 함께 보관합니다.

| 명령 | 기능 |
| --- | --- |
| `unzip`, `zip`, `inject` | `.g` 추출, 생성, 파일 교체 |
| `hmg2png`, `png2hmg` | HMG/PNG 변환 |
| `json2msg` | JSON을 MessagePack으로 변환 |

### 코드에서 사용

게임 폴더에서 에셋을 추출하는 예제입니다.

```js
import { Eastward, registerAll } from 'eastward.js';

const eastward = new Eastward({ root: '/path/to/Eastward' });
await eastward.init();
registerAll(eastward);
await eastward.extractTo('./assets');
```

필요한 에셋 종류만 등록할 수도 있습니다.

```js
import { Eastward, LocalePackAsset } from 'eastward.js';

const eastward = new Eastward({ root: '/path/to/Eastward' });
await eastward.init();
eastward.registerAssetLoader('locale_pack', LocalePackAsset);
await eastward.extractTo('./locales');
```

LuaJIT 바이트코드를 Lua 코드로 변환하려면 네이티브 디컴파일러가 필요합니다. 결과는 개발자가 작성한 원본 소스와 다를 수 있습니다. 빌드 도구는 [디컴파일러 저장소](https://github.com/VriskaSerket51/node-luajit-decompiler)를 참고하세요.

## 개발

```sh
npm ci
npm run build
```

JavaScript와 타입 선언은 `dist`에 생성됩니다.

[HMG 형식](docs/hmg-format.ko.md), [언어 패치 가이드](https://github.com/VriskaSerket51/EastwardModLoader/blob/main/docs/language-patches.ko.md)도 참고하세요.
