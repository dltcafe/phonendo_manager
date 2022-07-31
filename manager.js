import "dotenv/config";
import { node, start, stop, get_node } from "./libp2p-node.js";

import { pipe } from "it-pipe";

import { toString } from "uint8arrays/to-string";
import { fromString } from "uint8arrays/from-string";

const { createVerify, createPublicKey } = await import("node:crypto");

const are_services_configured = async (services) => {
  for (const service of services) {
    let node = await get_node(`phonendo_${service}`);
    if (node == undefined) {
      return false;
    }
  }
  return true;
};

const dial = async (node, node_type, protocol) => {
  let service = await get_node(`phonendo_${node_type}`);
  if (service) {
    const { stream } = await node.dialProtocol(service, `/${protocol}/1.0.0`);
    return stream;
  }
  return undefined;
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
    if (await are_services_configured(["verifier"])) {
      await triggers.phonendo_storage.verify_cache(node);
    }
  },

  verify_cache: async (node) => {
    await pipe_wrapper(
      "captured",
      await dial(node, "storage", "cache"),
      async (data) => {
        let cache = toString(data);
        try {
          cache = JSON.parse(cache);
          let itemsCount = Object.keys(cache).length;

          if (itemsCount > 0) {
            console.log(`${itemsCount} unverified items`);

            for (let item in cache) {
              let [key, value] = cache[item];
              if (await are_services_configured(["verifier"])) {
                await triggers.phonendo_verifier.verify(node, key, value);
              }
            }
          }
        } catch (error) {
          console.error(`"${value}" is not a valid JSON object`);
        }
      }
    );
  },

  publish_cache: async (node) => {
    await pipe_wrapper(
      "verified",
      await dial(node, "storage", "cache"),
      async (data) => {
        let cache = toString(data);
        try {
          cache = JSON.parse(cache);
          let itemsCount = Object.keys(cache).length;

          if (itemsCount > 0) {
            console.log(`${itemsCount} unpublished items`);

            for (let item in cache) {
              let [key, value] = cache[item];
              if (await are_services_configured(["publisher"])) {
                await triggers.phonendo_publisher.publish(node, key, value);
              }
            }
          }
        } catch (error) {
          console.error(`"${value}" is not a valid JSON object`);
        }
      }
    );
  },

  capture: async (node, message) => {
    await pipe_wrapper(
      `${message.key}##${JSON.stringify(message.value)}`,
      await dial(node, "storage", "capture"),
      async () => {
        if (await are_services_configured(["verifier", "storage"])) {
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
        if (await are_services_configured(["publisher"])) {
          await triggers.phonendo_publisher.publish(node, key, value);
        }
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
    if (await are_services_configured(["storage"])) {
      await triggers.phonendo_storage.verify_cache(node);
    }
  },

  verify: async (node, key, message) => {
    await pipe_wrapper(
      JSON.stringify(message),
      await dial(node, "verifier", "verify"),
      async (data) => {
        let value = toString(data);
        try {
          value = JSON.parse(value);
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
          console.log("Successful verification?", verification);
          if (verification) {
            if (await are_services_configured(["storage"])) {
              await triggers.phonendo_storage.verify(node, key, value);
            } else {
              console.warn(
                "phonendo_storage unavailable. Verification will be lost"
              );
            }
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
  connect: async (node) => {
    if (await are_services_configured(["storage"])) {
      await triggers.phonendo_storage.publish_cache(node);
    }
  },

  publish: async (node, key, value) => {
    await pipe_wrapper(
      JSON.stringify(value),
      await dial(node, "publisher", "publish"),
      async (data) => {
        console.log("publisher result", toString(data));
        if (await are_services_configured(["storage"])) {
          await triggers.phonendo_storage.publish(node, key, value);
        }
      }
    );
  },
};

const triggers = {
  phonendo_storage,
  phonendo_verifier,
  phonendo_publisher,
};

// Protocols
const protocols = {
  "/discover/1.0.0": () => fromString(process.env.SERVICE_NAME),
  "/capture/1.0.0": async (message) => {
    if (await are_services_configured(["storage"])) {
      message = toString(message);
      message = JSON.parse(message);
      await triggers.phonendo_storage.capture(node, message);
      return fromString(true);
    } else {
      console.warn("phonendo_storage unavailable. Capture will be lost");
      return fromString(false);
    }
  },
};

start(protocols, triggers).then().catch(console.error);

const exit = async () => {
  await stop();
  process.exit(0);
};

process.on("SIGTERM", exit);
process.on("SIGINT", exit);
