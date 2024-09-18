import { Asset, AssetNode } from "@/asset/node";
import { Eastward } from "@/eastward";
import { writeFileSync } from "fs";
import fs from "fs/promises";
import { LocalePackAsset } from "./locale";

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

  decompileNode(node: any, indentLevel: number) {
    const indent = "\t".repeat(indentLevel);
    let output = "";

    switch (node.type) {
      case "label":
        output += `${indent}!${node.id}\n`;
        break;

      case "context":
        output += `${indent}@${node.names.join(",")}\n`;
        break;

      case "tag":
        output += indent;
        node.tags.forEach(([tagName, tagParam]: string | null[]) => {
          output += `#${tagName}`;
          if (tagParam) {
            output += `(${tagParam})`;
          }
          output += " ";
        });
        output = output.trimEnd() + "\n";
        break;

      case "directive":
        output += `${indent}$${node.name}`;
        if (node.value !== undefined && node.value !== null) {
          output += `:${node.value}`;
        }
        output += "\n";
        break;

      case "action":
        if (node.lineCount > 1) {
          output += `${indent}${node.sub ? "." : ""}${node.name}`;
          if (node.args && node.args.length > 0) {
            output += ` ${node.args[0]}`;
          }
          output += ":\n";
          for (let i = 1; i < node.args.length; i++) {
            output += `${indent}\t${node.args[i]}\n`;
          }
        } else {
          output += `${indent}${node.sub ? "." : ""}${node.name}`;
          if (node.args && node.args.length > 0) {
            output += ` ${node.args.join(" ")}`;
          }
          output += "\n";
        }
        break;

      default:
        break;
    }

    if (node.inlineDirectives && node.inlineDirectives.length > 0) {
      output = output.trimEnd();
      output += " //";
      node.inlineDirectives.forEach((inlineDirective: any) => {
        output += `$${inlineDirective.name}`;
        if (inlineDirective.value) {
          output += `(${inlineDirective.value})`;
        } else {
          output += "()";
        }
        output += " ";
      });
      output = output.trimEnd() + "\n";
    }

    if (node.children && node.children.length > 0) {
      node.children.forEach((child: any) => {
        output += this.decompileNode(child, indentLevel + 1);
      });
    }

    return output;
  }

  async _getData(locale?: string) {
    if (locale) {
      let localePack: LocalePackAsset | null = null;

      const nodes = this.eastward.getAssetNodes("locale_pack");
      for (const node of nodes) {
        const pack = await this.eastward.loadAsset<LocalePackAsset>(node.path);
        if (!pack || !pack.config) {
          continue;
        }
        for (const item of pack.config.items) {
          if (item.path == this.node.path) {
            localePack = pack;
            break;
          }
        }

        if (localePack) {
          break;
        }
      }

      if (localePack) {
        function helper(sq: SQScriptAsset, node: any, directives: string[]) {
          if (node.type == "action") {
            if (
              node.name == "say" ||
              node.name == "shout" ||
              node.name == "emo"
            ) {
              const directive = directives.pop();
              if (directive) {
                directives.push(directive);
                const result = localePack?.translate(
                  sq.node.path,
                  directive,
                  locale!
                );
                if (result) {
                  node.args = result.split("\n");
                }
              }
            }
          } else if (node.type == "directive") {
            if (node.name == "id") {
              directives.push(node.value);
            }
          }

          if (node.children && node.children.length > 0) {
            node.children.forEach((node: any) => {
              helper(sq, node, directives);
            });
          }
        }

        helper(this, this.raw, []);
      }
    }

    return this.raw;
  }

  async decompile(locale?: string) {
    const data = await this._getData(locale);

    let script = "";

    if (data.type === "root" && data.children) {
      data.children.forEach((child: any) => {
        script += this.decompileNode(child, 0);
      });
    }

    return script;
  }

  async saveFile(filePath: string) {
    super.beforeSave(filePath);
    await fs.writeFile(filePath, await this.decompile());
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
