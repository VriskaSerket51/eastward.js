// Import necessary modules
import { create } from "xmlbuilder2";

// Define interfaces for the FSM structure
interface State {
  id: string;
  name: string;
  localName: string;
  type: string;
  jump?: { [event: string]: JumpTarget };
  next?: { [event: string]: JumpTarget };
}

interface JumpTarget {
  [key: string]: any;
}

interface FSM {
  [stateName: string]: State;
}

// Function to generate the GraphML content from the FSM
export function generateGraphML(fsm: FSM): string {
  const doc = create({ version: "1.0", encoding: "UTF-8" }).ele("graphml", {
    xmlns: "http://graphml.graphdrawing.org/xmlns",
    "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
    "xsi:schemaLocation":
      "http://graphml.graphdrawing.org/xmlns " +
      "http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd",
  });

  // Define data keys for node and edge labels
  doc.ele("key", {
    id: "d0",
    for: "node",
    "attr.name": "label",
    "attr.type": "string",
  });
  doc.ele("key", {
    id: "d1",
    for: "edge",
    "attr.name": "label",
    "attr.type": "string",
  });

  // Create a <graph> element
  const graph = doc.ele("graph", { id: "G", edgedefault: "directed" });

  // Mapping from state names to node IDs
  const stateToNodeId: { [stateName: string]: string } = {};
  let nodeIdCounter = 0;

  // Add nodes (states)
  for (const stateName in fsm) {
    const state = fsm[stateName];
    const nodeId = `n${nodeIdCounter++}`;
    stateToNodeId[stateName] = nodeId;

    const node = graph.ele("node", { id: nodeId });
    // Add label data
    node.ele("data", { key: "d0" }).txt(state.localName || state.name);
  }

  // Add edges (transitions)
  for (const stateName in fsm) {
    const state = fsm[stateName];
    const sourceNodeId = stateToNodeId[stateName];

    // Process 'jump' transitions
    if (state.jump) {
      for (const event in state.jump) {
        const targetInfo = state.jump[event];
        const targetStateName =
          typeof targetInfo == "object"
            ? targetInfo[Object.keys(targetInfo).length - 1]
            : targetInfo;
        const targetNodeId = stateToNodeId[targetStateName];

        const edge = graph.ele("edge", {
          source: sourceNodeId,
          target: targetNodeId,
        });
        edge.ele("data", { key: "d1" }).txt(event);
      }
    }

    // Process 'next' transitions (unconditional)
    if (state.next) {
      for (const condition in state.next) {
        const targetInfo = state.next[condition];
        const targetStateName =
          typeof targetInfo == "object"
            ? targetInfo[Object.keys(targetInfo).length - 1]
            : targetInfo;
        const targetNodeId = stateToNodeId[targetStateName];

        const edge = graph.ele("edge", {
          source: sourceNodeId,
          target: targetNodeId,
        });
        const label = condition === "true" ? "True" : condition;
        edge.ele("data", { key: "d1" }).txt(label);
      }
    }
  }

  // Convert the XML document to a string
  const xmlString = doc.end({ prettyPrint: true });
  return xmlString;
}
