import { snarkyBioauth } from "./snarky-bioauth";

describe("snarkyBioauth", () => {
  it("should work", () => {
    expect(snarkyBioauth()).toEqual("snarky-bioauth");
  });
});
