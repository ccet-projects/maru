/* eslint-disable no-await-in-loop */

import path from 'node:path';
import EventEmitter from 'node:events';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import pino from 'pino';

import Configuration from './Configuration.js';

export default class Application extends EventEmitter {
  info = null;

  name = '';

  /** @type {Configuration} */
  config = null;

  /**
   * Глобальный логгер для всех модулей
   * @type {pino.BaseLogger}
   */
  logger = null;

  models = {};

  services = {};

  modules = new Map();

  #runtimeConfig;

  #components = [];

  #status = 'created';

  /**
   * @param {Object} [runtimeConfig]
   */
  constructor(config) {
    super();
    this.#runtimeConfig = config;

    this.path = config.path;

    if (config.components) {
      config.components.forEach((ComponentClass) => {
        this.#components.push(new ComponentClass(this));
      });
    }
  }

  async start() {
    if (this.#status === 'running') {
      this.logger.always('Приложение уже запущено и работает');
      return;
    }

    if (this.#status === 'starting') {
      this.logger.always('Приложение уже запускается. Подождите');
      return;
    }

    this.#status = 'starting';

    const packageJsonPath = path.resolve(this.path, 'package.json');
    // Настолько новый синтаксис, что eslint его пока не понимает
    // this.info = await import(packageJsonPath, { assert: { type: 'json' } });
    this.info = JSON.parse(await fs.readFile(packageJsonPath));
    this.name = this.info.name;

    this.config = new Configuration(this.#runtimeConfig, {
      name: this.name,
      path: path.resolve(this.path, 'config'),
    });
    await this.config.init();

    if (this.config.logs === undefined) {
      this.config.logs = { level: 'error' };
    } else if (this.config.logs === false) {
      this.config.logs = { level: 'silent' };
    }

    this.logger = pino({
      level: this.config.logs.level,
      base: undefined,
      // timestamp: pino.stdTimeFunctions.isoTime,
      timestamp: `,"time":"${new Date().toISOString()}"`,
      formatters: {
        level: (label) => ({ level: label }),
      },
      customLevels: {
        always: 100,
      },
    });
    this.logger = this.logger.child({ scope: 'app' });

    for (const component of this.#components) {
      if (this.config[component.name] !== false) {
        await component.start();
      }
    }

    await this.#collectModules();

    if (this.config.api !== false) {
      await this.loadModels();
      await this.loadServices();
    }

    // ---- graceful exit ----
    process.on('SIGINT', () => {
      this.stop()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
    });

    this.#status = 'running';
    this.logger.always(`Приложение ${this.name} запущено в окружении ${this.config.environment}`);
  }

  async stop() {
    if (this.#status === 'stopped') {
      this.logger.always('Приложение уже остановлено');
      return;
    }

    for (const component of this.#components) {
      if (this.config[component.name] !== false) {
        await component.stop();
      }
    }

    this.#status = 'stopped';
    this.logger.always('Приложение остановлено');
  }

  async loadModels() {
    const modelsDir = path.join('api', 'models');
    const fileNames = await this.#listScripts(modelsDir);

    for (const fileName of fileNames) {
      const { name } = path.parse(fileName);
      const fileUrl = pathToFileURL(path.join(this.path, modelsDir, fileName));
      this.models[name] = (await import(fileUrl)).default;
    }

    for (const model of Object.values(this.models)) {
      await model.init(this);
    }
  }

  async loadServices() {
    for (const [moduleName, files] of this.modules) {
      if (files.service) {
        const service = (await import(files.service)).default;
        this.services[moduleName] = service;
      }
    }

    for (const [serviceName, service] of Object.entries(this.services)) {
      await service.init(this);
      this.logger.debug(`Сервис ${serviceName} готов`);
    }
  }

  async #collectModules() {
    const modulesDir = path.join('api', 'modules');
    const dirNames = await this.#listDirs(modulesDir);

    for (const dirName of dirNames) {
      const dirContent = {};
      const moduleDir = path.join(modulesDir, dirName);
      const fileNames = await this.#listScripts(moduleDir);

      fileNames.forEach((fileName) => {
        const { name } = path.parse(fileName);
        dirContent[name] = pathToFileURL(path.join(this.path, moduleDir, fileName));
      });

      this.modules.set(dirName, dirContent);
    }
  }

  async #listDirs(relativePath) {
    const dirPath = path.resolve(this.path, relativePath);
    try {
      const items = await fs.readdir(dirPath, { encoding: 'utf8', withFileTypes: true });
      return items.filter((item) => item.isDirectory())
        .map((item) => item.name);
    } catch (e) {
      this.logger.warn(e);
      return [];
    }
  }

  async #listScripts(relativePath) {
    const dirPath = path.resolve(this.path, relativePath);
    try {
      const items = await fs.readdir(dirPath, { encoding: 'utf8', withFileTypes: true });
      return items.filter((item) => item.isFile() && item.name.endsWith('.js'))
        .map((item) => item.name);
    } catch (e) {
      this.logger.warn(e);
      return [];
    }
  }
}
