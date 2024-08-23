require("express-async-errors");
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createRouterByFiles } from "./router";
import {
  defaultErrorHandler,
  Middleware,
  RouterMiddleware,
} from "./middlewares";
import { HttpException } from "./exceptions";

export default class App {
  expressApp: express.Application;

  constructor(
    routerDir: string,
    middlewares: Middleware[],
    routerMiddleware: RouterMiddleware,
    errorHandlers: Middleware[]
  ) {
    this.expressApp = express();
    this.initMiddlewares(middlewares);
    this.initRouters(routerDir, routerMiddleware);
    this.initErrorHandlers(errorHandlers);
  }

  run(
    port: number,
    onSuccessed: () => void,
    onFailed: (...args: any[]) => void
  ) {
    this.expressApp.listen(port, onSuccessed).on("error", onFailed);
  }

  initMiddlewares(middlewares: Middleware[]) {
    this.expressApp.use(helmet());
    this.expressApp.use(cors());
    this.expressApp.use(express.json());
    this.expressApp.use(express.urlencoded({ extended: true }));
    if (middlewares.length > 0) {
      this.expressApp.use(...middlewares);
    }
  }

  initRouters(routerDir: string, routerMiddleware: RouterMiddleware) {
    this.expressApp.use("/", createRouterByFiles(routerDir, routerMiddleware));
  }

  initErrorHandlers(errorHandlers: Middleware[]) {
    this.expressApp.use((req, res) => {
      throw new HttpException(404);
    });
    this.expressApp.use(defaultErrorHandler);
    if (errorHandlers.length > 0) {
      this.expressApp.use(...errorHandlers);
    }
  }
}
