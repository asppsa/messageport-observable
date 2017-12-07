(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
	typeof define === 'function' && define.amd ? define(['exports'], factory) :
	(factory((global.MessagePortObservable = {})));
}(this, (function (exports) { 'use strict';

var array = Array.isArray;

var _function = function isFunction(arg) {
  return typeof arg === 'function';
};

var object = function isObject(arg) {
  var type = typeof arg;
  return Boolean(arg) && (type === 'object' || type === 'function');
};

var stamp = function isStamp(arg) {
  return _function(arg) && _function(arg.compose);
};

// More proper implementation would be
// isDescriptor(obj) || isStamp(obj)
// but there is no sense since stamp is function and function is object.
var composable = object;

var assign = Object.assign;

var plainObject = function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype;
};

/**
 * The 'src' argument plays the command role.
 * The returned values is always of the same type as the 'src'.
 * @param dst The object to merge into
 * @param src The object to merge from
 * @returns {*}
 */
function mergeOne(dst, src) {
  if (src === undefined) return dst;

  // According to specification arrays must be concatenated.
  // Also, the '.concat' creates a new array instance. Overrides the 'dst'.
  if (array(src)) return (array(dst) ? dst : []).concat(src);

  // Now deal with non plain 'src' object. 'src' overrides 'dst'
  // Note that functions are also assigned! We do not deep merge functions.
  if (!plainObject(src)) return src;

  // See if 'dst' is allowed to be mutated.
  // If not - it's overridden with a new plain object.
  var returnValue = object(dst) ? dst : {};

  var keys = Object.keys(src);
  for (var i = 0; i < keys.length; i += 1) {
    var key = keys[i];

    var srcValue = src[key];
    // Do not merge properties with the 'undefined' value.
    if (srcValue !== undefined) {
      var dstValue = returnValue[key];
      // Recursive calls to mergeOne() must allow only plain objects or arrays in dst
      var newDst = plainObject(dstValue) || array(srcValue) ? dstValue : {};

      // deep merge each property. Recursion!
      returnValue[key] = mergeOne(newDst, srcValue);
    }
  }

  return returnValue;
}

var merge = function (dst) {
  for (var i = 1; i < arguments.length; i++) {
    dst = mergeOne(dst, arguments[i]);
  }
  return dst;
};

var slice = Array.prototype.slice;

/**
 * Creates new factory instance.
 * @returns {Function} The new factory function.
 */
function createFactory() {
  return function Stamp(options) {
    var descriptor = Stamp.compose || {};
    // Next line was optimized for most JS VMs. Please, be careful here!
    var obj = {__proto__: descriptor.methods}; // jshint ignore:line

    merge(obj, descriptor.deepProperties);
    assign(obj, descriptor.properties);
    Object.defineProperties(obj, descriptor.propertyDescriptors || {});

    if (!descriptor.initializers || descriptor.initializers.length === 0) return obj;

    if (options === undefined) options = {};
    var inits = descriptor.initializers;
    var length = inits.length;
    for (var i = 0; i < length; i += 1) {
      var initializer = inits[i];
      if (_function(initializer)) {
        var returnedValue = initializer.call(obj, options,
          {instance: obj, stamp: Stamp, args: slice.apply(arguments)});
        obj = returnedValue === undefined ? obj : returnedValue;
      }
    }

    return obj;
  };
}

/**
 * Returns a new stamp given a descriptor and a compose function implementation.
 * @param {Descriptor} [descriptor={}] The information about the object the stamp will be creating.
 * @param {Compose} composeFunction The "compose" function implementation.
 * @returns {Stamp}
 */
function createStamp(descriptor, composeFunction) {
  var Stamp = createFactory();

  if (descriptor.staticDeepProperties) {
    merge(Stamp, descriptor.staticDeepProperties);
  }
  if (descriptor.staticProperties) {
    assign(Stamp, descriptor.staticProperties);
  }
  if (descriptor.staticPropertyDescriptors) {
    Object.defineProperties(Stamp, descriptor.staticPropertyDescriptors);
  }

  var composeImplementation = _function(Stamp.compose) ? Stamp.compose : composeFunction;
  Stamp.compose = function _compose() {
    return composeImplementation.apply(this, arguments);
  };
  assign(Stamp.compose, descriptor);

  return Stamp;
}

function concatAssignFunctions(dstObject, srcArray, propName) {
  if (!array(srcArray)) return;

  var length = srcArray.length;
  var dstArray = dstObject[propName] || [];
  dstObject[propName] = dstArray;
  for (var i = 0; i < length; i += 1) {
    var fn = srcArray[i];
    if (_function(fn) && dstArray.indexOf(fn) < 0) {
      dstArray.push(fn);
    }
  }
}


function combineProperties(dstObject, srcObject, propName, action) {
  if (!object(srcObject[propName])) return;
  if (!object(dstObject[propName])) dstObject[propName] = {};
  action(dstObject[propName], srcObject[propName]);
}

function deepMergeAssign(dstObject, srcObject, propName) {
  combineProperties(dstObject, srcObject, propName, merge);
}
function mergeAssign(dstObject, srcObject, propName) {
  combineProperties(dstObject, srcObject, propName, assign);
}

/**
 * Mutates the dstDescriptor by merging the srcComposable data into it.
 * @param {Descriptor} dstDescriptor The descriptor object to merge into.
 * @param {Composable} [srcComposable] The composable
 * (either descriptor or stamp) to merge data form.
 */
function mergeComposable(dstDescriptor, srcComposable) {
  var srcDescriptor = (srcComposable && srcComposable.compose) || srcComposable;

  mergeAssign(dstDescriptor, srcDescriptor, 'methods');
  mergeAssign(dstDescriptor, srcDescriptor, 'properties');
  deepMergeAssign(dstDescriptor, srcDescriptor, 'deepProperties');
  mergeAssign(dstDescriptor, srcDescriptor, 'propertyDescriptors');
  mergeAssign(dstDescriptor, srcDescriptor, 'staticProperties');
  deepMergeAssign(dstDescriptor, srcDescriptor, 'staticDeepProperties');
  mergeAssign(dstDescriptor, srcDescriptor, 'staticPropertyDescriptors');
  mergeAssign(dstDescriptor, srcDescriptor, 'configuration');
  deepMergeAssign(dstDescriptor, srcDescriptor, 'deepConfiguration');
  concatAssignFunctions(dstDescriptor, srcDescriptor.initializers, 'initializers');
  concatAssignFunctions(dstDescriptor, srcDescriptor.composers, 'composers');
}

/**
 * Given the list of composables (stamp descriptors and stamps) returns
 * a new stamp (composable factory function).
 * @typedef {Function} Compose
 * @param {...(Composable)} [arguments] The list of composables.
 * @returns {Stamp} A new stamp (aka composable factory function)
 */
var compose = function compose() {
  var descriptor = {};
  var composables = [];
  if (composable(this)) {
    mergeComposable(descriptor, this);
    composables.push(this);
  }

  for (var i = 0; i < arguments.length; i++) {
    var arg = arguments[i];
    if (composable(arg)) {
      mergeComposable(descriptor, arg);
      composables.push(arg);
    }
  }

  var stamp$$1 = createStamp(descriptor, compose);

  var composers = descriptor.composers;
  if (array(composers) && composers.length > 0) {
    for (var j = 0; j < composers.length; j += 1) {
      var composer = composers[j];
      var returnedValue = composer({stamp: stamp$$1, composables: composables});
      stamp$$1 = stamp(returnedValue) ? returnedValue : stamp$$1;
    }
  }

  return stamp$$1;
};


/**
 * The Stamp Descriptor
 * @typedef {Function|Object} Descriptor
 * @returns {Stamp} A new stamp based on this Stamp
 * @property {Object} [methods] Methods or other data used as object instances' prototype
 * @property {Array<Function>} [initializers] List of initializers called for each object instance
 * @property {Array<Function>} [composers] List of callbacks called each time a composition happens
 * @property {Object} [properties] Shallow assigned properties of object instances
 * @property {Object} [deepProperties] Deeply merged properties of object instances
 * @property {Object} [staticProperties] Shallow assigned properties of Stamps
 * @property {Object} [staticDeepProperties] Deeply merged properties of Stamps
 * @property {Object} [configuration] Shallow assigned properties of Stamp arbitrary metadata
 * @property {Object} [deepConfiguration] Deeply merged properties of Stamp arbitrary metadata
 * @property {Object} [propertyDescriptors] ES5 Property Descriptors applied to object instances
 * @property {Object} [staticPropertyDescriptors] ES5 Property Descriptors applied to Stamps
 */

/**
 * The Stamp factory function
 * @typedef {Function} Stamp
 * @returns {*} Instantiated object
 * @property {Descriptor} compose - The Stamp descriptor and composition function
 */

/**
 * A composable object - stamp or descriptor
 * @typedef {Stamp|Descriptor} Composable
 */

function createShortcut(propName) {
  return function (arg) {
    var param = {};
    param[propName] = arg;
    return this && this.compose ? this.compose(param) : compose(param);
  };
}

var properties = createShortcut('properties');
var staticProperties = createShortcut('staticProperties');
var configuration = createShortcut('configuration');
var deepProperties = createShortcut('deepProperties');
var staticDeepProperties = createShortcut('staticDeepProperties');
var deepConfiguration = createShortcut('deepConfiguration');
var initializers = createShortcut('initializers');

var shortcut = compose({
  staticProperties: {
    methods: createShortcut('methods'),

    props: properties,
    properties: properties,

    statics: staticProperties,
    staticProperties: staticProperties,

    conf: configuration,
    configuration: configuration,

    deepProps: deepProperties,
    deepProperties: deepProperties,

    deepStatics: staticDeepProperties,
    staticDeepProperties: staticDeepProperties,

    deepConf: deepConfiguration,
    deepConfiguration: deepConfiguration,

    init: initializers,
    initializers: initializers,

    composers: createShortcut('composers'),

    propertyDescriptors: createShortcut('propertyDescriptors'),

    staticPropertyDescriptors: createShortcut('staticPropertyDescriptors')
  }
});

var concat = Array.prototype.concat;
function extractFunctions() {
  var fns = concat.apply([], arguments).filter(_function);
  return fns.length === 0 ? undefined : fns;
}

function standardiseDescriptor(descr) {
  if (!object(descr)) return descr;

  var methods = descr.methods;
  var properties = descr.properties;
  var props = descr.props;
  var initializers = descr.initializers;
  var init = descr.init;
  var composers = descr.composers;
  var deepProperties = descr.deepProperties;
  var deepProps = descr.deepProps;
  var pd = descr.propertyDescriptors;
  var staticProperties = descr.staticProperties;
  var statics = descr.statics;
  var staticDeepProperties = descr.staticDeepProperties;
  var deepStatics = descr.deepStatics;
  var spd = descr.staticPropertyDescriptors;
  var configuration = descr.configuration;
  var conf = descr.conf;
  var deepConfiguration = descr.deepConfiguration;
  var deepConf = descr.deepConf;

  var p = object(props) || object(properties) ?
    assign({}, props, properties) : undefined;

  var dp = object(deepProps) ? merge({}, deepProps) : undefined;
  dp = object(deepProperties) ? merge(dp, deepProperties) : dp;

  var sp = object(statics) || object(staticProperties) ?
    assign({}, statics, staticProperties) : undefined;

  var sdp = object(deepStatics) ? merge({}, deepStatics) : undefined;
  sdp = object(staticDeepProperties) ? merge(sdp, staticDeepProperties) : sdp;

  var c = object(conf) || object(configuration) ?
    assign({}, conf, configuration) : undefined;

  var dc = object(deepConf) ? merge({}, deepConf) : undefined;
  dc = object(deepConfiguration) ? merge(dc, deepConfiguration) : dc;

  var ii = extractFunctions(init, initializers);

  var cc = extractFunctions(composers);

  var descriptor = {};
  if (methods) descriptor.methods = methods;
  if (p) descriptor.properties = p;
  if (ii) descriptor.initializers = ii;
  if (cc) descriptor.composers = cc;
  if (dp) descriptor.deepProperties = dp;
  if (sp) descriptor.staticProperties = sp;
  if (sdp) descriptor.staticDeepProperties = sdp;
  if (pd) descriptor.propertyDescriptors = pd;
  if (spd) descriptor.staticPropertyDescriptors = spd;
  if (c) descriptor.configuration = c;
  if (dc) descriptor.deepConfiguration = dc;

  return descriptor;
}

function stampit() {
  var length = arguments.length, args = [];
  for (var i = 0; i < length; i += 1) {
    var arg = arguments[i];
    args.push(stamp(arg) ? arg : standardiseDescriptor(arg));
  }

  return compose.apply(this || baseStampit, args); // jshint ignore:line
}

var baseStampit = shortcut.compose({
  staticProperties: {
    create: function () { return this.apply(this, arguments); },
    compose: stampit // infecting
  }
});

var shortcuts = shortcut.compose.staticProperties;
for (var prop in shortcuts) stampit[prop] = shortcuts[prop].bind(baseStampit);
stampit.compose = stampit.bind();

var it = stampit;

function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

var zenObservable$1 = createCommonjsModule(function (module, exports) {
(function(fn, name) { fn(exports, module); })(function(exports, module) { // === Symbol Support ===

function hasSymbol(name) {
  return typeof Symbol === "function" && Boolean(Symbol[name]);
}

function getSymbol(name) {
  return hasSymbol(name) ? Symbol[name] : "@@" + name;
}

// Ponyfill Symbol.observable for interoperability with other libraries
if (typeof Symbol === "function" && !Symbol.observable) {
  Symbol.observable = Symbol("observable");
}

// === Abstract Operations ===

function getMethod(obj, key) {
  var value = obj[key];

  if (value == null)
    return undefined;

  if (typeof value !== "function")
    throw new TypeError(value + " is not a function");

  return value;
}

function getSpecies(obj) {
  var ctor = obj.constructor;
  if (ctor !== undefined) {
    ctor = ctor[getSymbol("species")];
    if (ctor === null) {
      ctor = undefined;
    }
  }
  return ctor !== undefined ? ctor : Observable;
}

function addMethods(target, methods) {
  Object.keys(methods).forEach(function(k) {
    var desc = Object.getOwnPropertyDescriptor(methods, k);
    desc.enumerable = false;
    Object.defineProperty(target, k, desc);
  });
}

function cleanupSubscription(subscription) {
  // Assert:  observer._observer is undefined

  var cleanup = subscription._cleanup;

  if (!cleanup)
    return;

  // Drop the reference to the cleanup function so that we won't call it
  // more than once
  subscription._cleanup = undefined;

  // Call the cleanup function
  cleanup();
}

function subscriptionClosed(subscription) {
  return subscription._observer === undefined;
}

function closeSubscription(subscription) {
  if (subscriptionClosed(subscription))
    return;

  subscription._observer = undefined;
  cleanupSubscription(subscription);
}

function cleanupFromSubscription(subscription) {
  return function() { subscription.unsubscribe(); };
}

function Subscription(observer, subscriber) {
  // Assert: subscriber is callable

  // The observer must be an object
  if (Object(observer) !== observer)
    throw new TypeError("Observer must be an object");

  this._cleanup = undefined;
  this._observer = observer;

  var start = getMethod(observer, "start");

  if (start)
    start.call(observer, this);

  if (subscriptionClosed(this))
    return;

  observer = new SubscriptionObserver(this);

  try {
    // Call the subscriber function
    var cleanup$0 = subscriber.call(undefined, observer);

    // The return value must be undefined, null, a subscription object, or a function
    if (cleanup$0 != null) {
      if (typeof cleanup$0.unsubscribe === "function")
        cleanup$0 = cleanupFromSubscription(cleanup$0);
      else if (typeof cleanup$0 !== "function")
        throw new TypeError(cleanup$0 + " is not a function");

      this._cleanup = cleanup$0;
    }
  } catch (e) {
    // If an error occurs during startup, then attempt to send the error
    // to the observer
    observer.error(e);
    return;
  }

  // If the stream is already finished, then perform cleanup
  if (subscriptionClosed(this))
    cleanupSubscription(this);
}

addMethods(Subscription.prototype = {}, {
  get closed() { return subscriptionClosed(this) },
  unsubscribe: function() { closeSubscription(this); },
});

function SubscriptionObserver(subscription) {
  this._subscription = subscription;
}

addMethods(SubscriptionObserver.prototype = {}, {

  get closed() { return subscriptionClosed(this._subscription) },

  next: function(value) {
    var subscription = this._subscription;

    // If the stream is closed, then return undefined
    if (subscriptionClosed(subscription))
      return undefined;

    var observer = subscription._observer;
    var m = getMethod(observer, "next");

    // If the observer doesn't support "next", then return undefined
    if (!m)
      return undefined;

    // Send the next value to the sink
    return m.call(observer, value);
  },

  error: function(value) {
    var subscription = this._subscription;

    // If the stream is closed, throw the error to the caller
    if (subscriptionClosed(subscription))
      throw value;

    var observer = subscription._observer;
    subscription._observer = undefined;

    try {
      var m$0 = getMethod(observer, "error");

      // If the sink does not support "error", then throw the error to the caller
      if (!m$0)
        throw value;

      value = m$0.call(observer, value);
    } catch (e) {
      try { cleanupSubscription(subscription); }
      finally { throw e }
    }

    cleanupSubscription(subscription);
    return value;
  },

  complete: function(value) {
    var subscription = this._subscription;

    // If the stream is closed, then return undefined
    if (subscriptionClosed(subscription))
      return undefined;

    var observer = subscription._observer;
    subscription._observer = undefined;

    try {
      var m$1 = getMethod(observer, "complete");

      // If the sink does not support "complete", then return undefined
      value = m$1 ? m$1.call(observer, value) : undefined;
    } catch (e) {
      try { cleanupSubscription(subscription); }
      finally { throw e }
    }

    cleanupSubscription(subscription);
    return value;
  },

});

function Observable(subscriber) {
  // The stream subscriber must be a function
  if (typeof subscriber !== "function")
    throw new TypeError("Observable initializer must be a function");

  this._subscriber = subscriber;
}

addMethods(Observable.prototype, {

  subscribe: function(observer) { for (var args = [], __$0 = 1; __$0 < arguments.length; ++__$0) args.push(arguments[__$0]); 
    if (typeof observer === 'function') {
      observer = {
        next: observer,
        error: args[0],
        complete: args[1],
      };
    }

    return new Subscription(observer, this._subscriber);
  },

  forEach: function(fn) { var __this = this; 
    return new Promise(function(resolve, reject) {
      if (typeof fn !== "function")
        return Promise.reject(new TypeError(fn + " is not a function"));

      __this.subscribe({
        _subscription: null,

        start: function(subscription) {
          if (Object(subscription) !== subscription)
            throw new TypeError(subscription + " is not an object");

          this._subscription = subscription;
        },

        next: function(value) {
          var subscription = this._subscription;

          if (subscription.closed)
            return;

          try {
            return fn(value);
          } catch (err) {
            reject(err);
            subscription.unsubscribe();
          }
        },

        error: reject,
        complete: resolve,
      });
    });
  },

  map: function(fn) { var __this = this; 
    if (typeof fn !== "function")
      throw new TypeError(fn + " is not a function");

    var C = getSpecies(this);

    return new C(function(observer) { return __this.subscribe({
      next: function(value) {
        if (observer.closed)
          return;

        try { value = fn(value); }
        catch (e) { return observer.error(e) }

        return observer.next(value);
      },

      error: function(e) { return observer.error(e) },
      complete: function(x) { return observer.complete(x) },
    }); });
  },

  filter: function(fn) { var __this = this; 
    if (typeof fn !== "function")
      throw new TypeError(fn + " is not a function");

    var C = getSpecies(this);

    return new C(function(observer) { return __this.subscribe({
      next: function(value) {
        if (observer.closed)
          return;

        try { if (!fn(value)) return undefined }
        catch (e) { return observer.error(e) }

        return observer.next(value);
      },

      error: function(e) { return observer.error(e) },
      complete: function() { return observer.complete() },
    }); });
  },

  reduce: function(fn) { var __this = this; 
    if (typeof fn !== "function")
      throw new TypeError(fn + " is not a function");

    var C = getSpecies(this);
    var hasSeed = arguments.length > 1;
    var hasValue = false;
    var seed = arguments[1];
    var acc = seed;

    return new C(function(observer) { return __this.subscribe({

      next: function(value) {
        if (observer.closed)
          return;

        var first = !hasValue;
        hasValue = true;

        if (!first || hasSeed) {
          try { acc = fn(acc, value); }
          catch (e) { return observer.error(e) }
        } else {
          acc = value;
        }
      },

      error: function(e) { observer.error(e); },

      complete: function() {
        if (!hasValue && !hasSeed) {
          observer.error(new TypeError("Cannot reduce an empty sequence"));
          return;
        }

        observer.next(acc);
        observer.complete();
      },

    }); });
  },

  flatMap: function(fn) { var __this = this; 
    if (typeof fn !== "function")
      throw new TypeError(fn + " is not a function");

    var C = getSpecies(this);

    return new C(function(observer) {
      var completed = false;
      var subscriptions = [];

      // Subscribe to the outer Observable
      var outer = __this.subscribe({

        next: function(value) {
          if (fn) {
            try {
              value = fn(value);
            } catch (x) {
              observer.error(x);
              return;
            }
          }

          // Subscribe to the inner Observable
          Observable.from(value).subscribe({
            _subscription: null,

            start: function(s) { subscriptions.push(this._subscription = s); },
            next: function(value) { observer.next(value); },
            error: function(e) { observer.error(e); },

            complete: function() {
              var i = subscriptions.indexOf(this._subscription);

              if (i >= 0)
                subscriptions.splice(i, 1);

              closeIfDone();
            }
          });
        },

        error: function(e) {
          return observer.error(e);
        },

        complete: function() {
          completed = true;
          closeIfDone();
        }
      });

      function closeIfDone() {
        if (completed && subscriptions.length === 0)
          observer.complete();
      }

      return function() {
        subscriptions.forEach(function(s) { return s.unsubscribe(); });
        outer.unsubscribe();
      };
    });
  },

});

Object.defineProperty(Observable.prototype, getSymbol("observable"), {
  value: function() { return this },
  writable: true,
  configurable: true,
});

addMethods(Observable, {

  from: function(x) {
    var C = typeof this === "function" ? this : Observable;

    if (x == null)
      throw new TypeError(x + " is not an object");

    var method = getMethod(x, getSymbol("observable"));

    if (method) {
      var observable$0 = method.call(x);

      if (Object(observable$0) !== observable$0)
        throw new TypeError(observable$0 + " is not an object");

      if (observable$0.constructor === C)
        return observable$0;

      return new C(function(observer) { return observable$0.subscribe(observer); });
    }

    if (hasSymbol("iterator") && (method = getMethod(x, getSymbol("iterator")))) {
      return new C(function(observer) {
        for (var __$0 = (method.call(x))[Symbol.iterator](), __$1; __$1 = __$0.next(), !__$1.done;) { var item$0 = __$1.value; 
          observer.next(item$0);
          if (observer.closed)
            return;
        }

        observer.complete();
      });
    }

    if (Array.isArray(x)) {
      return new C(function(observer) {
        for (var i$0 = 0; i$0 < x.length; ++i$0) {
          observer.next(x[i$0]);
          if (observer.closed)
            return;
        }

        observer.complete();
      });
    }

    throw new TypeError(x + " is not observable");
  },

  of: function() { for (var items = [], __$0 = 0; __$0 < arguments.length; ++__$0) items.push(arguments[__$0]); 
    var C = typeof this === "function" ? this : Observable;

    return new C(function(observer) {
      for (var i$1 = 0; i$1 < items.length; ++i$1) {
        observer.next(items[i$1]);
        if (observer.closed)
          return;
      }

      observer.complete();
    });
  },

});

Object.defineProperty(Observable, getSymbol("species"), {
  get: function() { return this },
  configurable: true,
});

exports.Observable = Observable;


}, "*");
});

var zenObservable = zenObservable$1.Observable;

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
var wrapper = it().props({ isWrapped: true }).propertyDescriptors({
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

    var clone = this.wrapper.props({ autostart: false })(this);
    clone.eventFilters[type] = newFilter;

    return clone;
  },
  addEventListener: function addEventListener(type, listener, options) {
    if (!this.eventListeners[type]) this.eventListeners[type] = new mapImpl();

    // This ensures that we are only notified about events that are considered
    // safe
    if (!this.eventListeners[type].has(listener)) {
      var eventFilter = this.eventFilters[type];

      if (eventFilter) {
        this.eventListeners[type].set(listener, function (event) {
          if (eventFilter.call(this, event)) listener.call(this, event);
        });
      } else {
        this.eventListeners[type].set(listener, listener);
      }
    }

    this.wrapped.addEventListener(type, this.eventListeners[type].get(listener), options);
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

var observablePort = it().props({
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

      var observable = new zenObservable(function (observer) {
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

    listener(replyPort);
    this.postMessage(message, [messageChannel.port2]);
  },
  postObservable: function postObservable(observable) {
    var _this2 = this;

    var splat = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
    var close = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

    var complete = close && typeof this.close === 'function' ? this.close.bind(this) : null;

    var next = splat ? function (args) {
      return _this2.postMessage.apply(_this2, toConsumableArray(args));
    } : this.postMessage.bind(this);

    return zenObservable.from(observable).subscribe({ complete: complete, next: next, error: complete });
  },
  postMessageWithObservable: function postMessageWithObservable(message, observable) {
    var messageChannel = new MessageChannel(),
        postPort = this.wrapper(messageChannel.port1);

    this.postMessage(message, [messageChannel.port2]);
    return postPort.postObservable(observable);
  },
  subscribeAndPostReplies: function subscribeAndPostReplies(listener) {
    var splat = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

    var wrapper = this.wrapper;
    return this.observable.subscribe({
      next: function next(event) {
        var response = listener(event);

        if (response && event.ports[0]) {
          var replyPort = wrapper(event.ports[0]);
          replyPort.postObservable(zenObservable.from(response), splat, true);
        }
      }
    });
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

Object.defineProperty(exports, '__esModule', { value: true });

})));
//# sourceMappingURL=index.js.map
