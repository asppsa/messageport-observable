'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var stampit = _interopDefault(require('@stamp/it'));
var Observable = _interopDefault(require('zen-observable'));

var toConsumableArray = function (arr) {
  if (Array.isArray(arr)) {
    for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) arr2[i] = arr[i];

    return arr2;
  } else {
    return Array.from(arr);
  }
};

/**
 * This is a "lightweight" (is it?) wrapper around MessagePort / Window / Worker
 * objects (things that have a postMessage method).
 */

/**
 * This is used to ensure that when the wrapped object is set, method bindings
 * happen
 */
var wrapper = stampit().props({ isWrapped: true }).propertyDescriptors({
  wrapped: {
    enumerable: true,
    configurable: true,
    get: function get$$1() {
      return null;
    },
    set: function set$$1(obj) {
      if (!obj) throw new Error("Cannot set wrapped object to falsy");

      delete this.wrapped;
      Object.defineProperty(this, 'wrapped', {
        value: obj,
        writable: true,
        configurable: true,
        enumerable: true
      });
    }
  }
}).init(function (_, _ref) {
  var instance = _ref.instance,
      stamp = _ref.stamp;

  instance.wrapper = stamp;
}).methods({
  unwrap: function unwrap() {
    if (!this.wrapped) throw new Error("No wrapped object in this wrapper");

    return this.wrapped.isWrapped ? this.wrapped.unwrap() : this.wrapped;
  }
});

function filteringPropertyDescriptor(type) {
  var attribute = 'on' + type;

  return {
    enumerable: true,
    configurable: false,
    get: function get$$1() {
      return this.wrapped[attribute];
    },
    set: function set$$1(listener) {
      var eventFilter = this.eventFilters[type];
      if (eventFilter) {
        this.wrapped[attribute] = function (event) {
          if (eventFilter.call(this, event)) listener.call(this, event);
        };
      } else {
        this.wrapped[attribute] = listener;
      }
    }
  };
}

// Use a WeakMap if poss.  That way, if the messageport loses the ref to
// the listener on its own, there's no memory leak
var mapImpl = typeof WeakMap === 'function' ? WeakMap : Map;

/**
 * This is stamp returns an object that wraps event handlers so that they only
 * fire when the given filters apply
 */
var filteringPort = wrapper.init(function (_, _ref2) {
  var instance = _ref2.instance,
      stamp = _ref2.stamp;

  instance.eventFilters = {};
  instance.eventListeners = {};
}).methods({
  filter: function filter() {
    var newFilter = void 0,
        type = void 0;

    if (arguments.length === 1) {
      type = 'message';
      newFilter = arguments[0];
    } else {
      type = arguments[0];
      newFilter = arguments[1];
    }

    var clone = this.wrapper(this);
    clone.autostart = false;
    clone.eventFilters[type] = newFilter;

    return clone;
  },
  addEventListener: function addEventListener(type, listener, options) {
    if (!this.eventListeners[type]) this.eventListeners[type] = new mapImpl();

    // This ensures that we are only notified about events that haven't been
    // filtered out
    if (!this.eventListeners[type].has(listener)) {
      var eventFilter = this.eventFilters[type];

      var wrappedListener = void 0;
      if (eventFilter) {
        wrappedListener = function wrappedListener(event) {
          if (eventFilter(event)) {
            typeof listener.handleEvent === 'function' ? listener.handleEvent(event) : listener(event);
          }
        };
      } else {
        wrappedListener = listener;
      }

      this.wrapped.addEventListener(type, wrappedListener, options);
      this.eventListeners[type].set(listener, wrappedListener);
    }
  },
  removeEventListener: function removeEventListener(type, listener, options) {
    if (this.eventListeners[type] && this.eventListeners[type].has(listener)) {
      this.wrapped.removeEventListener(type, this.eventListeners[type].get(listener), options);
      this.eventListeners[type].delete(listener);
    }
  }
}).propertyDescriptors({
  onmessage: filteringPropertyDescriptor('message'),
  onmessageerror: filteringPropertyDescriptor('messageerror')
});

var observablePort = stampit().props({
  autostart: true
}).init(function (_, _ref3) {
  var instance = _ref3.instance;

  // Add standardised observable accessor, if poss.
  if (typeof Symbol === 'function' && Symbol.observable) instance[Symbol.observable] = function () {
    return instance.observable;
  };
}).propertyDescriptors({
  observable: {
    enumerable: true,
    configurable: true,
    get: function get$$1() {
      var _this = this;

      var observable = new Observable(function (observer) {
        var messageCb = observer.next.bind(observer);
        var messageErrorCb = observer.error.bind(observer);
        _this.addEventListener('message', messageCb);
        _this.addEventListener('messageerror', messageErrorCb);

        if (_this.autostart && _this.start) _this.start();

        return function () {
          _this.removeEventListener('message', messageCb);
          _this.removeEventListener('messageerror', messageErrorCb);
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
}).methods({
  subscribe: function subscribe() {
    var _observable;

    return (_observable = this.observable).subscribe.apply(_observable, arguments);
  },
  postMessageWithReply: function postMessageWithReply(message, listener) {
    var messageChannel = new MessageChannel(),
        replyPort = this.wrapper(messageChannel.port1);

    this.postMessage(message, [messageChannel.port2]);
    if (listener) listener(replyPort);else return replyPort;
  },
  postObservable: function postObservable(observable) {
    var _this2 = this;

    var splat = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
    var close = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

    var complete = close && typeof this.close === 'function' ? function () {
      return _this2.close();
    } : undefined;

    var next = splat ? function (args) {
      return _this2.postMessage.apply(_this2, toConsumableArray(args));
    } : this.postMessage.bind(this);

    return Observable.from(observable).subscribe(next, complete, complete);
  },
  postMessageWithObservable: function postMessageWithObservable(message, observable) {
    var splat = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

    var messageChannel = new MessageChannel(),
        postPort = this.wrapper(messageChannel.port1);

    this.postMessage(message, [messageChannel.port2]);
    return postPort.postObservable(observable, splat, true);
  },
  subscribeWithPort: function subscribeWithPort(listener) {
    var wrapper = this.wrapper;
    return this.subscribe(function (event) {
      var port = event.ports[0];
      var wrappedPort = port ? wrapper(port) : null;
      listener(event, wrappedPort);
    });
  },
  subscribeAndPostReplies: function subscribeAndPostReplies(listener) {
    var splat = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

    return this.subscribeWithPort(function (event, replyPort) {
      var response = listener(event);
      if (response && replyPort) replyPort.postObservable(response, splat, true);
    }, splat);
  }
});

var filteringObservablePort = filteringPort.compose(observablePort);

/**
 * A generic wrapper around MessagePort objects (incl. workers)
 */
var wrapPort = filteringObservablePort.init(function (port, _ref4) {
  var instance = _ref4.instance;

  if (!port) throw new Error("No port given");

  instance.wrapped = port;
  var _arr = ['postMessage', 'start', 'close'];
  for (var _i = 0; _i < _arr.length; _i++) {
    var method = _arr[_i];
    if (typeof port[method] === 'function') instance[method] = port[method].bind(port);
  }
});

/**
 * A MessagePort-alike interface for windows.  Adds the following:
 *
 * - filters to ensure that all events sent and received have an origin setting.
 * - shims the postMessage method so that it looks like the MessagePort one
 */
var wrapWindow = filteringObservablePort.init(function (options, _ref5) {
  var instance = _ref5.instance;

  if (!options.window) throw new Error("No window given");

  if (!options.origin || options.origin === "") throw new Error("No origin given");

  // Override the wrapper variable so that subsequently created ports don't
  // use this constructor.  This can be provided as a parameter if you want to
  // compose in some stuff.
  instance.wrapper = options.wrapPort ? options.wrapPort : wrapPort;

  instance.wrapped = options.window;
  instance.origin = options.origin;

  // Set up initial filters if a specific origin is given.
  if (instance.origin !== '*') {
    instance.eventFilters['message'] = instance.eventFilters['messageerror'] = function (event) {
      return event.origin === options.origin;
    };
  }
}).methods({
  // Provide a compliant postMessage
  postMessage: function postMessage(message, transferList) {
    this.wrapped.postMessage(message, this.origin, transferList);
  }
});

exports.wrapPort = wrapPort;
exports.wrapWindow = wrapWindow;
//# sourceMappingURL=index.js.map
