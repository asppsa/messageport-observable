import stampit from '@stamp/it';
import Observable from 'zen-observable';

/**
 * This is a "lightweight" (is it?) wrapper around MessagePort / Window / Worker
 * objects (things that have a postMessage method).
 */

/**
 * This is used to ensure that when the wrapped object is set, method bindings
 * happen
 */
const wrapper = stampit()
  .props({ isWrapped: true })
  .propertyDescriptors({
    wrapped: {
      enumerable: true,
      configurable: true,
      get() {
        return null;
      },
      set(obj) {
        if (!obj)
          throw new Error("Cannot set wrapped object to falsy");

        delete this.wrapped;
        Object.defineProperty(this, 'wrapped', {
          value: obj,
          writable: true,
          configurable: true,
          enumerable: true
        });
      }
    }
  })
  .init(function(_, { instance, stamp }) {
    instance.wrapper = stamp;
  })
  .methods({
    unwrap() {
      if (!this.wrapped)
        throw new Error("No wrapped object in this wrapper");

      return this.wrapped.isWrapped ? this.wrapped.unwrap() : this.wrapped;
    }
  });

function filteringPropertyDescriptor(type) {
  const attribute = 'on' + type;

  return {
    enumerable: true,
    configurable: false,
    get() {
      return this.wrapped[attribute];
    },
    set(listener) {
      const eventFilter = this.eventFilters[type];
      if (eventFilter) {
        this.wrapped[attribute] = function(event) {
          if (eventFilter.call(this, event))
            listener.call(this, event);
        };
      }
      else {
        this.wrapped[attribute] = listener;
      }
    }
  };
}

// Use a WeakMap if poss.  That way, if the messageport loses the ref to
// the listener on its own, there's no memory leak
const mapImpl = typeof WeakMap === 'function' ? WeakMap : Map;

/**
 * This is stamp returns an object that wraps event handlers so that they only
 * fire when the given filters apply
 */
const filteringPort = wrapper
  .init(function(_, { instance, stamp }) {
    instance.eventFilters = {};
    instance.eventListeners = {};
  })
  .methods({
    filter() {
      let newFilter, type;

      if (arguments.length === 1) {
        type = 'message';
        newFilter = arguments[0];
      }
      else {
        type = arguments[0];
        newFilter = arguments[1];
      }

      const clone = this.wrapper(this);
      clone.autostart = false;
      clone.eventFilters[type] = newFilter;

      return clone;
    },

    addEventListener(type, listener, options) {
      if (!this.eventListeners[type])
        this.eventListeners[type] = new mapImpl();

      // This ensures that we are only notified about events that haven't been
      // filtered out
      if (!this.eventListeners[type].has(listener)) {
        const eventFilter = this.eventFilters[type];

        let wrappedListener;
        if (eventFilter) {
          wrappedListener = function(event) {
            if (eventFilter(event)) {
              typeof listener.handleEvent === 'function' ?
                listener.handleEvent(event) :
                listener(event);
            }
          };
        }
        else {
          wrappedListener = listener;
        }

        this.wrapped.addEventListener(type, wrappedListener, options);
        this.eventListeners[type].set(listener, wrappedListener);
      }
    },

    removeEventListener(type, listener, options) {
      if (this.eventListeners[type] && this.eventListeners[type].has(listener)) {
        this.wrapped.removeEventListener(type, this.eventListeners[type].get(listener), options);
        this.eventListeners[type].delete(listener);
      }
    }
  })
  .propertyDescriptors({
    onmessage: filteringPropertyDescriptor('message'),
    onmessageerror: filteringPropertyDescriptor('messageerror')
  });

const observablePort = stampit()
  .props({
    autostart: true
  })
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

          if (this.autostart && this.start)
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
    }
  })
  .methods({
    subscribe(...args) {
      return this.observable.subscribe(...args);
    },

    postMessageWithReply(message, listener) {
      const messageChannel = new MessageChannel(),
        replyPort = this.wrapper(messageChannel.port1);

      this.postMessage(message, [messageChannel.port2]);
      if (listener)
        listener(replyPort);
      else
        return replyPort;
    },

    postObservable(observable, splat = false, close = false) {
      const complete = close && typeof this.close === 'function' ?
        () => this.close() :
        undefined;

      const next = splat ?
        (args) => this.postMessage(...args) :
        this.postMessage.bind(this);

      return Observable.from(observable).subscribe(next, complete, complete);
    },

    postMessageWithObservable(message, observable, splat=false) {
      const messageChannel = new MessageChannel(),
        postPort = this.wrapper(messageChannel.port1);

      this.postMessage(message, [messageChannel.port2]);
      return postPort.postObservable(observable, splat, true);
    },

    subscribeWithPort(listener, splat=false) {
      const wrapper = this.wrapper;
      return this.subscribe(event => {
        const port = event.ports[0];
        const wrappedPort = port ? wrapper(port) : null;
        listener(event, wrappedPort);
      });
    },

    subscribeAndPostReplies(listener, splat = false) {
      return this.subscribeWithPort((event, replyPort) => {
        const response = listener(event);
        if (response && replyPort)
          replyPort.postObservable(response, splat, true);
      }, splat);
    }
  });

const filteringObservablePort = filteringPort.compose(observablePort);

/**
 * A generic wrapper around MessagePort objects (incl. workers)
 */
const wrapPort = filteringObservablePort
  .init(function(port, { instance }) {
    if (!port)
      throw new Error("No port given");

    instance.wrapped = port;
    for (let method of ['postMessage', 'start', 'close']) {
      if (typeof port[method] === 'function')
        instance[method] = port[method].bind(port);
    }
  });

/**
 * A MessagePort-alike interface for windows.  Adds the following:
 *
 * - filters to ensure that all events sent and received have an origin setting.
 * - shims the postMessage method so that it looks like the MessagePort one
 */
const wrapWindow = filteringObservablePort
  .init(function(options, { instance }) {
    if (!options.window)
      throw new Error("No window given");

    if (!options.origin || options.origin === "")
      throw new Error("No origin given");

    // Override the wrapper variable so that subsequently created ports don't
    // use this constructor.  This can be provided as a parameter if you want to
    // compose in some stuff.
    instance.wrapper = options.wrapPort ? options.wrapPort : wrapPort;

    instance.wrapped = options.window;
    instance.origin = options.origin;

    // Set up initial filters if a specific origin is given.
    if (instance.origin !== '*') {
      instance.eventFilters['message'] = instance.eventFilters['messageerror'] =
        event => event.origin === options.origin;
    }
  })
  .methods({
    // Provide a compliant postMessage
    postMessage(message, transferList) {
      this.wrapped.postMessage(message, this.origin, transferList);
    }
  });

export { wrapPort, wrapWindow };
