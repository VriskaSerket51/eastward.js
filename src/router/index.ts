import { Router, Request, Response } from "express";
import { RouterMiddleware } from "../middlewares";
import { readAllFiles } from "../utils";

export const createRouterByFiles = (
  dirName: string,
  modelMiddleware: RouterMiddleware
): Router => {
  const defaultRouter = Router();

  if (!dirName) {
    return defaultRouter;
  }

  const fileNames: string[] = [];
  readAllFiles(
    dirName,
    fileNames,
    (fileName) =>
      fileName.endsWith(".ts") ||
      fileName.endsWith(".js") ||
      fileName.endsWith(".mjs")
  );

  fileNames.forEach((fileName) => {
    const module = require(fileName).default;
    if (!module || !(module.prototype instanceof RouterBase)) {
      return;
    }
    const subrouter: RouterBase = new module();

    const router = Router();
    subrouter.models.forEach((model) => {
      router[model.method](
        model.path,
        ...modelMiddleware(model),
        model.controller
      );
    });
    defaultRouter.use(subrouter.path, router);
  });

  return defaultRouter;
};

export interface ModelBase {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  authType?: "access" | "refresh" | "optional";
  permission?: number;
  controller: (req: Request, res: Response) => any;
}

export class RouterBase {
  path: string = "";
  models: ModelBase[] = [];

  constructor() {}

  setPath(path: string) {
    this.path += path;
  }
}
