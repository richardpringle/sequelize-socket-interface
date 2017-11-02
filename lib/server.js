'use strict';

const net = require('net');

function joinCwd(path) {
  return require('path').join(process.cwd(), path);
}

const debug = require('debug')('app:model-server');
const sequelize = require('sequelize');
const mongoose = require('mongoose');

/**
 * @class ModelServer
 * Interface for exposing sequelize and mongo over tcp sockets
 */
class ModelServer {
  /**
   * A ModelServer instance is instantiated with a TCP server.
   * A connection handler is loaded onto the TCP server attaching pre-defined
   * data handlers on to the new connection sockets. The incoming JSON string is
   * parsed and subsequent calls to the ORM/ODM module methods are made. Any
   * instance or array of instances that are returned are attached to the
   * socket's data and dataSets properties respectively. Data is only meant to
   * be accessed on the subsequent call, as the data object is often re-initialized.
   *
   * @param  {Object} options same options as `require('net').createServer(options)`
   * @param  {Number} options.socketTimeout default to 10s, set to 0 for no timeout.
   * @return {ModelServer}
   */
  constructor(options) {
    this.MySql = require(joinCwd('/models'));
    this.Mongo = require(joinCwd('/mongo_database'));
    this.MySqlModel = sequelize.Model;
    this.MongoModel = mongoose.Model;

    if (options && typeof options.socketTimeout === 'number') {
      this.socketTimeout = options.socketTimeout;
    } else {
      this.socketTimeout = 10000;
    }

    this.server = net.createServer(options);

    this.server.on('listening', () => {
      // eslint-disable-next-line no-console
      console.log('opened model-server on', this.server.address());
    });

    // attach the connection handler
    this.server.on('connection', socket => {
      socket.setTimeout(this.socketTimeout);
      socket.setEncoding('utf8');
      socket.on('timeout', () => {
        socket.destroy();
      });

      // Reference the ORM/ODM
      socket.MySql = this.MySql;
      socket.Mongo = this.Mongo;

      // attach the data handler
      socket.on('data', data => {
        try {
          data = JSON.parse(data);
        } catch (err) {
          // send the stringified error back to the client
          debug(`:error: ${err}`);
          sendError(socket, err);
          return;
        }

        if (!data) {
          sendError(socket, new Error('Signature does not match.'));
          return;
        }

        let db = data.db;
        let tenant = data.tenant;
        let model = data.model;
        let method = data.method;
        let params = data.params;

        if (!Array.isArray(params)) params = [params];

        if (db !== 'data' && db !== 'dataSets') {
          if (db !== 'MySql' && db !== 'Mongo') {
            sendError(socket, new Error('Signature does not match.'));
            return;
          }

          // initialize the data and dataSets for instance storage on the socket
          socket[tenant] = {data: {}, dataSets: {}};
        }

        if (db === 'Mongo') {
          try {
            socket[db][tenant].model(model)[method](...params)
              .then(resolved.bind(this));
          } catch (err) {
            debug(`:error: ${err}`);
            sendError(socket, err);
            return;
          }
        } else {
          let propA = db;
          let propB = tenant;

          // data and dataSets properties are attached directly to the socket
          // so the order needs to be reversed
          if (db === 'data' || db === 'dataSets') {
            propA = tenant;
            propB = db;
          }

          try {
            let promise = socket[propA][propB][model][method](...params);

            // if it's a promise, call `.then`, otherwise the promise will be a
            // record returned from a promise
            if (typeof promise === 'object' && promise.then) {
              promise.then(resolved.bind(this));
            } else {
              resolved.bind(this)(promise);
            }
          } catch (err) {
            debug(`:error: ${err}`);
            sendError(socket, err);
            return;
          }
        }

        function resolved(record) {
          if (record === undefined) record = null;

          let isArray = Array.isArray(record);

          if (db !== 'data' && db !== 'dataSets') {
            if (isArray) {
              socket[tenant].dataSets[this._getModelName(record[0])] = record;
            } else {
              socket[tenant].data[this._getModelName(record)] = record;
            }
          }

          // get plain objects to send back to the client
          if (isArray) {
            record.forEach((element, index) => {
              record[index] = this._getPlainObject(element, db);
            });
          } else {
            record = this._getPlainObject(record, db);
          }

          try {
            socket.write(JSON.stringify(record));
          } catch (err) {
            debug(`:error: ${err}`);
            sendError(socket, err);
            return;
          }
        }
      });
    });
  }

  /**
   * same as `require('net').Server.prototype.listen`
   * @param  {Object}   options
   * @param  {Function} cb
   * @return {ModelServer}
   */
  listen(options, cb) {
    this.server.listen(options, cb);
    return this;
  }

  /**
   * same as `require('net').Server.prototype.on` (with the same events)
   * @param  {string}   event
   * @param  {Function} cb
   * @return {ModelServer}
   */
  on(event, cb) {
    this.server.on(event, cb);
    return this;
  }

  /**
   * same as `require('net').Server.prototype.address`
   * @return {Object}
   */
  address() {
    return this.server.address();
  }

  /*
   * internal method
   * @param  {Object} record model instance
   * @return {String}        name of sequelize or mongoose model
   */
  _getModelName(record) {
    if (record.Model instanceof this.MySqlModel) {
      let name = record.Model.name;
      return name[0].toLowerCase() + name.slice(1);
    } else if (record instanceof this.MongoModel) {
      let name = record.constructor.modelName;
      return name[0].toLowerCase() + name.slice(1);
    } else {
      return 'raw';
    }
  }

  /*
   * internal method
   * @param  {Object} record sequlize or mongoose model
   * @param  {String} type   Mongo or MySql
   * @return {Object}        returns object without instance metadata or methods
   */
  _getPlainObject(record, type) {
    if (type === 'MySql' && record.get) {
      return record.get();
    } else if (type === 'Mongo' && record.toJSON) {
      return record.toJSON();
    } else {
      return record;
    }
  }
}

function sendError(socket, err) {
  socket.write(JSON.stringify({error: err.message}));
};

module.exports = ModelServer;
