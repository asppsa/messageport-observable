/**
 * Something like post-robot, but without the Kraken stuff
 */

import stampit from '@stamp/it';
import {fromEvents,stream} from 'kefir';

import memoizedGetters from './stamps/memoized-getters';

const Listener = stampit()
  .init(function(event, {instance}) {
    instance.event = event;
  })
  .compose(memoizedGetters({
    jsonData() {
      return JSON.parse(this.event.data);
    },

    ports() {
      return this.event.ports;
    }
  }));

const PostRabbit = stampit()
  .init(function(options, {instance}) {
    instance.options = options;
  })
  .compose(memoizedGetters({
    messagePort() {
      if (this.options.window)
        return this.options.window;
      else if (this.options.port)
        return this.options.port;
    },

    sourceFilter() {
      if (this.options.window && this.options.domain)
        return event => event.origin === this.options.domain;
    },

    eventStream() {
      const eventStream = fromEvents(this.messagePort, 'message');
      if (this.sourceFilter)
        return eventStream.filter(this.sourceFilter);
      else
        return eventStream;
    },

    dataStream() {
      return this.eventStream
        .map(event => )
        .filter({data} => data.postRabbit);
    }
  }))
  .methods({
    postMessage(message, transferList) {
      if (this.options.window) {
        const domain = this.options.domain ? this.options.domain : '*';
        this.options.window.postMessage(message, domain, transferList);
      }
      else {
        this.messagePort.postMessage(messsage, transferList);
      }
    },

    send(name, data, transferList) {
      this.postMessage(
        JSON.stringify({name, data, postRabbit: true}),
        transferList
      );
    },

    // Connects the given stream via a messagechannel to the recipient.  The returned stream needs
    // to be subscribed to before anything will happen.
    sendStream(name, data={}, outStream=null, json=true) {
      return stream(emitter => {
        let subscription;

        const messageChannel = new MessageChannel(),
          port = messageChannel.port1,
          postMessage = json
            ? message => port.postMessage(JSON.stringify(message))
            : port.postMessage.bind(port),
          cleanup = () => {
            if (subscription) {
              postMessage({end: true});
              subscription.unsubscribe();
            }

            port.close();
            emitter.end();
          };

        // Send other port to recipient.  Up to them to receive it correctly.
        this.send(name, data, [messageChannel.port2]);

        // Subscribe to the outbound stream and translate events
        if (outStream) {
          subscription = outStream.observe(
            function onValue(value) {
              postMessage({value});
            },
            function onError(error) {
              postMessage({error});
            },
            cleanup
          );
        }

        // Note that this causes the events to start coming in.
        port.onmessage = event => {
          let data;

          if (json)
            data = JSON.parse(event.data);
          else
            data = event.data;

          if (data.value)
            emitter.emit(data.value);
          else if (data.error)
            emitter.error(data.error);
          else if (data.end)
            cleanup();
        };
      });
    },

    sendWithReply(name, data, json=true) {
      return this.sendStream(name, data, null, json)
        .take(1)
        .toPromise();
    },

    // Returns a subscription
    listen(name, cb) {
      return this.dataStream
        .filter(({data}) => data.name === name)
        .observe(cb);
    },

    // Returns a subscription
    listenStream(name, cb) {
      this.dataStream.filter()
    }

    sendWithReplyStream() {

    },

    sendWithReplyPromise() {

    }

  });

export { PostRabbit as default };