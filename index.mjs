import stampit from '@stamp/it';
import Observable from 'zen-observable';

/**
 * This is a lightweight wrapper around MessagePort / Window / Worker objects
 * (things that have a postMessage method).
 */

// Use a WeakMap if poss.  That way, if the messageport loses the ref to
// the listener on its own, there's no memory leak
const MapImpl = typeof WeakMap === 'function' ? WeakMap : Map

const portMethods = ['postMessage', 'addEventListener', 'removeEventListener', 'start', 'close'];
const portListeners = ['onmessage', 'onmessageerror'];

const wrapper = stampit()
  .init(function(_, { instance }) {
    // Add standardised observable accessor, if poss.
    if (typeof Symbol === 'function' && Symbol.observable)
      instance[Symbol.observable] = () => instance.observable;
  })
  .propertyDescriptors({
    observable: {
      enumerable: true,
      configurable: true,
      get() {
        const observable = new Observable(observer => {
          const messageCb = observer.next.bind(observer);
          const messageErrorCb = observer.error.bind(observer);
          this.addEventListener('message', messageCb);
          this.addEventListener('messageerror', messageErrorCb);
          if (this.start)
            this.start();

          return () => {
            this.removeEventListener('message', messageCb);
            this.removeEventListener('messageerror', messageErrorCb);
          };
        });

        delete this.observable;
        Object.defineProperty(this, 'observable', {
          value: observable,
          writable: true,
          configurable: true,
          enumerable: true
        });

        return observable;
      }
    },
    port: {
      enumerable: true,
      configurable: true,
      get() {
        return null;
      },
      set(port) {
        delete this.port;
        Object.defineProperty(this, 'port', {
          value: port,
          writable: true,
          configurable: true,
          enumerable: true
        });

        this.bindPort();
      }
    }
  })
  .methods({
    unwrap() {
      return this.port;
    },

    postMessageWithReply(message, listener) {
      const messageChannel = new MessageChannel(),
        replyPort = wrapPort(messageChannel.port1);

      listener(replyPort);
      this.postMessage(message, [messageChannel.port2]);
    },

    postObservable(observable, splat = false, close = false) {
      const complete = close && typeof this.close === 'function' ?
        this.close.bind(this) :
        null;

      const next = splat ?
        (args) => this.postMessage(...args) :
        this.postMessage.bind(this);

      return Observable.from(observable).subscribe({ complete, next, error: complete });
    },

    postMessageWithObservable(message, observable) {
      const messageChannel = new MessageChannel(),
        postPort = wrapPort(messageChannel.port1);

      this.postMessage(message, [messageChannel.port2]);
      return postPort.postObservable(observable);
    },

    subscribeAndPostReplies(listener, splat = false) {
      return this.observable.subscribe({
        next(event) {
          const replyPort = wrapPort(event.ports[0]);
          const response = listener(event);
          if (response)
            replyPort.postObservable(Observable.from(response), splat, true);
        }
      });
    }
  });

/**
 * A MessagePort-alike interface for windows.  Adds the following:
 *
 * - filters to ensure that all events sent and received have an origin setting.
 * - shims the postMessage method so that it looks like the MessagePort one
 */
const wrapWindow = wrapper
  .init(function(options, { instance }) {
    if (!options.window)
      throw new Error("No window given");

    if (!options.origin || options.origin === "")
      throw new Error("No origin given");

    this.port = options.window;
    this.origin = options.origin;
    this.eventFilter = this.origin === '*' ?
      (() => true) :
      (event => event.origin === options.origin);

    this.eventListeners = {};
  })
  .methods({
    // This is a noop here
    bindPort() {
      for (let attr of portListeners) {
        Object.defineProperty(this, attr, {
          enumerable: true,
          configurable: false,
          get() {
            return this.port[attr];
          },
          set(listener) {
            const eventFilter = this.eventFilter;
            this.port[attr] = function(event) {
              if (eventFilter(event))
                listener(event);
            };
          }
        });
      }
    },

    postMessage(message, transferList) {
      return this.port.postMessage(message, this.origin, transferList);
    },

    addEventListener(type, listener, options) {
      if (typeof this.eventListeners[type] === 'undefined')
        this.eventListeners[type] = new MapImpl();

      // This ensures that we are only notified about events that are considered
      // safe
      if (!this.eventListeners[type].has(listener)) {
        const eventFilter = this.eventFilter;
        this.eventListeners[type].set(listener, function(event) {
          if (eventFilter(event))
            listener(event);
        });
      }

      this.port.addEventListener(
        type,
        this.eventListeners[type].get(listener),
        options);
    },

    removeEventListener(type, listener, options) {
      if (this.eventListeners[type] && this.eventListeners[type].has(listener)) {
        this.port.removeEventListener(type, this.eventListeners[type].get(listener), options);
        this.eventListeners[type].delete(listener);
      }
    }
  });

/**
 * A wrapper around MessagePort objects (incl. workers)
 */
const wrapPort = wrapper
  .init(function(port, { instance }) {
    if (!port)
      throw new Error("No port given");

    instance.port = port;
  })
  .methods({
    bindPort() {
      for (let method of portMethods) {
        if (typeof this.port[method] === 'function')
          this[method] = this.port[method].bind(this.port);
      }

      for (let attr of portListeners) {
        Object.defineProperty(this, attr, {
          enumerable: true,
          configurable: false,
          get() {
            return this.port[attr];
          },
          set(value) {
            this.port[attr] = value;
          }
        });
      }
    }
  });

/* Example:
subscribeAndPostReplies(observable, event => {
  // Possible return values:
  return [1,2,3,4];
  return new Observable( ... );
  return (function*() { ... })();
});
*/

/* Example:
somePort.postMessageWithReply('{"my":"message"}', port => {
  Kefir.fromESObservable(port.observable).take(1).observe(event => {
    port.postMessage('got it');
    port.close();
  });
});
*/

export { wrapPort, wrapWindow };
