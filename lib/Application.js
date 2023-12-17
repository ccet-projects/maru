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

  modules = {};

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
      timestamp: () => `,"time":"${new Date().toISOString().replace('T', ' ')}"`,
      formatters: {
        level: (label) => ({ level: label }),
      },
      customLevels: {
        always: 100,
      },
    });
    this.logger = this.logger.child({ scope: 'app' });

    this.modules = await this.listDirectory(path.join('api', 'modules'));

    for (const component of this.#components) {
      if (this.config[component.constructor.name.toLowerCase()] !== false) {
        await component.start();
      }
    }

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
    const content = await this.listDirectory(path.join('api', 'models'));

    for (const [name, fileUrl] of Object.entries(content)) {
      this.models[name] = (await import(fileUrl)).default;
    }

    for (const model of Object.values(this.models)) {
      await model.init(this);
    }
  }

  async loadServices() {
    for (const [name, files] of Object.entries(this.modules)) {
      if (files.service) {
        const service = (await import(files.service)).default;
        this.services[name] = service;
      }
    }

    for (const [serviceName, service] of Object.entries(this.services)) {
      await service.init(this);
      this.logger.debug(`Сервис ${serviceName} готов`);
    }
  }

  /**
   * @param {string} relativePath
   * @returns {Promise<Object>}
   */
  async listDirectory(relativePath) {
    const content = {};

    const dirPath = path.resolve(this.path, relativePath);
    try {
      const items = await fs.readdir(dirPath, { encoding: 'utf8', withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory()) {
          const { name } = path.parse(item.name);
          content[name] = await this.listDirectory(path.join(item.path, item.name));
        } else {
          if (item.name.endsWith('.js')) { // eslint-disable-line no-lonely-if
            const { name } = path.parse(item.name);
            content[name] = pathToFileURL(path.join(item.path, item.name));
          }
          // else // Остальные типы файлов игнорируем
        }
      }
    } catch (e) {
      this.logger.warn(e);
    }
    return content;
  }
}
