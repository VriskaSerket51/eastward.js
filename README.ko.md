# eastward.js

[English](README.md) | 한국어

Eastward 에셋을 읽고 내보내는 비공식 TypeScript 라이브러리입니다.

> Node.js 24 이상이 필요합니다. 브라우저는 지원하지 않습니다.

## 설치

```sh
npm install eastward.js
```

## 사용 방법

게임 폴더에서 에셋을 추출합니다.

```js
import { Eastward, registerAll } from 'eastward.js';

const eastward = new Eastward({ root: '/path/to/Eastward' });
await eastward.init();
registerAll(eastward);
await eastward.extractTo('./assets');
```

특정 종류만 추출하려면 `registerAll` 대신 해당 로더를 등록합니다.

```js
import { LocalePackAsset } from 'eastward.js';

eastward.registerAssetLoader('locale_pack', LocalePackAsset);
```

## CLI 사용법

```sh
npx eastward extract --root "/path/to/Eastward" --out ./assets
```

`--type`으로 종류를 지정할 수 있습니다. 전체 명령은 `npx eastward --help`에서 확인할 수 있습니다.

편집용 파일 추출:

```sh
npx eastward restore-project --root "/path/to/Eastward" --out ./source-project
```

> `.eastward-project.json`은 추출 파일과 함께 보관해야 합니다.
> 게임에 없는 프로젝트 설정과 편집 정보는 복구할 수 없습니다. 리소스 백업에는 `export-project`를 사용합니다.

Lua 소스 추출에는 [네이티브 디컴파일러](https://github.com/VriskaSerket51/node-luajit-decompiler)를 사용합니다. 결과는 원본 소스와 다를 수 있습니다.

## 개발 방법

```sh
npm ci
npm run build
```

빌드 결과는 `dist/`에 생성됩니다.

## 관련 문서

HMG 파일 구조는 [HMG 포맷 문서](docs/hmg-format.ko.md)에 정리되어 있습니다.
