importScripts('index.js');

let myPort = MessagePortObservable.wrapPort(self);
myPort.subscribeAndPostReplies(event => {
  switch(event.data) {
    case 'ping':
      console.log('ping');
      return ['pong'];
      break;
  }
});
