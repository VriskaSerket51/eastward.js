import { Asset, AssetNode } from "@/asset/node";
import { Eastward } from "@/eastward";
import { writeFileSync } from "fs";
import fs from "fs/promises";
import { LocalePackAsset } from "./locale";
import { decompileSQ } from "@/util/sq";

export class SQScriptAsset extends Asset {
  raw: any;
  root: SQNodeRoot | null = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.JSON;
  }

  async toString(): Promise<string | null> {
    return JSON.stringify(this.raw);
  }

  async load() {
    let data = await this.eastward.loadMsgPackFile(
      this.node.objectFiles!.packed_data
    );
    if (!data) {
      data = await this.eastward.loadJSONFile(this.node.objectFiles!.data);
    }
    this.raw = data;
    if (!data) {
      return;
    }
    this.root = createNode(data) as SQNodeRoot;
  }

  async saveFile(filePath: string) {
    if (!this.raw) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(filePath, decompileSQ(this.raw));
  }

  async saveBuildFile(filePath: string) {
    if (!this.root) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(filePath, JSON.stringify(this.root.build()));
  }
}

function createNode(data: any) {
  switch (data.type) {
    case "root":
      return new SQNodeRoot(data);
    case "action":
      return new SQNodeAction(data);
    case "context":
      return new SQNodeContext(data);
    case "directive":
      return new SQNodeDirective(data);
    default:
      return new SQNode(data);
  }
}

class SQNode {
  children: SQNode[];
  _isNeeded: boolean | null = null;
  constructor(data: any) {
    const children = data.children;
    if (Array.isArray(children)) {
      this.children = children.map((child) => createNode(child));
    } else {
      this.children = [];
    }
  }

  isNeeded() {
    if (this._isNeeded != null) {
      return this._isNeeded;
    }

    for (const child of this.children) {
      if (child.isNeeded()) {
        this._isNeeded = true;
        return true;
      }
    }

    this._isNeeded = false;
    return false;
  }
}

class SQNodeRoot extends SQNode {
  file;
  cache: any;
  constructor(data: any) {
    super(data);
    this.file = data.file as string;
  }

  build(force?: boolean) {
    if (this.cache && !force) {
      return this.cache;
    }
    this.cache = {
      type: "root",
      file: this.file,
      children: [],
    };
    this._build(this.cache.children, this, [], []);

    return this.cache;
  }

  _build(list: any[], node: SQNode, contexts: string[], directives: string[]) {
    if (!node.isNeeded()) {
      return;
    }

    const obj: any = {};
    let isTalk = false;
    if (node instanceof SQNodeAction) {
      switch (node.name) {
        case "say":
        case "shout":
        case "emo":
          const context = contexts.pop();

          if (context) {
            contexts.push(context);

            obj.chara = context.replace("CH_", "");
            const directive = directives.pop();
            if (directive) {
              directives.push(directive);
              obj.directive = directive;
            }
            obj.fallback = node.args.join("\n");
            isTalk = true;
          }
          break;
        default:
          obj.type = node.name;
          if (node.args.length > 0) {
            obj.args = node.args;
          }
          break;
      }
    } else if (node instanceof SQNodeContext) {
      contexts.length = 0;
      contexts.push(...node.contexts);
    } else if (node instanceof SQNodeDirective) {
      if (node.name == "id") {
        directives.push(node.value);
      }
    }

    const children: any[] = [];
    const childContexts = [...contexts];
    for (const child of node.children) {
      this._build(children, child, childContexts, directives);
    }

    if (children.length > 0) {
      obj.children = children;
    }

    if (Object.keys(obj).length > 0) {
      if (isTalk || children.length != 0) {
        list.push(obj);
      }
    }
  }
}

class SQNodeAction extends SQNode {
  name;
  args;
  constructor(data: any) {
    super(data);
    this.name = data.name as string;
    this.args = data.args as string[];
  }

  isNeeded(): boolean {
    if (this._isNeeded != null) {
      return this._isNeeded;
    }

    const value =
      this.name == "say" || this.name == "shout" || this.name == "emo";

    if (super.isNeeded()) {
      return true;
    }

    this._isNeeded = value;
    return value;
  }
}

class SQNodeContext extends SQNode {
  contexts;
  constructor(data: any) {
    super(data);
    this.contexts = data.names as string[];
  }

  isNeeded(): boolean {
    return true;
  }
}

class SQNodeDirective extends SQNode {
  name;
  value;
  constructor(data: any) {
    super(data);
    this.name = data.name as string;
    this.value = data.value as string;
  }

  isNeeded(): boolean {
    return true;
  }
}
