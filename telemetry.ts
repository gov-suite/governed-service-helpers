export type InstrumentBaggage = Record<string, unknown>;

export interface Instrumentable {
  readonly mark: () => PerformanceMark;
  readonly measure: () => Instrument;
  readonly baggage?: InstrumentBaggage;
}

export interface Instrument extends Instrumentable {
  readonly performanceMeasure: PerformanceMeasure;
}

export type InstrumentIdentity = string;

export interface InstrumentationOptions {
  readonly identity?: InstrumentIdentity;
  readonly baggage?: InstrumentBaggage;
}

export interface Instrumentation {
  readonly instruments: Instrument[];
  readonly prepareInstrument: (
    options?: InstrumentationOptions,
  ) => Instrumentable;
}

export class Telemetry implements Instrumentation {
  readonly instruments: Instrument[] = [];

  constructor(readonly prefix?: InstrumentIdentity) {
  }

  prepareInstrument(options?: InstrumentationOptions): Instrumentable {
    const identity = options?.identity ||
      `instrument_${this.instruments.length}`;
    const name = this.prefix ? `${this.prefix}${identity}` : identity;
    const mark = performance.mark(identity, { detail: options?.baggage });
    const result: Instrumentable = {
      mark: () => mark,
      measure: () => {
        const performanceMeasure = performance.measure(name, {
          detail: options?.baggage,
          start: mark.startTime,
        });
        const instrument = {
          ...result,
          performanceMeasure,
        };
        this.instruments.push(instrument);
        return instrument;
      },
      baggage: options?.baggage,
    };
    result.mark();
    return result; // it's the responsibility of the caller to later call result.measure()
  }
}
