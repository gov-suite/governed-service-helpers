export interface Expected {
  readonly text: string;
  readonly numeric: number;
}

export const instance: Expected = {
  text: "text value",
  numeric: 45,
};

// Don't supply a default
// export default instance;
