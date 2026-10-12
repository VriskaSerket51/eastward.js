const xml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
type Node = {
  id: string;
  name: string;
  children?: Node[];
  description?: string;
  transition?: unknown;
};
type Edge = { from: string; to: string; label?: string; dashed?: boolean };

/** Recreates importable yEd graphs; original visual placement is not recoverable. */
export function sourceGraphML(type: string, data: any): string {
  let nodes: Node[] = [],
    edges: Edge[] = [];
  if (type === "fsm_scheme") {
    nodes = data.nodes;
    edges = data.edges;
  } else if (type === "quest_scheme") {
    nodes = data.nodes;
    edges = data.connections.map((e: any) => ({
      from: e.from,
      to: e.to,
      label: e.cond || "",
      dashed: e.type === "spawn",
    }));
  } else if (type === "scene_portal_graph") {
    const groups = new Map<string, Node>();
    const group = (name: string): Node => {
      let entry = groups.get(name);
      if (entry) {
        return entry;
      }
      const index = name.lastIndexOf("."),
        parent = index < 0 ? null : group(name.slice(0, index));
      entry = {
        id: "group_" + groups.size,
        name: index < 0 ? name : name.slice(index + 1),
        children: [],
      };
      groups.set(name, entry);
      (parent?.children ?? nodes).push(entry);
      return entry;
    };
    const ids = new Map<string, string>();
    for (const [i, node] of data.nodes.entries()) {
      ids.set(node.fullname, "portal_" + i);
      const prefix = node.fullname
        .slice(0, node.fullname.length - node.name.length)
        .replace(/\.$/, "");
      (prefix ? group(prefix).children! : nodes).push({
        id: "portal_" + i,
        name: node.name,
      });
    }
    for (const [name, value] of Object.entries(data.group_meta ?? {})) {
      group(name).children!.push({
        id: "meta_" + groups.size + "_" + name,
        name: "@" + value,
      });
    }
    edges = data.connections.map((e: any) => ({
      from: ids.get(e.a)!,
      to: ids.get(e.b)!,
      label: e.data || "",
    }));
  } else {
    throw new Error("Unsupported editable graph: " + type);
  }
  let index = 0;
  const render = (node: Node): string => {
    const n = index++,
      group = !!node.children?.length;
    const shape = group ? "GroupNode" : "ShapeNode";
    const graphics = `<y:${shape}><y:Geometry x="${(n % 8) * 180}" y="${Math.floor(n / 8) * 100}" width="120" height="60"/><y:NodeLabel x="0" y="0" width="120" height="30" fontSize="12">${xml(node.name)}</y:NodeLabel><y:BorderStyle color="#000000" type="line" width="1"/></y:${shape}>`;
    return `<node id="${xml(node.id)}"${group ? ' yfiles.foldertype="group"' : ""}><data key="d0">\n${graphics}\n</data>${node.transition ? `<data key="d2">${xml(JSON.stringify(node.transition))}</data>` : ""}${group ? `<graph id="${xml(node.id)}_graph" edgedefault="directed">${node.children!.map(render).join("\n")}</graph>` : ""}</node>`;
  };
  const edgeXML = edges
    .map(
      (edge, i) =>
        `<edge id="e${i}" source="${xml(edge.from)}" target="${xml(edge.to)}"><data key="d1">\n<y:PolyLineEdge><y:LineStyle color="#000000" type="${edge.dashed ? "dashed" : "line"}" width="1"/>${edge.label ? `<y:EdgeLabel x="0" y="0" width="120" height="30" fontSize="12">${xml(edge.label)}</y:EdgeLabel>` : ""}</y:PolyLineEdge>\n</data></edge>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<graphml xmlns="http://graphml.graphdrawing.org/xmlns" xmlns:y="http://www.yworks.com/xml/graphml"><key id="d0" for="node" yfiles.type="nodegraphics"/><key id="d1" for="edge" yfiles.type="edgegraphics"/><key id="d2" for="node" attr.name="transition" attr.type="string"/><graph id="G" edgedefault="directed">${nodes.map(render).join("\n")}\n${edgeXML}</graph></graphml>`;
}

/** The generated FSM Lua retains states and effective transitions, not ANY provenance. */
export async function sourceFSMGraphML(script: string): Promise<string> {
  const { Lua } = await import("wasmoon-lua5.1");
  const lua = await Lua.create();
  let states: Map<string, any>;
  try {
    states = (await lua.doString(script)).$detach();
  } finally {
    lua.global.close();
  }
  if (!(states instanceof Map)) {
    throw new Error("Missing generated FSM state table");
  }
  const roots: Node[] = [],
    nodes = new Map<string, Node>(),
    edges: Edge[] = [];
  for (const [name, state] of states) {
    nodes.set(name, {
      id: name,
      name: state.get("localName"),
      ...(state.get("type") === "group" ? { children: [] } : {}),
    });
  }
  for (const [name, state] of states) {
    const node = nodes.get(name)!;
    const parentName = name
      .slice(0, -state.get("localName").length)
      .replace(/\.$/, "");
    const parent = nodes.get(parentName);
    if (parentName && !parent?.children) {
      throw new Error("Missing FSM state parent: " + parentName);
    }
    (parent?.children ?? roots).push(node);
    const destination = (value: any): string =>
      value instanceof Map
        ? value.get(
            Math.max(...[...value.keys()].filter((k) => typeof k === "number")),
          )
        : value;
    const jumps = state.get("jump");
    if (jumps instanceof Map) {
      for (const [label, value] of jumps) {
        const target = destination(value);
        if (!nodes.has(target)) {
          throw new Error("Missing FSM jump target: " + target);
        }
        edges.push({ from: name, to: target, label });
      }
    }
    const next = state.get("next");
    if (next instanceof Map) {
      for (const [label, value] of next) {
        if (
          label === true &&
          [...next.entries()].some(
            ([key, v]) =>
              typeof key === "string" && destination(v) === destination(value),
          )
        ) {
          continue;
        }
        let target = destination(value);
        if (
          typeof label === "string" &&
          label.startsWith("$") &&
          label.slice(1) !== states.get(target)?.get("localName")
        ) {
          const state = states.get(target);
          target = target
            .slice(0, -state.get("localName").length)
            .replace(/\.$/, "");
        }
        if (!nodes.has(target)) {
          throw new Error("Missing FSM next target: " + target);
        }
        edges.push({ from: name, to: target });
      }
    }
  }
  // ANY nodes are omitted by compilation. Reconstruct their effective scope when
  // a group-wide transition deliberately excludes its own destination state.
  const additions = new Map<string, Node>();
  const parentOf = (name: string) =>
    name.slice(0, -states.get(name).get("localName").length).replace(/\.$/, "");
  for (let i = edges.length - 1; i >= 0; i--) {
    const edge = edges[i];
    if (!edge.label || !nodes.get(edge.from)?.children) {
      continue;
    }
    const targetJump = states.get(edge.to)?.get("jump");
    if (targetJump instanceof Map && targetJump.has(edge.label)) {
      continue;
    }
    let scope = parentOf(edge.from);
    while (true) {
      const descendants = [...states.keys()].filter((name) =>
        scope ? name.startsWith(scope + ".") : true,
      );
      if (
        descendants.every(
          (name) =>
            name === edge.to ||
            (states.get(name).get("jump") instanceof Map &&
              states.get(name).get("jump").has(edge.label)),
        )
      ) {
        const id = (scope ? scope + "." : "") + "ANY";
        if (!additions.has(id)) {
          const any = { id, name: "ANY" };
          additions.set(id, any);
          (scope ? nodes.get(scope)!.children! : roots).push(any);
        }
        edges[i] = { ...edge, from: id };
        break;
      }
      if (!scope) {
        break;
      }
      scope = parentOf(scope);
    }
  }
  const anyEdges = edges.filter((edge) => additions.has(edge.from));
  const filtered = edges.filter(
    (edge) =>
      additions.has(edge.from) ||
      !anyEdges.some((any) => {
        const scope = any.from.slice(0, -3).replace(/\.$/, "");
        return (
          edge.from !== any.to &&
          (scope ? edge.from.startsWith(scope + ".") : true) &&
          edge.label === any.label &&
          edge.to === any.to
        );
      }),
  );
  const unique = [
    ...new Map(filtered.map((edge) => [JSON.stringify(edge), edge])).values(),
  ];
  return sourceGraphML("fsm_scheme", { nodes: roots, edges: unique });
}
