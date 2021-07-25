import * as ta from "https://deno.land/std@0.102.0/testing/asserts.ts";
import * as mod from "./telemetry.ts";

Deno.test("typical Telemetry", () => {
  const telemNoPrefix = new mod.Telemetry();
  const telemPrefixed = new mod.Telemetry("prefix-");

  const instrNP1 = telemNoPrefix.prepareInstrument();
  const instrP1 = telemPrefixed.prepareInstrument({
    identity: "mark1",
    baggage: { key1: "value1" },
  });

  const finishedNP1 = instrNP1.measure();
  const finishedP1 = instrP1.measure();

  ta.assert(finishedNP1.performanceMeasure.duration > 0.0);
  ta.assert(finishedP1.performanceMeasure.name == "prefix-mark1");
  ta.assert(finishedP1.performanceMeasure.duration > 0.0);
});
