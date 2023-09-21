/* eslint-disable max-classes-per-file */

export default class APIError extends Error {
  /** @type {string} */
  code;

  /** @type {*} */
  detail;

  /** @type {(number|undefined)} */
  status;

  /**
   * @param {string} code
   * @param {*} [detail]
   */
  constructor(code, detail) {
    super(code);
    this.code = code;
    this.detail = detail;
  }

  toJSON() {
    return {
      code: this.code,
      detail: this.detail,
      status: this.constructor.status,
    };
  }
}

export class Unauthorized extends APIError {
  status = 401;
}

export class Forbidden extends APIError {
  status = 403;
}

export class BadRequest extends APIError {
  status = 400;
}

export class TooManyRequests extends APIError {
  status = 429;
}
