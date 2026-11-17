const { ethers } = require("ethers");
const { GoogleAuth } = require("google-auth-library");

const KMS_API = "https://cloudkms.googleapis.com/v1";
const SECP256K1_N = ethers.BigNumber.from("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

async function kmsRequest(url, data) {
  const client = await auth.getClient();
  const res = await client.request({ url, method: data ? "POST" : "GET", data });
  return res.data;
}

function readDerLength(bytes, offset) {
  const first = bytes[offset];
  if (first < 0x80) {
    return [first, offset + 1];
  }
  let length = 0;
  for (let i = 1; i <= (first & 0x7f); i++) {
    length = length * 256 + bytes[offset + i];
  }
  return [length, offset + 1 + (first & 0x7f)];
}

function readDerInteger(bytes, offset) {
  if (bytes[offset] !== 0x02) {
    throw new Error("KMS signature: expected a DER integer");
  }
  const [length, start] = readDerLength(bytes, offset + 1);
  return [ethers.BigNumber.from(bytes.slice(start, start + length)), start + length];
}

// KMS returns an ASN.1 DER ECDSA signature; Ethereum needs low-s r, s and the recovery id
function parseDerSignature(der) {
  const bytes = ethers.utils.arrayify(der);
  if (bytes[0] !== 0x30) {
    throw new Error("KMS signature: expected a DER sequence");
  }
  const [, sequenceStart] = readDerLength(bytes, 1);
  const [r, sStart] = readDerInteger(bytes, sequenceStart);
  let [s] = readDerInteger(bytes, sStart);
  if (s.gt(SECP256K1_N.div(2))) {
    s = SECP256K1_N.sub(s);
  }
  return { r: ethers.utils.hexZeroPad(r.toHexString(), 32), s: ethers.utils.hexZeroPad(s.toHexString(), 32) };
}

// signs with a Google Cloud KMS EC_SIGN_SECP256K1_SHA256 key version: the key never leaves KMS
class KmsSigner extends ethers.Signer {
  constructor(keyVersionName, provider, address) {
    super();
    ethers.utils.defineReadOnly(this, "keyVersionName", keyVersionName);
    ethers.utils.defineReadOnly(this, "provider", provider);
    this.address = address;
  }

  // the old fee scripts read signer.address synchronously, so it is loaded before they run
  async init() {
    if (!this.address) {
      const { pem } = await kmsRequest(`${KMS_API}/${this.keyVersionName}/publicKey`);
      const der = Buffer.from(pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""), "base64");
      this.address = ethers.utils.computeAddress(der.subarray(der.length - 65));
    }
    return this;
  }

  async getAddress() {
    await this.init();
    return this.address;
  }

  connect(provider) {
    return new KmsSigner(this.keyVersionName, provider, this.address);
  }

  async signDigest(digest) {
    const address = await this.getAddress();
    const { signature } = await kmsRequest(`${KMS_API}/${this.keyVersionName}:asymmetricSign`, {
      digest: { sha256: Buffer.from(ethers.utils.arrayify(digest)).toString("base64") },
    });
    const { r, s } = parseDerSignature(Buffer.from(signature, "base64"));
    for (const recoveryParam of [0, 1]) {
      if (ethers.utils.recoverAddress(digest, { r, s, recoveryParam }) === address) {
        return ethers.utils.splitSignature({ r, s, recoveryParam });
      }
    }
    throw new Error(`KMS signature does not recover to ${address}`);
  }

  async signTransaction(transaction) {
    const tx = await ethers.utils.resolveProperties(transaction);
    const { from, ...unsignedTx } = tx;
    if (from && ethers.utils.getAddress(from) !== (await this.getAddress())) {
      throw new Error(`transaction from ${from} is not the KMS signer ${this.address}`);
    }
    const signature = await this.signDigest(ethers.utils.keccak256(ethers.utils.serializeTransaction(unsignedTx)));
    return ethers.utils.serializeTransaction(unsignedTx, signature);
  }

  async signMessage(message) {
    const signature = await this.signDigest(ethers.utils.hashMessage(message));
    return ethers.utils.joinSignature(signature);
  }
}

module.exports = { KmsSigner };
