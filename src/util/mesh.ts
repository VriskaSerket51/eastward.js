import path from "path";
import { parseStringPromise } from "xml2js";

interface Mesh {
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
  xmlContent: string
): Promise<{ sceneData: SceneData; materials: Material[] }> {
  const result = await parseStringPromise(xmlContent);

  const meshList = result.ASSIMP.Scene[0].MeshList[0].Mesh;

  const meshes: Mesh[] = meshList.map((mesh: any) => {
    const positionsText = mesh.Positions[0]._;
    const positions = positionsText
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line)
      .map((line: string) => line.split(/\s+/).slice(0, 3).join(" "));

    const normalsText = mesh.Normals[0]._;
    const normals = normalsText
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line)
      .map((line: string) => line.split(/\s+/).slice(0, 3).join(" "));

    const texCoordsText = mesh.TextureCoords[0]._;
    const texCoords = texCoordsText
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line)
      .map((line: string) => line.split(/\s+/).slice(0, 2).join(" "));

    const faceList = mesh.FaceList[0].Face;
    const faces = faceList.map((face: any) =>
      face._.trim().split(/\s+/).slice(0, 3).join(" ")
    );

    return {
      Positions: positions,
      Normals: normals,
      TextureCoords: texCoords,
      FaceList: faces,
    };
  });

  const materialList = result.ASSIMP.Scene[0].MaterialList[0].Material;
  const materials: Material[] = materialList.map((mat: any) => {
    const properties = mat.MatPropertyList[0].MatProperty;
    const material: Material = {
      name: "",
      ambient: "",
      diffuse: "",
      specular: "",
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
          const texName = `${path.parse(value).name}.png`
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
    sceneData: { MeshList: meshes },
    materials,
  };
}

function generateOBJ(sceneData: SceneData, materials: Material[]): string {
  let objContent = "";

  objContent += `mtllib output.mtl\n\n`;

  let vertexOffset = 0;

  sceneData.MeshList.forEach((mesh, meshIndex) => {
    objContent += `o Mesh_${meshIndex}\n`;

    const material = materials[meshIndex % materials.length];
    objContent += `usemtl ${material.name}\n`;

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
      const indices = face
        .split(" ")
        .map((index) => parseInt(index) + 1 + vertexOffset);
      objContent += `f ${indices[0]}/${indices[0]}/${indices[0]} ${indices[1]}/${indices[1]}/${indices[1]} ${indices[2]}/${indices[2]}/${indices[2]}\n`;
    });

    objContent += "\n";

    vertexOffset += mesh.Positions.length;
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
    tex,
  };
}
