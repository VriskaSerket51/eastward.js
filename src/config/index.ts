export type Config = {
  jwtSecret: string;
  db: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
};

const config: Config = {
  jwtSecret: "jwtSecret",
  db: {
    host: "127.0.0.1",
    port: 3306,
    user: "root",
    password: "root",
    database: "db",
  },
};

export default config;

export const initializeConfig = (newConfig: Config) => {
  config.jwtSecret = newConfig.jwtSecret;
  config.db = newConfig.db;
};
