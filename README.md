# common-api

Simple backend framework with JWT and MySQL support.

## Installation into an existing project

To install `common-api` as a dependency of your Node.js project:

```sh
npm install @ireves/common-api
```

`common-api` is made with TypeScript.

## How to use

```javascript
import CommonApi from "@ireves/common-api";
import path from "path";

CommonApi.initializeConfig(config);
CommonApi.initializeScheduler(schedules);

runExpressApp();

function runExpressApp() {
    const app = new CommonApi.App(
        path.join(__dirname, "router"),
        [],
        CommonApi.defaultRouterMiddlewares,
        []
    );
    app.run(
        config.port,
        () => {
            console.info(`Server started with port: ${config.port}`);
        },
        (error) => {
            CommonApi.logger.error(error);
        }
    );
}
```

```javascript
const config: CommonApi.Config = {
    jwtSecret: "secret",
    db: {
        host: "127.0.0.1",
        port: 3306,
        user: "root",
        password: "password",
        database: "db",
    },
};
```

```javascript
const schedules: CommonApi.Schedule[] = [
    name: "testSchedule",
    cron: "00 00 00 * * *",
    job: () => {
        console.log("Welcome!")
    },
];
```
