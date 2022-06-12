import "dotenv/config";
import { start, stop, get_node } from "./libp2p-node.js";

import uuid4 from "uuid4";
import { pipe } from "it-pipe";

import { toString } from "uint8arrays/to-string";
import { fromString } from "uint8arrays/from-string";

const { createVerify, createPublicKey } = await import("node:crypto");

const are_services_configured = () => {
  for (const v of ["phonendo_storage", "phonendo_verifier"]) {
    if (get_node(v) == undefined) {
      return false;
    }
  }
  return true;
};

const dial = async (node, node_type, protocol) => {
  const { stream } = await node.dialProtocol(
    get_node(`phonendo_${node_type}`),
    `/${protocol}/1.0.0`
  );

  return stream;
};

const pipe_wrapper = async (input, stream, callback) => {
  pipe([fromString(input)], stream, async function (source) {
    for await (const data of source) {
      await callback(data);
    }
  });
};

var verifierPublicKey = undefined;

// Phonendo storage triggers
const phonendo_storage = {
  connect: async (node) => {
      await triggers.phonendo_storage.reconnect(node);
  },

  capture: async (node, message) => {
    await pipe_wrapper(
      `${message.key}##${JSON.stringify(message.value)}`,
      await dial(node, "storage", "capture"),
      async () => {
        if (are_services_configured()) {
          await triggers.phonendo_verifier.verify(
            node,
            message.key,
            message.value
          );
        }
      }
    );
  },

  verify: async (node, key, value) => {
    await pipe_wrapper(
      `${key}##${JSON.stringify(value)}`,
      await dial(node, "storage", "verify"),
      async () => {
        await triggers.phonendo_publisher.publish(node, key, value);
      }
    );
  },

  publish: async (node, key) => {
    await pipe_wrapper(
      key,
      await dial(node, "storage", "publish"),
      async (data) => {
        let value = toString(data);
        console.debug("Status", value);
      }
    );
  },

  reconnect: async (node) => {
    await pipe_wrapper(
        "reconnect",
    await dial(node, "storage", "reconnect"),
        async (data) => {
          let pendingItemsJson = toString(data);
          try {
            pendingItemsJson = JSON.parse(pendingItemsJson);
            let itemsCount = Object.keys(pendingItemsJson).length;

            if (itemsCount > 0) {
              if (are_services_configured()) {
                console.log(`${itemsCount} captured items without verification`);

                for(let item in pendingItemsJson){
                    let [key, value] = pendingItemsJson[item];
                  console.log(`Verifying again: ${key}`);

                  await triggers.phonendo_verifier.verify(
                      node,
                      key,
                      value
                  );
                }
              } else {
                console.error(`Reconnection failed: Verifier is down. ${itemsCount} captured items without verification`);

                  setTimeout(function () {
                      triggers.phonendo_storage.reconnect(node);
                  }, 10000);
              }
            } else {
                console.log("Reconnection successfully, nothing pending to verify");
            }

              await triggers.phonendo_storage.initFake(node);
          } catch (error) {
            console.error(`"${value}" is not a valid JSON object`);
          }
        }
    );
  },

    initFake: async (node) => {
        setInterval(async () => {
            let message = {
                key: uuid4(),
                value: {
                    field_a: uuid4(),
                    field_b: "rocks",
                },
            };
            console.debug("Simulate capture", message.value);
            await triggers.phonendo_storage.capture(node, message);

        }, 5000);
    }
};

// Phonendo verifier triggers
const phonendo_verifier = {
  connect: async (node) => {
    await pipe_wrapper(
      "pk",
      await dial(node, "verifier", "pk"),
      async (data) => {
        let key = toString(data);
        verifierPublicKey = createPublicKey({
          key,
          type: "spki",
          format: "pem",
        });
        console.debug("Public key obtained");
      }
    );
  },

  verify: async (node, key, message) => {
    await pipe_wrapper(
      JSON.stringify(message),
      await dial(node, "verifier", "verify"),
      async (data) => {
        let value = toString(data);
        try {
          value = JSON.parse(value);
          console.debug("Verified message", value);
          let source = value.source;
          let signature = value.signature;

          const verify = createVerify("SHA256");
          verify.write(JSON.stringify(source));
          verify.end();
          const verification = verify.verify(
            verifierPublicKey,
            signature,
            "hex"
          );
          console.log("Verified result", verification);
          if (verification) {
            await triggers.phonendo_storage.verify(node, key, value);
          }
        } catch (error) {
          console.error(`"${value}" is not a valid JSON object`);
        }
      }
    );
  },
};

// Phonendo publisher triggers
const phonendo_publisher = {
  connect: async (_node) => {
    console.log("TODO connect");
  },

  publish: async (node, key, value) => {
    console.log("TODO publish on IOTA");
    await triggers.phonendo_storage.publish(node, key, value);
  },
};

const triggers = {
  phonendo_storage,
  phonendo_verifier,
  phonendo_publisher,
};

start(triggers).then().catch(console.error);

const exit = async () => {
  await stop();
  process.exit(0);
};

process.on("SIGTERM", exit);
process.on("SIGINT", exit);
