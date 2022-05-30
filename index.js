import "dotenv/config";
import { start, stop } from "./libp2p-node.js";

import uuid4 from "uuid4";
import { pipe } from "it-pipe";

import { toString } from "uint8arrays/to-string";
import { fromString } from "uint8arrays/from-string";

const triggers = {
  storage: {
    connect: async (node, storage) => {
      let message = {
        key: uuid4(),
        value: uuid4(),
      };
      console.log("Test write", message);

      const { stream } = await node.dialProtocol(storage, "/write/1.0.0");
      await pipe(
        [fromString(`${message.key}##${message.value}`)],
        stream,
        async function (source) {
          for await (const data of source) {
            console.log("Result:", toString(data));
            await triggers.storage.write(node, storage, message.key);
          }
        }
      );
    },
    write: async (node, storage, key) => {
      console.log("Test read", key);

      const { stream } = await node.dialProtocol(storage, "/read/1.0.0");
      await pipe([fromString(key)], stream, async function (source) {
        for await (const data of source) {
          console.log("Result:", toString(data));
          await exit();
        }
      });
    },
  },
};

start(triggers).then().catch(console.error);

const exit = async () => {
  await stop();
  process.exit(0);
};

process.on("SIGTERM", exit);
process.on("SIGINT", exit);
