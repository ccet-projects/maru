import fs from 'node:fs/promises';
import path from 'node:path';
import rc from 'rc';
// import merge from 'lodash.merge'; // Содержит 2000 строк для слияния двух объектов. Серьёзно?

/**
 * @param {Object} a
 * @param {Object} b
 */
const deepMerge = (a, b) => {
  if (a == null) {
    throw new TypeError('Первый аргумент должен быть объектом');
  }

  if (b == null) {
    return;
  }

  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.forEach((key) => {
    if (!(key in a)) {
      a[key] = b[key];
      return;
    }
    if (!(key in b)) {
      return;
    }
    const aProp = a[key];
    const bProp = b[key];
    if (aProp == null || bProp == null) {
      a[key] = b[key];
      return;
    }
    if (Array.isArray(aProp) && Array.isArray(bProp)) {
      a[key] = b[key];
      return;
    }
    if (typeof aProp === 'object' && typeof bProp === 'object') {
      deepMerge(aProp, bProp);
      return;
    }
    a[key] = b[key];
  });
};

export default class Configuration {
  #runtimeConfig = null;

  #name = '';

  #path = '';

  constructor(runtimeConfig, { name = 'app', path: dirPath }) {
    this.#runtimeConfig = runtimeConfig;
    this.#name = name;
    this.#path = dirPath;
    this.environment = process.env.NODE_ENV || 'development';
  }

  async init() {
    // Настройки из разных источников в порядке повышения приоритета
    await this.#addDefaultConfig();
    await this.#addModuleConfig();
    await this.#addEnvConfig();
    this.#addRcConfig();
    this.#addRuntimeConfig(this.#runtimeConfig);
    this.#addSpecialEnvVars();
  }

  async #importFile(relativePath) {
    const filePath = path.join(this.#path, relativePath);
    const imports = await import(`file://${filePath}`).catch(() => null);
    return imports?.default ?? {};
  }

  async #readDir(relativePath = '') {
    const dirPath = path.join(this.#path, relativePath);
    return fs.readdir(dirPath, { encoding: 'utf8', withFileTypes: true }).catch(() => []);
  }

  async #addDefaultConfig() {
    deepMerge(this, await this.#importFile('default.js'));
  }

  // Для каждого модуля МОЖНО создать свой файл с настройками в общей папке настроек
  async #addModuleConfig() {
    const items = await this.#readDir();
    const fileNames = items
      .filter((item) => item.isFile() && item.name.endsWith('.js') && item.name !== 'default.js')
      .map((item) => item.name);
    for (const fileName of fileNames) {
      const { name } = path.parse(fileName);
      this[name] = await this.#importFile(fileName); // eslint-disable-line no-await-in-loop
    }
  }

  // Для каждого окружения МОЖНО переопределить некоторые настройки при помощи специального файла
  async #addEnvConfig() {
    deepMerge(this, await this.#importFile(`env/${this.environment}.js`));
  }

  // TODO: Мы кроме rc-файла почти ничем и не пользуемся. Может, отрубить остальные возможности?
  /**
   * Добавляет конфиг, собранный библиотекой rc
   *
   * Это включает три источника конфигов в порядке уменьшения приоритета:
   * - cmd (командная строка)
   * - ENV (переменные окружения)
   * - .apprc (файл в папке проекта)
   * Подробнее тут: {@link https://www.npmjs.com/package/rc}
   */
  #addRcConfig() {
    deepMerge(this, rc(this.#name));
  }

  /**
   * Добавляет конфиг, переданный напрямую при создании объекта конфига
   *
   * Такое может быть удобно в нескольких редких случаях.
   * @param {Object} obj
   */
  #addRuntimeConfig(obj) {
    deepMerge(this, obj);
  }

  /**
   * Особые переменные окружения
   *
   * Большинство настроек передавать через переменные окружения неудобно,
   * так как используются длинные названия с префиксами.
   * Но есть несколько переменных с короткими именами, которые используют сервисы типа Heroku.
   */
  #addSpecialEnvVars() {
    if (process.env.HOST) {
      this.host = Number(process.env.HOST);
    }
    if (process.env.PORT) {
      this.port = Number(process.env.PORT);
    }
  }
}
