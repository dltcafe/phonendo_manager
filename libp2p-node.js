import "dotenv/config";

import { createLibp2p } from "libp2p";
import { TCP } from "@libp2p/tcp";
import { Noise } from "@chainsafe/libp2p-noise";
import { Mplex } from "@libp2p/mplex";
import { MulticastDNS } from "@libp2p/mdns";

import { pipe } from "it-pipe";

import { toString } from "uint8arrays/to-string";
import { fromString } from "uint8arrays/from-string";

var triggers = undefined;
var addresses = new Set();
var storage = undefined;

const node = await createLibp2p({
  addresses: {
    listen: [`/ip4/127.0.0.1/tcp/${process.env.PORT}`],
  },
  transports: [new TCP()],
  connectionEncryption: [new Noise()],
  streamMuxers: [new Mplex()],
  peerDiscovery: [
    new MulticastDNS({
      interval: 20e3,
    }),
  ],
});

const connect = async (id) => {
  if (!addresses.has(id.toString())) {
    addresses.add(id.toString());
    const { stream } = await node.dialProtocol(id, "/discover/1.0.0");
    await pipe(
      [fromString("discover")],
      stream,
      async function (source) {
        for await (const data of source) {
          let node_type = toString(data);
          console.log(
            `Added ${node_type} peer ${id.toString()} to the address book`
          );
          if (node_type === "phonendo_storage") {
            if (storage) {
              console.log(
                `The previous storage peer (${storage}) has been overriden`
              );
            }
            await triggers.storage.connect(node, storage = id);
          }
        }
      }
    );
  }
};

const start = async (aux_triggers) => {
  await node.start();
  console.log(`${process.env.SERVICE_NAME} has started`);

  node.getMultiaddrs().forEach((addr) => {
    console.log(`Listening on address: ${addr.toString()}`);
  });

  triggers = aux_triggers;

  node.addEventListener("peer:discovery", async (peerData) => {
    await connect(peerData.detail.id);
  });
};

const stop = async () => {
  await node.stop();
  console.log(`${process.env.SERVICE_NAME} has stopped`);
};

export { start, stop };
