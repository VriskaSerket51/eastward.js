import path from "node:path";
import { parseStringPromise } from "xml2js";

interface Mesh {
  MaterialIndex: number;
  Positions: string[];
  Normals: string[];
  TextureCoords: string[];
  FaceList: string[];
}

interface SceneData {
  MeshList: Mesh[];
}

interface Material {
  name: string;
  ambient: string;
  diffuse: string;
  specular: string;
  opacity: string;
  diffuseMap?: string;
  normalMap?: string;
}

async function parseXML(
  xmlContent: string,
): Promise<{ sceneData: SceneData; materials: Material[] }> {
  const result = await parseStringPromise(xmlContent);

  const meshList = result.ASSIMP.Scene[0].MeshList?.[0].Mesh ?? [];

  const meshes: Mesh[] = meshList.map((mesh: any) => {
    const positionsText = mesh.Positions[0]._;
    const positions = positionsText
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line)
      .map((line: string) => line.split(/\s+/).slice(0, 3).join(" "));

    const normalsText = mesh.Normals?.[0]._ ?? "";
    const normals = normalsText
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line)
      .map((line: string) => line.split(/\s+/).slice(0, 3).join(" "));

    const texCoordsText = mesh.TextureCoords?.[0]._ ?? "";
    const texCoords = texCoordsText
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line)
      .map((line: string) => line.split(/\s+/).slice(0, 2).join(" "));

    const faceList = mesh.FaceList?.[0].Face ?? [];
    const faces = faceList.map((face: any) =>
      (typeof face === "string" ? face : face._).trim().split(/\s+/).join(" "),
    );

    return {
      MaterialIndex: Number(mesh.$?.material_index ?? 0),
      Positions: positions,
      Normals: normals,
      TextureCoords: texCoords,
      FaceList: faces,
    };
  });

  const materialList = result.ASSIMP.Scene[0].MaterialList?.[0].Material ?? [];
  const materials: Material[] = materialList.map((mat: any) => {
    const properties = mat.MatPropertyList[0].MatProperty;
    const material: Material = {
      name: "Material_" + materialList.indexOf(mat),
      ambient: "0 0 0",
      diffuse: "1 1 1",
      specular: "0 0 0",
      opacity: "1.0",
    };

    properties.forEach((prop: any) => {
      const key = prop.$.key;
      const value = prop._.trim().replace(/"/g, "");
      switch (key) {
        case "?mat.name":
          material.name = value;
          break;
        case "$clr.ambient":
          material.ambient = value;
          break;
        case "$clr.diffuse":
          material.diffuse = value;
          break;
        case "$clr.specular":
          material.specular = value;
          break;
        case "$mat.opacity":
          material.opacity = value;
          break;
        case "$tex.file":
          const texUsage = prop.$.tex_usage;
          const texName = `${path.posix.parse(value.replace(/\\/g, "/")).name}.png`;
          if (texUsage === "Diffuse") {
            material.diffuseMap = texName;
          } else if (texUsage === "Normals") {
            material.normalMap = texName;
          }
          break;
      }
    });

    return material;
  });

  return {
    sceneData: {
      MeshList: transformMeshes(meshes, result.ASSIMP.Scene[0].Node ?? []),
    },
    materials,
  };
}

function transformMeshes(meshes: Mesh[], nodes: any[]): Mesh[] {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const output: Mesh[] = [];
  const multiply = (a: number[], b: number[]) =>
    Array.from({ length: 16 }, (_, i) => {
      const row = Math.floor(i / 4),
        col = i % 4;
      return [0, 1, 2, 3].reduce(
        (sum, k) => sum + a[row * 4 + k] * b[k * 4 + col],
        0,
      );
    });
  const text = (element: any) =>
    typeof element === "string" ? element : (element?._ ?? "");
  const visit = (node: any, parent: number[]) => {
    const local = node.Matrix4
      ? text(node.Matrix4[0]).trim().split(/\s+/).map(Number)
      : identity;
    if (local.length !== 16 || !local.every(Number.isFinite))
      throw new Error("Invalid mesh node transform");
    const world = multiply(parent, local);
    const [a, b, c, , d, e, f, , g, h, i] = world;
    const cofactors = [
      e * i - f * h,
      f * g - d * i,
      d * h - e * g,
      c * h - b * i,
      a * i - c * g,
      b * g - a * h,
      b * f - c * e,
      c * d - a * f,
      a * e - b * d,
    ];
    const determinant = a * cofactors[0] + b * cofactors[1] + c * cofactors[2];
    const refs = text(node.MeshRefs?.[0]).trim();
    if (refs)
      for (const index of refs.split(/\s+/).map(Number)) {
        const mesh = meshes[index];
        if (!mesh) throw new Error("Invalid mesh node reference: " + index);
        if (!determinant && mesh.Normals.length)
          throw new Error("Singular mesh normal transform");
        output.push({
          ...mesh,
          Positions: mesh.Positions.map((value) => {
            const [x, y, z] = value.split(" ").map(Number);
            return [
              world[0] * x + world[1] * y + world[2] * z + world[3],
              world[4] * x + world[5] * y + world[6] * z + world[7],
              world[8] * x + world[9] * y + world[10] * z + world[11],
            ].join(" ");
          }),
          Normals: mesh.Normals.map((value) => {
            const vector = value.split(" ").map(Number);
            const normal = [0, 1, 2].map((row) =>
              [0, 1, 2].reduce(
                (sum, col) =>
                  sum + (cofactors[row * 3 + col] * vector[col]) / determinant,
                0,
              ),
            );
            const length = Math.hypot(...normal);
            return normal.map((v) => (length ? v / length : 0)).join(" ");
          }),
          FaceList:
            determinant < 0
              ? mesh.FaceList.map((face) => face.split(" ").reverse().join(" "))
              : mesh.FaceList,
        });
      }
    for (const child of node.NodeList?.[0].Node ?? []) visit(child, world);
  };
  for (const node of nodes) visit(node, identity);
  return output.length ? output : meshes;
}

function generateOBJ(sceneData: SceneData, materials: Material[]): string {
  let objContent = "";

  objContent += `mtllib output.mtl\n\n`;

  let vertexOffset = 0;
  let textureOffset = 0;
  let normalOffset = 0;

  sceneData.MeshList.forEach((mesh, meshIndex) => {
    objContent += `o Mesh_${meshIndex}\n`;

    const material = materials[mesh.MaterialIndex];
    if (material) objContent += `usemtl ${material.name}\n`;

    mesh.Positions.forEach((pos) => {
      objContent += `v ${pos}\n`;
    });

    mesh.TextureCoords.forEach((tex) => {
      objContent += `vt ${tex}\n`;
    });

    mesh.Normals.forEach((norm) => {
      objContent += `vn ${norm}\n`;
    });

    objContent += "\n";

    mesh.FaceList.forEach((face) => {
      const indices = face.split(" ").map((index) => {
        const i = Number(index);
        if (!Number.isInteger(i) || i < 0 || i >= mesh.Positions.length)
          throw new Error("Invalid mesh face index");
        const vertex = i + 1 + vertexOffset;
        const texture = mesh.TextureCoords.length ? i + 1 + textureOffset : "";
        const normal = mesh.Normals.length ? i + 1 + normalOffset : "";
        return texture || normal
          ? `${vertex}/${texture}${normal ? "/" + normal : ""}`
          : String(vertex);
      });
      objContent += `f ${indices.join(" ")}\n`;
    });

    objContent += "\n";

    vertexOffset += mesh.Positions.length;
    textureOffset += mesh.TextureCoords.length;
    normalOffset += mesh.Normals.length;
  });

  return objContent;
}

function generateMTL(materials: Material[]): string {
  let mtlContent = "";

  materials.forEach((mat) => {
    mtlContent += `newmtl ${mat.name}\n`;
    mtlContent += `Ka ${mat.ambient}\n`;
    mtlContent += `Kd ${mat.diffuse}\n`;
    mtlContent += `Ks ${mat.specular}\n`;
    mtlContent += `d ${mat.opacity}\n`;
    if (mat.diffuseMap) {
      mtlContent += `map_Kd ${mat.diffuseMap}\n`;
    }
    if (mat.normalMap) {
      mtlContent += `map_bump ${mat.normalMap}\n`;
    }
    mtlContent += `\n`;
  });

  return mtlContent;
}

export async function xml2mesh(xmlContent: string) {
  const { sceneData, materials } = await parseXML(xmlContent);
  const obj = generateOBJ(sceneData, materials);
  const mtl = generateMTL(materials);
  const tex: string[] = [];

  materials.forEach((mat) => {
    if (mat.diffuseMap) {
      tex.push(mat.diffuseMap);
    }
    if (mat.normalMap) {
      tex.push(mat.normalMap);
    }
  });

  return {
    obj,
    mtl,
    tex: [...new Set(tex)],
  };
}
