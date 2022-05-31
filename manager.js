import "dotenv/config";
import { start, stop, get_node } from "./libp2p-node.js";

import uuid4 from "uuid4";
import { pipe } from "it-pipe";

import { toString } from "uint8arrays/to-string";
import { fromString } from "uint8arrays/from-string";

const are_services_configured = () => {
  for (const v of ["phonendo_storage", "phonendo_verifier"]) {
    if (get_node(v) == undefined) {
      return false;
    }
  }
  return true;
};

const triggers = {
  phonendo_storage: {
    connect: async (node) => {
      setInterval(async () => {
        let message = {
          key: uuid4(),
          value: {
            field_a: uuid4(),
            field_b: "rocks",
          },
        };
        console.log("Test write", message.value);

        const { stream } = await node.dialProtocol(
          get_node("phonendo_storage"),
          "/write/1.0.0"
        );
        await pipe(
          [fromString(`${message.key}##${JSON.stringify(message.value)}`)],
          stream,
          async function (source) {
            for await (const _ of source) {
              if (are_services_configured()) {
                await triggers.phonendo_verifier.verify(node, message.value);
              }
            }
          }
        );
      }, 2000);
    },
    write: async (node, key) => {
      const { stream } = await node.dialProtocol(
        get_node("phonendo_storage"),
        "/read/1.0.0"
      );
      await pipe([fromString(key)], stream, async function (source) {
        for await (const data of source) {
          const v = toString(data);
          try {
            console.log("Test read", JSON.parse(v));
          } catch (error) {
            console.error(`"${v}" is not a valid JSON object`);
          }
        }
      });
    },
  },
  phonendo_verifier: {
    connect: async (node) => {
      console.log("TODO history");
    },
  
    verify: async (node, message) => {
      const { stream } = await node.dialProtocol(
        get_node("phonendo_verifier"),
        "/verify/1.0.0"
      );
      await pipe(
        [fromString(JSON.stringify(message))],
        stream,
        async function (source) {
          for await (const data of source) {
            const v = toString(data);
            try {
              console.log("Verify result", JSON.parse(v));
            } catch (error) {
              console.error(`"${v}" is not a valid JSON object`);
            }
          }
        }
      );
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
