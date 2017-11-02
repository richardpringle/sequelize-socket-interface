'use strict';

const Promise = require('bluebird');

const net = require('net');
const Socket = net.Socket;

/**
 * @class ModelClient
 * use:
 * - make a client
 * - find a model instance
 * - call the model method
 * - close the connection* -> may not need to do this
 */
class ModelClient {
  /**
   * @param  {Object} options same as `require('net').Socket.prototype.connect`
   * @param  {String} options.encoding set ecoding on socket
   *
   * @return {ModelClient}
   */
  constructor(options) {
    this.socket = new Socket();

    let encoding = 'utf8';

    if (typeof options === 'object' && options.encoding !== undefined) {
      encoding = options.ecoding;
    }

    this.socket.setEncoding(encoding);
    this.socket.connect.apply(this.socket, arguments);

    this.options = options;
  };

  /**
   * use for sequlize models
   * @param {Object} options
   * @param {String} options.tenant database tenant
   * @param {String} options.model  sequelize model-name
   * @param {String} options.method sequelize model class method
   * @param {any}    options.params parameters to be passed to the method
   *
   * @return {Promise}
   */
  MySql(options) {
    return this._write(mergeOptions({db: 'MySql'}, options));
  };

  /**
   * use for mongoose models
   * @param {Object} options
   * @param {String} options.tenant database tenant
   * @param {String} options.model  mongoose model-name
   * @param {String} options.method mongoose model class method
   * @param {any}    options.params parameters to be passed to the method
   *
   * @return {Promise}
   */
  Mongo(options) {
    return this._write(mergeOptions({db: 'Mongo'}, options));
  };

  /**
   * Calling a class method with `client.MySql` or `client.Mongo`
   * that returns a single instance will attach that instance to
   * server socket. While the connection is open, `client.data`
   * will behave the same way as `client.MySql` or `client.Mongo`
   * calling istance methods instead.
   *
   * @param {Object} options
   * @param {String} options.tenant database tenant
   * @param {String} options.model  mongoose model-name with lower case first letter
   * @param {String} options.method mongoose model class method
   * @param {any}    options.params parameters to be passed to the method
   *
   * @return {Promise}
   */
  data(options) {
    return this._write(mergeOptions({db: 'data'}, options));
  };

  /**
   * Behaves the same way as `client.data` but used for arrays of instances
   * returned by class methods.
   *
   * @param {Object} options
   * @param {String} options.tenant database tenant
   * @param {String} options.model  mongoose model-name with lower case first letter
   * @param {String} options.method mongoose model class method
   * @param {any}    options.params parameters to be passed to the method
   *
   * @return {Promise}
   */
  dataSet(options) {
    return this._write(mergeOptions({db: 'dataSets'}, options));
  };

  /**
   * Manually call `prototype.socket.connect`
   * @param  {Object} options same as `net.Socket.prototype.connect`
   * @return {ModelClient}
   */
  connect(options) {
    options = options || this.options;
    this.socket.connect(options);
    this.options = options;
    return this;
  }

  /**
   * Manually call `prototype.socket.end` and delete `prototype.socket`
   * @return {ModelClient}
   */
  end() {
    this.socket.end();
    delete this.socket;
    return this;
  };

  /**
   * internal method
   * @param  {String} data String to be sent to server
   * @return {Promise}
   */
  _write(data) {
    if (data instanceof Error) return Promise.reject(data);

    return new Promise((resolve, reject) => {
      this.socket.once('error', reject);
      this.socket.once('data', resolve);

      let waitForDrain = !this.socket.write(data);
      if (waitForDrain) reject('Waiting for \'drain\' event.');
    }).then(data => {
      return JSON.parse(data);
    });
  };
};

/**
 * utility function
 * @param  {Object} reqOptions
 * @param  {Object} options
 * @return {Object}
 */
function mergeOptions(reqOptions, options) {
  reqOptions.tenant = options.tenant;
  reqOptions.model = options.model;
  reqOptions.method = options.method;

  if (Array.isArray(options.params)) {
    reqOptions.params = options.params;
  } else {
    reqOptions.params = [options.params];
  }

  try {
    reqOptions = JSON.stringify(reqOptions);
  } catch (err) {
    return err;
  }

  return reqOptions;
};

module.exports = ModelClient;
