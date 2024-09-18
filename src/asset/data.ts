import { Asset, AssetNode } from "@/asset/node";
import { Eastward } from "@/eastward";
import { writeFileSync } from "fs";
import fs from "fs/promises";
import xlsx from "xlsx";

export class DataJsonAsset extends Asset {
  data: any = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.JSON;
  }

  async toString(): Promise<string | null> {
    if (!this.data) {
      return null;
    }
    return JSON.stringify(this.data);
  }

  async load() {
    this.data = await this.eastward.loadJSONFile(this.node.objectFiles!.data);
  }

  async saveFile(filePath: string) {
    if (!this.data) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(filePath, JSON.stringify(this.data));
  }
}

export class DataCsvAsset extends Asset {
  data: string[][] | null = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.CSV;
  }

  async toString(): Promise<string | null> {
    if (!this.data) {
      return null;
    }
    return this.data.map((row) => row.join(",")).join("\n");
  }

  async load() {
    const data = await this.eastward.loadJSONFile(this.node.objectFiles!.data);

    if (this.node.name.endsWith(".list.csv")) {
      this.data = [];
      const list = data as any[];
      if (list.length > 0) {
        this.data.push(Object.keys(list[0]));
        list.forEach((row) => {
          this.data?.push(
            Object.values(row).map((v) => {
              if (v == null) {
                return "";
              }
              if (String(v).includes(",")) {
                return `"${v}"`;
              }
              return String(v);
            })
          );
        });
      }
    } else if (this.node.name.endsWith(".dict.csv")) {
      this.data = [];
      this.data.push(Object.keys(data));
      this.data.push(
        Object.values(data).map((v) => {
          if (v == null) {
            return "";
          }
          if (String(v).includes(",")) {
            return `"${v}"`;
          }
          return String(v);
        })
      );
    } else {
      this.data = data;
    }
  }

  async saveFile(filePath: string) {
    if (!this.data) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(
      filePath,
      this.data.map((row) => row.join(",")).join("\n")
    );
  }
}

export class DataXlsAsset extends Asset {
  data: any | null = null;
  metaData: any | null = null;

  constructor(eastward: Eastward, node: AssetNode) {
    super(eastward, node);
  }

  get type(): string {
    return Asset.Type.JSON;
  }

  async toString(): Promise<string | null> {
    if (!this.data) {
      return null;
    }
    return JSON.stringify(this.data);
  }

  async load() {
    this.data = await this.eastward.loadJSONFile(this.node.objectFiles!.data);
    this.metaData = await this.eastward.loadJSONFile(
      this.node.objectFiles!.meta_data
    );
  }

  toWorkbook(data: any, metadata: any) {
    const workbook = xlsx.utils.book_new();

    for (const sheetId in data) {
      if (data.hasOwnProperty(sheetId)) {
        const sheetData = data[sheetId];
        const sheetMeta = metadata[sheetId];

        let worksheet: xlsx.WorkSheet;

        switch (sheetMeta.type) {
          case "list":
            worksheet = this._createListWorksheet(sheetData, sheetMeta);
            break;
          case "vlist":
            worksheet = this._createVListWorksheet(sheetData, sheetMeta);
            break;
          case "dict":
            worksheet = this._createDictWorksheet(sheetData, sheetMeta);
            break;
          case "raw":
            worksheet = this._createRawWorksheet(sheetData);
            break;
          default:
            throw new Error(`Unknown sheet type: ${sheetMeta.type}`);
        }

        xlsx.utils.book_append_sheet(workbook, worksheet, sheetId);
      }
    }

    return workbook;
  }

  _createListWorksheet(sheetData: any[], sheetMeta: any): xlsx.WorkSheet {
    const { keys } = sheetMeta;
    const worksheetData = [keys];

    for (const row of sheetData) {
      const rowData = [];
      for (const key of keys) {
        rowData.push(row[key]);
      }
      worksheetData.push(rowData);
    }

    return xlsx.utils.aoa_to_sheet(worksheetData);
  }

  _createVListWorksheet(sheetData: any[], sheetMeta: any): xlsx.WorkSheet {
    const { keys } = sheetMeta;

    const transposedData = keys.map((key: string) => [key]);

    for (const row of sheetData) {
      let i = 0;
      for (const key of keys) {
        transposedData[i].push(row[key]);
        i++;
      }
    }

    return xlsx.utils.aoa_to_sheet(transposedData);
  }

  _createDictWorksheet(
    sheetData: { [key: string]: any },
    sheetMeta: any
  ): xlsx.WorkSheet {
    const { sequence, comment } = sheetMeta;
    const worksheetData = [["Key", "Value", "Comment"]];

    for (const key of sequence) {
      worksheetData.push([key, sheetData[key], comment[key] || ""]);
    }

    return xlsx.utils.aoa_to_sheet(worksheetData);
  }

  _createRawWorksheet(sheetData: any[][]): xlsx.WorkSheet {
    return xlsx.utils.aoa_to_sheet(sheetData);
  }

  async saveFile(filePath: string) {
    if (!this.data || !this.metaData) {
      return;
    }
    super.beforeSave(filePath);
    const workbook = this.toWorkbook(this.data, this.metaData);
    xlsx.writeFile(workbook, filePath, { bookType: "xls" });
  }
}
