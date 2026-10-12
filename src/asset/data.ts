import { Asset, AssetNode } from "#asset/node";
import { Eastward } from "#eastward";
import { writeFileSync } from "node:fs";
import fs from "node:fs/promises";
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
    if (this.data == null) {
      return null;
    }
    return JSON.stringify(this.data);
  }

  async load() {
    this.data = await this.eastward.loadJSONFile(this.node.objectFiles!.data);
  }

  async saveFile(filePath: string) {
    if (this.data == null) {
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
    if (this.data == null) {
      return null;
    }
    // A blank header row distinguishes an empty list from a missing CSV table.
    if (!this.data.length && this.node.name.endsWith(".list.csv")) {
      return "\n";
    }
    return this.data.map((row) => row.map(csvCell).join(",")).join("\n");
  }

  async load() {
    const data = await this.eastward.loadJSONFile(this.node.objectFiles!.data);

    if (this.node.name.endsWith(".list.csv")) {
      this.data = [];
      const list = data as any[];
      if (list.length > 0) {
        this.data.push(Object.keys(list[0]));
        const keys = Object.keys(list[0]);
        list.forEach((row) =>
          this.data?.push(
            keys.map((key) => (row[key] == null ? "" : String(row[key]))),
          ),
        );
      }
    } else if (this.node.name.endsWith(".dict.csv")) {
      this.data = [];
      for (const [key, value] of Object.entries(data)) {
        this.data.push([key, value == null ? "" : String(value)]);
      }
    } else {
      this.data = data;
    }
  }

  async saveFile(filePath: string) {
    if (this.data == null) {
      return;
    }
    super.beforeSave(filePath);
    await fs.writeFile(filePath, (await this.toString())!);
  }
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
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
    if (this.data == null) {
      return null;
    }
    return JSON.stringify(this.data);
  }

  async load() {
    this.data = await this.eastward.loadJSONFile(this.node.objectFiles!.data);
    this.metaData = await this.eastward.loadJSONFile(
      this.node.objectFiles!.meta_data,
    );
  }

  toWorkbook(data: any, metadata: any) {
    const workbook = xlsx.utils.book_new();

    for (const sheetId in data) {
      if (Object.hasOwn(data, sheetId)) {
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

        xlsx.utils.book_append_sheet(
          workbook,
          worksheet,
          sheetId + "@" + sheetMeta.type,
        );
      }
    }

    return workbook;
  }

  _createListWorksheet(sheetData: any[], sheetMeta: any): xlsx.WorkSheet {
    const { keys } = sheetMeta;
    const worksheetData = [
      keys.map((key: string, i: number) =>
        sheetMeta.keyMeta?.[i] === "localizable" ? "%" + key : key,
      ),
    ];

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

    const transposedData = keys.map((key: string, i: number) => [
      sheetMeta.keyMeta?.[i] === "localizable" ? "%" + key : key,
    ]);

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
    sheetMeta: any,
  ): xlsx.WorkSheet {
    const { sequence, comment } = sheetMeta;
    const worksheetData: any[][] = [];

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

/** Virtual sheet data is owned by its parent workbook, not a separate cache. */
export class DataSheetAsset extends Asset {
  data: any = null;

  get type() {
    return Asset.Type.JSON;
  }

  async load() {
    const parent = await this.eastward.loadAsset<DataXlsAsset>(
      this.node.parent,
    );
    if (!parent?.data || !Object.hasOwn(parent.data, this.node.name)) {
      throw new Error("Sheet not found: " + this.node.path);
    }
    this.data = parent.data[this.node.name];
  }

  async toString() {
    return this.data === null ? null : JSON.stringify(this.data);
  }

  async saveFile(filePath: string) {
    if (this.data === null) {
      return;
    }
    this.beforeSave(filePath);
    await fs.writeFile(filePath, JSON.stringify(this.data, null, 2));
  }
}
