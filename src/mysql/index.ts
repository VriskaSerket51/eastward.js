import * as mysql from "mysql2/promise";
import config from "../config";
import { MySqlException } from "../exceptions";
import { logger } from "../logger";

export const connection = async () => {
  try {
    return await mysql.createConnection(config.db);
  } catch (error) {
    logger.error(error);
    throw new MySqlException(error);
  }
};

/**
 * @deprecated Use runAsync instead.
 */
export const query = async (sql: string, values: any) => {
  const conn = await connection();
  try {
    const [rows, fields] = await conn.query<mysql.RowDataPacket[]>(sql, values);
    return rows;
  } catch (error) {
    logger.error(error);
    throw new MySqlException(error);
  } finally {
    await conn.end();
  }
};

/**
 * @deprecated Use getFirstAsync or getAllAsync instead.
 */
export const execute = async (sql: string, values: any) => {
  const conn = await connection();
  try {
    const [rows, fields] = await conn.execute<mysql.OkPacket>(sql, values);
    return rows;
  } catch (error) {
    logger.error(error);
    throw new MySqlException(error);
  } finally {
    await conn.end();
  }
};

export const getFirstAsync = async (sql: string, values?: any[]) => {
  const conn = await connection();
  try {
    const [rows, _] = await conn.execute<mysql.RowDataPacket[]>(sql, values || []);
    if (rows.length > 0) {
      return rows[0];
    }
    return null;
  } catch (error) {
    logger.error(error);
    throw new MySqlException(error);
  } finally {
    await conn.end();
  }
};

export const getAllAsync = async (sql: string, values?: any[]) => {
  const conn = await connection();
  try {
    const [rows, _] = await conn.execute<mysql.RowDataPacket[]>(sql, values || []);
    return rows;
  } catch (error) {
    logger.error(error);
    throw new MySqlException(error);
  } finally {
    await conn.end();
  }
};

export const runAsync = async (sql: string, values?: any[]) => {
  const conn = await connection();
  try {
    const [rows, _] = await conn.execute<mysql.ResultSetHeader>(sql, values || []);
    return rows;
  } catch (error) {
    logger.error(error);
    throw new MySqlException(error);
  } finally {
    await conn.end();
  }
};