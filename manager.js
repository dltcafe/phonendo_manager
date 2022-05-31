import "dotenv/config";
import { start, stop, get_node } from "./libp2p-node.js";

import uuid4 from "uuid4";
import { pipe } from "it-pipe";

import { toString } from "uint8arrays/to-string";
import { fromString } from "uint8arrays/from-string";

const triggers = {
  phonendo_storage: {
    connect: async (node) => {
      let message = {
        key: uuid4(),
        value: uuid4(),
      };
      console.log("Test write", message);

      const { stream } = await node.dialProtocol(
        get_node("phonendo_storage"),
        "/write/1.0.0"
      );
      await pipe(
        [fromString(`${message.key}##${message.value}`)],
        stream,
        async function (source) {
          for await (const data of source) {
            console.log("Result:", toString(data));
            await triggers.phonendo_storage.write(node, message.key);
          }
        }
      );
    },
    write: async (node, key) => {
      console.log("Test read", key);

      const { stream } = await node.dialProtocol(
        get_node("phonendo_storage"),
        "/read/1.0.0"
      );
      await pipe([fromString(key)], stream, async function (source) {
        for await (const data of source) {
          console.log("Result:", toString(data));
          await exit();
        }
      });
    },
  },
  phonendo_verifier: {
    connect: async (node) => {
      console.log("Test verify");

      const { stream } = await node.dialProtocol(
        get_node("phonendo_verifier"),
        "/verify/1.0.0"
      );

      await pipe([fromString("verify")], stream, async function (source) {
        for await (const data of source) {
          console.log("Result:", toString(data));
          await triggers.phonendo_verifier.verify(node);
        }
      });
    },
    verify: async (node) => {
      console.log("Verify trigger called. Nothing to do yet");
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
