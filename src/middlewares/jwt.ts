import jwt from "jsonwebtoken";
import { Response, Request, NextFunction } from "express";
import config from "../config";
import { HttpException, ResponseException } from "../exceptions";
import { v4 as uuid } from "uuid";
import { logger } from "../logger";

export const createAccessToken = (
  payload: object,
  options?: jwt.SignOptions
) => {
  payload = {
    ...payload,
    type: "access",
  };
  options = options || {};
  if (!options.algorithm) {
    options.algorithm = "HS256";
  }
  if (!options.expiresIn) {
    options.expiresIn = "10m";
  }
  if (!options.jwtid) {
    options.jwtid = uuid();
  }
  return jwt.sign(payload, config.jwtSecret, options);
};

export const createRefreshToken = (
  payload: object,
  options?: jwt.SignOptions
) => {
  payload = {
    ...payload,
    type: "refresh",
  };
  options = options || {};
  if (!options.algorithm) {
    options.algorithm = "HS256";
  }
  if (!options.expiresIn) {
    options.expiresIn = "6h";
  }
  if (!options.jwtid) {
    options.jwtid = uuid();
  }
  return jwt.sign(payload, config.jwtSecret, options);
};

export const verifyJwt = (
  token: string,
  callback: jwt.VerifyCallback<string | jwt.JwtPayload>
) => {
  jwt.verify(token, config.jwtSecret, callback);
};

export const verifyAccessTokenMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
  isRequired: boolean = true
) => {
  const bearer = req.headers.authorization;
  if (!bearer || !bearer.startsWith("Bearer ")) {
    if (isRequired) {
      throw new HttpException(401);
    } else {
      next();
      return;
    }
  }
  const jwtToken = bearer.split("Bearer ")[1];
  verifyJwt(jwtToken, (error, decoded) => {
    if (error?.message === "jwt expired") {
      throw new ResponseException(-100, "토큰이 만료됐습니다.");
    } else if (
      !decoded ||
      error?.message === "invalid token" ||
      (decoded as any).type !== "access"
    ) {
      throw new ResponseException(-101, "토큰이 유효하지 않습니다.");
    } else if (error) {
      logger.error(error);
      throw new HttpException(500);
    } else {
      next();
    }
  });
};

export const verifyRefreshTokenMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const bearer = req.headers.authorization;
  if (!bearer || !bearer.startsWith("Bearer ")) {
    throw new HttpException(401);
  }
  const jwtToken = bearer.split("Bearer ")[1];
  verifyJwt(jwtToken, (error, decoded) => {
    if (error?.message === "jwt expired") {
      throw new ResponseException(-100, "토큰이 만료됐습니다.");
    } else if (
      !decoded ||
      error?.message === "invalid token" ||
      (decoded as any).type !== "refresh"
    ) {
      throw new ResponseException(-101, "토큰이 유효하지 않습니다.");
    } else if (error) {
      logger.error(error);
      throw new HttpException(500);
    } else {
      next();
    }
  });
};
