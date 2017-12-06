importScripts('index.js');

let x = 1;

self.onconnect = function(connectEvent) {
  let port = MessagePortObservable.wrapPort(connectEvent.ports[0]);
  port.subscribeAndPostReplies(event => {
    x += 1;
    return [x];
  });
};
