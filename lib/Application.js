/* eslint-disable no-await-in-loop */

import path from 'node:path';
import EventEmitter from 'node:events';
import fs from 'node:fs/promises';

import pino from 'pino';

import Configuration from './Configuration.js';

export default class Application extends EventEmitter {
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
    const packageJsonPath = path.resolve(this.path, 'package.json');
    // const metadata = await import(packageJsonPath, { assert: { type: 'json' } });
    const metadata = JSON.parse(await fs.readFile(packageJsonPath));
    this.name = metadata.name;

    this.config = new Configuration(this.#runtimeConfig, {
      name: this.name,
      path: path.resolve(this.path, 'config'),
    });
    await this.config.init();

    if (!this.config.logs) {
      this.config.logs = { level: 'error' };
    }

    this.logger = pino({
      level: this.config.logs.level,
      base: undefined,
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
      await component.start();
    }

    await this.#collectModules();

    if (this.config.mode !== 'worker') {
      await this.loadModels();
      await this.loadServices();
    }

    // ---- graceful exit ----
    process.on('SIGINT', () => {
      this.stop()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
    });

    this.logger.always(
      `Приложение ${this.name} запущено в режиме ${this.config.mode} в окружении ${this.config.environment}`
    );
  }

  async stop() {
    for (const component of this.#components) {
      await component.stop();
    }
    this.logger.always('Приложение остановлено');
  }

  async loadModels() {
    const dirPath = path.resolve(this.path, 'api/models');
    const items = await fs.readdir(dirPath, { encoding: 'utf8', withFileTypes: true })
      .catch(() => []);
    const fileNames = items
      .filter((item) => item.isFile() && item.name.endsWith('.js'))
      .map((item) => item.name);

    for (const fileName of fileNames) {
      const filePath = path.join(path, fileName);
      const { name } = path.parse(filePath);
      const model = (await import(`file://${filePath}`)).default;
      this.models[name] = model;
    }

    for (const model of Object.values(this.models)) {
      await model.init(this);
    }
  }

  async loadServices() {
    for (const [files, moduleName] of this.modules) {
      if (files.service) {
        const service = (await import(`file://${files.service}`)).default;
        this.services[moduleName] = service;
      }
    }

    for (const [serviceName, service] of Object.entries(this.services)) {
      await service.init(this);
      this.logger.debug(`Сервис ${serviceName} готов`);
    }
  }

  async #collectModules() {
    const modulesDirPath = path.resolve(this.path, './modules');
    const dirs = await fs.readdir(modulesDirPath, { encoding: 'utf8', withFileTypes: true })
      .catch(() => []);
    const dirNames = dirs.filter((dir) => dir.isDirectory()).map((dir) => dir.name);

    for (const dirName of dirNames) {
      const dirContent = {};
      const modulePath = path.resolve(modulesDirPath, dirName);
      const files = await fs.readdir(modulePath, { encoding: 'utf8', withFileTypes: true });
      const fileNames = files.filter((item) => item.isFile() && item.name.endsWith('.js')).map((item) => item.name);
      fileNames.forEach((fileName) => {
        const { name } = path.parse(fileName);
        dirContent[name] = path.resolve(modulePath, fileName);
      });
      this.modules.set(dirName, dirContent);
    }
  }
}
