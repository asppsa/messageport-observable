importScripts('index.js');

let x = 1;

let wrapPort = MessagePortObservable.wrapPort;

self.onconnect = function(connectEvent) {
  let port = wrapPort(connectEvent.ports[0]);
  port.filter(event => event.data === 'inc')
    .subscribeAndPostReplies(event => {
      x += 1;
      return [`inc ${x}`];
    });

  port.filter(event => event.data === 'dec')
    .subscribeAndPostReplies(event => {
      x -= 1;
      return [`dec ${x}`];
    });

  port.start();
};
