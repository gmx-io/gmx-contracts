const fs = require("fs");

// hardhat.config.js reads env.json as soon as it loads, including during
// `hardhat compile`. This writes a placeholder so the image can be built
// without the real secrets. The file is deleted before the image is published
// and must be mounted again at runtime.
const example = JSON.parse(fs.readFileSync("env.example.json", "utf8"));
const dummyKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const dummyUrl = "http://127.0.0.1:8545";

const env = { ...example };
const keys = new Set([
  ...Object.keys(example),
]);

for (const key of keys) {
  const value = env[key];
  if (key.endsWith("_DEPLOY_KEY") || key === "HANDLER_KEY") {
    if (!value || /^0x0+$/.test(value)) {
      env[key] = dummyKey;
    }
    continue;
  }

  if (!value) {
    env[key] = key.endsWith("_URL") ? dummyUrl : "dummy";
  }
}

fs.writeFileSync("env.json", JSON.stringify(env, null, 2));
