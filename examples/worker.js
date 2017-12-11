importScripts('messageport-observable.js');

const wrapPort = MessagePortObservable.wrapPort;

const myPort = wrapPort(self);
myPort.filter(event => event.data === 'ping')
  .subscribeAndPostReplies(event => {
    console.log('ping', event.data);
    return ['pong'];
  });

myPort.filter(event => event.data === 'pong')
  .subscribeAndPostReplies(event => {
    console.log('pong', event.data);
    return ['ping'];
  });
