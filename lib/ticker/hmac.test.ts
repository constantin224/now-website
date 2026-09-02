import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyShopifyHmac } from "./hmac";

describe("verifyShopifyHmac", () => {
  const secret = "test-secret";
  const body = '{"id":123}';
  const valid = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64");

  it("akzeptiert gültige Signatur", () => {
    expect(verifyShopifyHmac(body, valid, secret)).toBe(true);
  });
  it("lehnt falsche Signatur ab", () => {
    expect(verifyShopifyHmac(body, valid, "anderes-secret")).toBe(false);
    expect(verifyShopifyHmac(body + "x", valid, secret)).toBe(false);
  });
  it("lehnt fehlenden Header ab", () => {
    expect(verifyShopifyHmac(body, null, secret)).toBe(false);
  });

  it("akzeptiert eines von mehreren Secrets (Rotation: Shopify signiert mit dem ältesten)", () => {
    expect(verifyShopifyHmac(body, valid, ["neues-secret", secret])).toBe(true);
    expect(verifyShopifyHmac(body, valid, [secret, "neues-secret"])).toBe(true);
    expect(verifyShopifyHmac(body, valid, ["neues-secret", "noch-eins"])).toBe(false);
    expect(verifyShopifyHmac(body, valid, [])).toBe(false);
    expect(verifyShopifyHmac(body, valid, ["", secret])).toBe(true); // leere Werte werden ignoriert
  });
});
