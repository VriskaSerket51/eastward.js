export class Exception extends Error {
  public message: string;

  constructor(message: string = "") {
    super(message);
    this.message = message;
  }
}

export class MySqlException extends Exception {
  public error: any;

  constructor(error: any) {
    super("My SQL Error");
    this.error = error;
  }
}

export class HttpException extends Exception {
  public status: number;

  constructor(status: number) {
    super();
    this.status = status;
  }
}

export class ResponseException extends Exception {
  public status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
