# messageport-observable

This provides some magic wrappers for [MessagePort][1] objects and things that
resemble them (windows/iframes, workers, etc.).  The wrapped objects still have
the same API as MessagePorts, but also have some additional features.


## Wrapping a MessagePort

Usage in an ES6 context:

~~~ javascript
import {wrapPort} from 'messageport-observable';

const myChannel = new MessageChannel();
const myPort = wrapPort(myChannel.port1);

// myPort is now ready to use like normal:
myPort.onmessage = function(event) { ... };
myPort.postMessage('hello world');
~~~

See the `examples` folder for using in a non-ES6 setting (e.g. a worker, or a
`<script>` tag).  In this case, `wrapPort` and `wrapWindow` will be available
via a global object called `MessagePortObservable`;


## Wrapping a window

A special factory for window wrappers is provided that is like `wrapPort`, but
with the following:

- An `origin` parameter is required by the factory fn, corresponding to the
  `targetOrigin` parameter of [`window.postMessage`][2].  This can be set to
  `'*'` to mean any origin, but as per the docs, it is a good idea to set this
  to something specific for security reasons.
- The differences in the [`window.postMessage`][2] API are covered over.
- If an `origin` other than `'*'` is given, incoming messages that are not from
  this origin are filtered out and not passed on to event listeners (using
  either `onmessage`, or `addEventListener`).

~~~ javascript
import {wrapWindow} from 'messageport-observable';

const iframe = document.querySelector('iframe');
const outPort =  wrapWindow({
  window: iframe.contentWindow,
  origin: window.origin
});
const inPort = wrapWindow(window);

// The postMessage method uses the origin parameter supplied to the factory fn.
outPort.postMessage('hello');

// Only events that are from the same origin as this page will get through
inPort.addEventListener('message', event => { ... });
~~~

As per the `inPort` example, you can call `wrapWindow` with a window object
directly (`wrapWindow(iframe.contentWindow)`), owing to the fact that `window`
objects have both required attributes.  In this case, the origin of the window
at the time that the factory function is called is used.  This is secure in the
case of the current window, but not for iframes.

## Unwrapping

Calling `unwrap()` will return the original port / window / whatever.

~~~ javascript
let iframeWindow = iframePort.unwrap();
~~~

## Treating the port as an observable

Wrapped ports have a `subscribe` method which can be used to subscribe to an [ES
Observable][3].  We use [zen-observable][4] to handle this. You can also use
`Observable.from(myWrappedPort)` to get an observable in the library of your
choice.

The observable will provide a stream of `message` events.  If a `messageerror`
event occurs, the observable will raise that event as an error (which terminates
the observable).  There is no way of knowing when a MessagePort is finished, so
the `complete` method will never be called.

~~~ javascript
// This will be a zen-observable
const subscription = myWrappedPort.subscribe({
  next(event) {
    // Gets called on each message event
  },
  error(event) {
    // Gets called once with a messageerror event
  }
  complete() {
    // This never gets called, as the stream never finishes
  }
});

// When done ...
subscription.unsubscribe();

// Alternatively, to get an observable object from another library
const subscription = Observable.from(myWrappedPort).subscribe({ .. });

// Example using mostjs:
most.from(myWrappedPort).forEach(event => { ... });
~~~

Under the hood, subscribing to the observable uses the wrapped port's
`addEventListener` method to subscribe to events.  If the wrapped port has a
[`start()` method][5] (only bona fide `MessagePort` objects), that will be
called as well, to start the influx of messages.  If you want to prevent that,
you can set the port's `autostart` attribute to false before subscribing:

~~~ javascript
myWrappedPort.autostart = false;
const subscription = myWrappedPort.subscribe({ ... });

/* ... Do some other stuff ... */

myWrappedPort.start(); // Now messages will start coming in.
~~~


## Filtering

Wrapped ports can be filtered using the `filter` method with a callback.  The
result of calling `filter` is another wrapped port object that only emits events
when the callback returns true.  The new wrapped port also has `autostart` set
to false (see above), so that you can set up subscriptions using different
filters before events arrive.  Once all your filters are set up, you should call
`start()` just once on the unfiltered port (assuming the port has a `start`
method).

Filtering is cumulative.  You can call `filter` on a already filtered port to
get a new port where events will only be triggered if both filters are
successful.

~~~ javascript
// Inside a SharedWorker
importScripts('messageport-observable/index.js');

const wrapPort = MessagePortObservable.wrapPort;

self.onconnect = function(connectEvent) {
  const myPort = wrapPort(connectEvent.ports[0]);

  // Here the type of the events being filtered is taken as 'message'
  const pingSubscription = myPort
    .filter(event => event.data === 'ping')
    .subscribe(event => {
      myPort.postMessage('pong');
    });

  // This will echo back the second param as a sort of super-basic RPC:
  // --> ['echo', 'hello world']
  // <-- 'hello world'
  const echoSubscription = myPort
    .filter(event => Array.isArray(event.data) && event.data[0] === 'echo')
    .subscribe(event => {
      myPort.postMessage(event.data[1]);
    });

  // Once all the subscriptions are in place
  myPort.start();
};
~~~

You can filter on either 'message' or 'messageerror' event types.  If the type
is unspecified (as in the examples above), 'message' is assumed.  Filtering on
'messageerror' can be used to prevent particular message errors from triggering
an error in the resulting observable.  

~~~ javascript
myPort
  .filter('messageerror', event => event.source === iframe.contentWindow)
  .subscribe({ ... });
~~~


## Streaming an observable through a port

You can use the `postObservable` method to easily stream an observable through a
port:

~~~ javascript
// Emits a series of pings and then completes
const myObs = new Observable(observer => {
  for (let i = 1000; i < 10000; i += 1000) {
    setTimeout(() => {
      observer.next('ping');
    }, i);
  }

  setTimeout(() => observer.complete(), i);
});

const myChannel = new MessageChannel();
const myPort1 = wrapPort(myChannel.port1);
const myPort2 = wrapPort(myChannel.port2);

// Sends the pings through the channel as data (i.e. first arg to postMessage);
// returns a subscription to the given observable.
const postObsSub = myPort1.postObservable(myObs);

// This would log 'ping' ... 'ping' ... etc.
myPort2.subscribe(({data}) => {
  console.log(data);
});
~~~

This method also works with other objects (e.g. iterables) that can be converted
using `Observable.from`:

~~~ javascript
// Sends each number in its own message
somePort.postObservable([1,2,3,4,5]);

// Example using a generator
somePort.postObservable((function*(){
  yield 'a';
  yield 'b';
})());

// Example using mostjs
somePort.postObservable(most.fromPromise(async function () {
  const response = await fetch('http://example.com/');
  const text = await response.text();
  return text;
}));
~~~

You can pass a second "splat" flag if you want to also set the second argument
of `postMessage`:

~~~ javascript
somePort.postObservable([
  ['message1', [someOtherPort.unwrap()]]
  ['message2'],
  ['message3', [someOtherPort.unwrap()]]
], true);
~~~

If the port has a `close` method (i.e. real MessagePorts), you can pass a
"close" flag in order to close the port once the observable completes / errors:

~~~ javascript
// Calls 'close' after sending three messages
somePort.postObservable([1, 2, 3], false, true);
~~~

## Replying to a message

We include a few methods that can be used to implement more complex messaging
patterns, such as replying to messages.  These all make use of the ability to
transfer MessagePort objects using `postMessage`.  For instance, replying to
a message can be achieved through the following convention:

1. The sender opens a new MessageChannel, and sends a message along with one
   port from the channel.
2. The recipient of the message can then use that port to post a stream of
   replies back to the sender.

This is pretty easy to do with this libary as-is.  For convenience though, the
following methods are included with port wrappers:

- `postMessageWithReply` takes care of part 1 (above) on the sending port by
  creating a MessageChannel and returning a wrapped port that can be filtered,
  subscribed, etc.
- `postMessageWithObservable` is similar, but uses the newly opened channel to
  post a stream of messages, instead of awaiting a reply.
- `subscribeWithPort` takes care of wrapping incoming ports.  This could be
  used with either of the above methods.
- `subscribeAndPostReplies` provides an additional lvel of abstraction over
  `subscribeWithPort`.

`postMessageWithReply` takes a message and returns a wrapped port on which to
receive the replies:

~~~ javascript
// Note that replyPort is a wrapped port.
const replyPort = myPort.postMessageWithReply('hello');
const mySub = replyPort.subscribe(({data}) => {
  console.log(data);
});

// Unsubscribe after a while...
setTimer(mySub.unsubscribe.bind(mySub), 1000);
~~~

`postMessageWithObservable` takes a message and an observable.  The message is
delivered with a newly opened MessagePort, and the observable is streamed to that
newly opened port using `postObservable`.  As such, the observable object just needs
to be something that `Observable.from` can understand.  Once the observable completes,
the newly opened port is closed.

~~~ javascript
// mySub is a subscription to the observable passed into the function.
const mySub = myPort.postMessageWithObservable('here are the reports you wanted', new Observable( ... ));
~~~

`subscribeWithPort` takes a callback and subscribes to a port wrapper.  For each incoming message,
if a MessagePort has been included, that port will be wrapped.  The callback is then called with the
message and the wrapped port.  `subscribeWithPort` will return a subscription.

~~~ javascript
const mySub = port.subscribeWithPort((event, subPort) => {
  // To post a reply
  subPort.postMessage(['got', event.data]); 
});
~~~

`subscribeAndPostReplies` takes a callback, subscribes to the port wrapper, and
calls the callback with each incoming message.  The message is assumed to
include a port for replying.  The return value of the callback should be
something that `Observable.from` understands (e.g. an observable, a wrapped port
or an iterator).  It will then stream that observable back through the reply
port using `postObservable`.

~~~ javascript
// Handy to use with filter, to only reply to particular messages
const sub1 = myPort
  .filter(event => event.data === 'ping')
  .subscribeAndPostReplies(event => {
    return new Observable(observer => {
      observer.next('pong1');
      observer.next('pong2');
      observer.complete();
    });
  });

const sub2 = myPort
  .filter(event => event.data === 'gimme5')
  .subscribeAndPostReplies(() => {
    return [1,2,3,4,5];
  });

// Necessary if myPort is a MessagePort, due to the filter calls.
myPort.start();
~~~


## Licence

Licensed under the Apache Licence, Version 2.0

[1]: https://developer.mozilla.org/en-US/docs/Web/API/MessagePort
[2]: https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage
[3]: https://github.com/tc39/proposal-observable
[4]: https://github.com/zenparsing/zen-observable
[5]: https://developer.mozilla.org/en-US/docs/Web/API/MessagePort/start
