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
