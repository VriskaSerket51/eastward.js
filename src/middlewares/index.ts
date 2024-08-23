import { Request, Response, NextFunction } from "express";
import { ModelBase } from "../router";
import {
  verifyAccessTokenMiddleware,
  verifyRefreshTokenMiddleware,
} from "./jwt";

export type RouterMiddleware = (model: ModelBase) => Middleware[];

export type Middleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => any;

export { default as defaultErrorHandler } from "./errorHandler";
export * from "./jwt";

export const defaultRouterMiddlewares = (model: ModelBase) => {
  const { authType } = model;
  const middlewares: Middleware[] = [];
  switch (authType) {
    case "access":
      middlewares.push(verifyAccessTokenMiddleware);
      break;
    case "refresh":
      middlewares.push(verifyRefreshTokenMiddleware);
      break;
    case "optional":
      middlewares.push((req, res, next) => {
        verifyAccessTokenMiddleware(req, res, next, false);
      });
      break;
    default:
      break;
  }
  return middlewares;
};
