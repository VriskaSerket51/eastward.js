export function deserialize(obj: any, data: any) {
  const map = data.map || {};
  const rootId = data.root;
  const objMap: any = {};

  if (!rootId) {
    return null;
  }

  deserializeObjectMap(map, objMap, false, rootId, obj);
  const rootTarget = objMap[rootId];

  return rootTarget[0];
}

function deserializeObjectMap(
  map: any,
  objMap: any,
  objIgnored: any,
  rootId: string,
  rootObj: any
) {
  objMap = objMap || {};
  objIgnored = objIgnored || {};

  prepareObjectMap(map, objMap, objIgnored, rootId, rootObj);
  deserializeObjectMapData(objMap, false);
  // console.log(objMap);

  return objMap;
}

function prepareObjectMap(
  map: any,
  objMap: any,
  objIgnored: any,
  rootId: string,
  rootObj: any
) {
  objMap = objMap || {};
  objIgnored = objIgnored || false;
  const objAliases: any = {};
  const ids: string[] = [];
  let idCount = 0;

  if (objIgnored) {
    for (const [id] of Object.entries(map)) {
      if (!objIgnored[id]) {
        idCount++;
        ids.push(id);
      }
    }
  } else {
    for (const [id] of Object.entries(map)) {
      idCount++;
      ids.push(id);
    }
  }

  ids.sort();

  for (let i = 0; i < idCount; i++) {
    const id = ids[i];
    const objData = map[id];
    const modelName = objData.model;

    if (!modelName) {
      let alias = objData.alias;

      if (alias) {
        const ns0 = objData.namespace;

        if (ns0) {
          alias = makeId(alias, ns0);
        }
      } else {
        objMap[id] = [objData.body, objData];
      }

      objAliases[id] = alias;
      objMap[id] = alias;
    } else {
      // const model = Model.fromName(modelName);

      // if (!model) {
      //   throw new Error(`model not found for ${objData.model}`);
      // }

      let instance = null;

      if (rootObj && id == rootId) {
        instance = rootObj;
      } else {
        // instance = model.newInstance();
        instance = {};
      }

      objMap[id] = [instance, objData];
    }
  }

  for (let [id, alias] of Object.entries<any>(objAliases)) {
    let origin = null;

    while (alias) {
      origin = objMap[alias];

      if (typeof origin == "string") {
        alias = origin;
      } else {
        break;
      }
    }

    if (!origin) {
      throw new Error(`${objMap} alias not found ${id} ${alias}`);
    }

    objMap[id] = origin;
  }

  return objMap;
}

function makeId(refId: string, namespace: string) {
  return namespace && `${refId}:${namespace || refId}`;
}

function deserializeObjectMapData(objMap: any, objIgnored: any) {
  for (const [id, item] of Object.entries<any[]>(objMap)) {
    if (!objIgnored || !objIgnored[id]) {
      const deserialized = item[2];
      if (!deserialized) {
        item.push(true);
        const obj = item[0];
        const objData = item[1];

        deserializeObject(obj, objData, objMap);
      }
    }
  }

  return objMap;
}

function deserializeObject(obj: any, data: any, objMap: any) {
  const body = data.body;
  for (const key of Object.keys(body)) {
    const value = body[key];
    if (Array.isArray(value)) {
      obj[key] = value.map(item => objMap[item] ? objMap[item][0] : item);
    }
    else {
      obj[key] = objMap[value] ? objMap[value][0] : value;
    }
  }
}
