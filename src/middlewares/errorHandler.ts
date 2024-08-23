import { NextFunction, Request, Response } from "express";
import {
  Exception,
  HttpException,
  MySqlException,
  ResponseException,
} from "../exceptions";
import { logger } from "../logger";

const defaultErrorHandler = (
  error: Exception,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (error instanceof ResponseException) {
    res.status(200).json({
      status: error.status,
      message: error.message,
    });
    return;
  } else if (error instanceof HttpException) {
    res.sendStatus(error.status);
    return;
  } else if (error instanceof MySqlException) {
    logger.error(error);
    console.log(error);
    res.sendStatus(500);
    return;
  } else {
    logger.error(error);
    console.log(error);
    res.sendStatus(500);
    return;
  }
};

export default defaultErrorHandler;
