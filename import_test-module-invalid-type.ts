export interface Unexpected {
  readonly text: string;
  readonly date: Date;
}

export const instance: Unexpected = {
  text: "text value",
  date: new Date(),
};

// Supply an unexpected type
export default instance;
