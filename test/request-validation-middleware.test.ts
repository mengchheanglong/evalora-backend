import "reflect-metadata";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { BadRequestException, HttpStatus } from "@nestjs/common";
import {
  RequestValidationMiddleware,
  payloadSyntaxErrorHandler,
} from "../src/common/middleware/request-validation.middleware";
import { PayloadValidationFilter } from "../src/common/filters/payload-validation.filter";

function createMockResponse() {
  const res: any = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
    send(data: any) {
      this.body = data;
      return this;
    },
  };
  return res;
}

test("RequestValidationMiddleware passes valid requests to next", () => {
  const middleware = new RequestValidationMiddleware();
  let calledNext = false;

  const req: any = {
    method: "POST",
    path: "/api/auth/login",
    headers: {
      "content-type": "application/json",
      "content-length": "45",
    },
    body: { email: "user@example.com", password: "password123" },
    readable: false,
  };

  const res = createMockResponse();
  middleware.use(req, res, () => {
    calledNext = true;
  });

  assert.equal(calledNext, true);
});

test("RequestValidationMiddleware rejects malformed URI encoding with 400", () => {
  const middleware = new RequestValidationMiddleware();

  const req: any = {
    method: "GET",
    path: "/api/sessions/%E0%A4%A",
    headers: {},
  };
  const res = createMockResponse();

  assert.throws(
    () => middleware.use(req, res, () => {}),
    (err: unknown) =>
      err instanceof BadRequestException &&
      err.message.includes("Invalid request URI encoding"),
  );
});

test("payloadSyntaxErrorHandler intercepts malformed JSON SyntaxErrors and returns standardized 400 Bad Request", () => {
  const syntaxError = new SyntaxError("Unexpected token 'x' in JSON at position 12");
  (syntaxError as any).body = '{"invalid": x}';
  (syntaxError as any).status = 400;

  const req: any = { method: "POST", path: "/api/sessions" };
  const res = createMockResponse();
  let nextCalledWith: any = null;

  payloadSyntaxErrorHandler(syntaxError, req, res, (err) => {
    nextCalledWith = err;
  });

  assert.equal(nextCalledWith, null); // Error was intercepted and handled
  assert.equal(res.statusCode, HttpStatus.BAD_REQUEST);
  assert.deepEqual(res.body, {
    statusCode: HttpStatus.BAD_REQUEST,
    error: "Bad Request",
    message: "Malformed JSON payload: The request body contains invalid JSON syntax.",
  });
});

test("payloadSyntaxErrorHandler intercepts entity.parse.failed errors from body-parser", () => {
  const parseError: any = {
    name: "SyntaxError",
    message: "Unexpected end of JSON input",
    type: "entity.parse.failed",
    status: 400,
  };

  const req: any = { method: "PUT", path: "/api/users" };
  const res = createMockResponse();
  let nextCalledWith: any = null;

  payloadSyntaxErrorHandler(parseError, req, res, (err) => {
    nextCalledWith = err;
  });

  assert.equal(nextCalledWith, null);
  assert.equal(res.statusCode, HttpStatus.BAD_REQUEST);
  assert.equal(res.body.statusCode, 400);
  assert.equal(res.body.error, "Bad Request");
  assert.ok(res.body.message.includes("Malformed JSON payload"));
});

test("payloadSyntaxErrorHandler intercepts oversized payloads with 413 Payload Too Large", () => {
  const largeError: any = {
    name: "PayloadTooLargeError",
    message: "request entity too large",
    type: "entity.too.large",
    status: 413,
  };

  const req: any = { method: "POST", path: "/api/templates/drafts" };
  const res = createMockResponse();
  let nextCalledWith: any = null;

  payloadSyntaxErrorHandler(largeError, req, res, (err) => {
    nextCalledWith = err;
  });

  assert.equal(nextCalledWith, null);
  assert.equal(res.statusCode, HttpStatus.PAYLOAD_TOO_LARGE);
  assert.deepEqual(res.body, {
    statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
    error: "Payload Too Large",
    message: "The request payload exceeds the allowed size limit.",
  });
});

test("payloadSyntaxErrorHandler passes unrelated errors to next()", () => {
  const otherError = new Error("Database query failed");
  const req: any = { method: "GET", path: "/api/reports" };
  const res = createMockResponse();
  let nextCalledWith: any = null;

  payloadSyntaxErrorHandler(otherError, req, res, (err) => {
    nextCalledWith = err;
  });

  assert.equal(nextCalledWith, otherError);
  assert.equal(res.body, null);
});

test("PayloadValidationFilter catches SyntaxError and returns standardized 400 response", () => {
  const filter = new PayloadValidationFilter();
  const res = createMockResponse();

  const host: any = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({}),
    }),
  };

  const syntaxError = new SyntaxError("Unexpected token in JSON");
  filter.catch(syntaxError, host);

  assert.equal(res.statusCode, HttpStatus.BAD_REQUEST);
  assert.deepEqual(res.body, {
    statusCode: HttpStatus.BAD_REQUEST,
    error: "Bad Request",
    message: "Malformed JSON payload: The request body contains invalid JSON syntax.",
  });
});
