import EventEmitter from 'node:events';

export default class Service extends EventEmitter {
  logger;

  async init(app) {
    const shortName = this.constructor.name.replace('Service', '').toLowerCase();
    this.logger = app.logger.child({ scope: shortName });
  }
}
