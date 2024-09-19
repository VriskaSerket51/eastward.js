import { AssetNode } from "@/asset/node";
import { Eastward } from "@/eastward";
import { init, translateAsset } from "./translate";

function decompileSQNode(node: any, indentLevel: number) {
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
      output += decompileSQNode(child, indentLevel + 1);
    });
  }

  return output;
}

export function decompileSQ(data: any) {
  let script = "";

  if (data.type === "root" && data.children) {
    data.children.forEach((child: any) => {
      script += decompileSQNode(child, 0);
    });
  }

  return script;
}

async function translateSQ(
  eastward: Eastward,
  path: string,
  data: any,
  lang: string
) {
  await init(eastward);
  const translation = translateAsset(path, lang);

  function helper(node: any, directives: string[]) {
    if (node.type == "action") {
      if (
        node.name == "say" ||
        node.name == "shout" ||
        node.name == "emo"
      ) {
        const directive = directives.pop();
        if (directive) {
          directives.push(directive);
          const result = translation[directive];

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
        helper(node, directives);
      });
    }
  }

  helper(data, []);

  return data;
}
