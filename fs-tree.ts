import * as fs from "https://deno.land/std@0.108.0/fs/mod.ts";
import * as path from "https://deno.land/std@0.108.0/path/mod.ts";

export interface FileSysAssetWalker {
  readonly identity: string;
  readonly root: string;
  readonly rootIsAbsolute: boolean;
  readonly options?: fs.WalkOptions;
  readonly remarks?: string;
}

export interface FileSysAssetsChildrenSupplier {
  readonly children: FileSysAssetNode[];
  readonly descendants: () => Generator<FileSysAssetNode>;
  readonly subdirectories: (maxLevel?: number) => Generator<FileSysAssetNode>;
  readonly files: (maxLevel?: number) => Generator<FileSysAssetFileNode>;
}

export interface FileSysAssetWalkerNode extends FileSysAssetsChildrenSupplier {
  readonly walker: FileSysAssetWalker;
}

export interface FileSysAssetNode extends FileSysAssetsChildrenSupplier {
  readonly unit: string;
  readonly qualifiedPath: string;
  readonly level: number;
  readonly parent?: FileSysAssetNode;
  readonly ancestors: FileSysAssetNode[];
  readonly terminal?: fs.WalkEntry;
  readonly fileInfo: () => Promise<Deno.FileInfo>;
  readonly fileInfoSync: () => Deno.FileInfo;
}

export interface FileSysAssetFileNode extends FileSysAssetNode {
  readonly terminal: fs.WalkEntry;
}

export function* fileSysAssetsNodeDescendants(
  parent: FileSysAssetsChildrenSupplier,
): Generator<FileSysAssetNode> {
  for (const node of parent.children) {
    yield node;
    if (node.children.length > 0) yield* fileSysAssetsNodeDescendants(node);
  }
}

export function* fileSysAssetsNodeSubdirectories(
  parent: FileSysAssetsChildrenSupplier,
  maxLevel?: number,
): Generator<FileSysAssetNode> {
  for (const node of parent.children) {
    if (typeof node.terminal === "undefined") yield node;
    if (!maxLevel || (node.level <= maxLevel)) {
      if (node.children.length > 0) {
        yield* fileSysAssetsNodeSubdirectories(node, maxLevel);
      }
    }
  }
}

export function* fileSysAssetsNodeFiles(
  parent: FileSysAssetsChildrenSupplier,
  maxLevel?: number,
): Generator<FileSysAssetFileNode> {
  for (const node of parent.children) {
    if (node.terminal) yield node as FileSysAssetFileNode;
    if (!maxLevel || (node.level <= maxLevel)) {
      if (node.children.length > 0) {
        yield* fileSysAssetsNodeFiles(node, maxLevel);
      }
    }
  }
}

export class FileSysAssetsTree {
  readonly assets: FileSysAssetWalkerNode[] = [];

  consumeAsset(
    we: fs.WalkEntry,
    owner: FileSysAssetWalkerNode,
  ): FileSysAssetNode | undefined {
    const units =
      (owner.walker.rootIsAbsolute
        ? path.relative(owner.walker.root, we.path)
        : we.path).split(path.SEP);
    const terminalIndex = units.length - 1;
    const createTreeNode = (
      level: number,
      collection: FileSysAssetNode[],
      ancestors: FileSysAssetNode[],
    ) => {
      // the first ancestor is the parent, second is grandparent, etc.
      const unit = units[level];
      let result = collection.find((p) => p.unit == unit);
      if (!result) {
        const isTerminal = level == terminalIndex;
        const parent = ancestors.length > 0 ? ancestors[0] : undefined;
        result = {
          qualifiedPath: parent?.qualifiedPath
            ? (parent?.qualifiedPath + path.SEP + unit)
            : unit,
          level,
          parent,
          ancestors,
          unit,
          children: [],
          terminal: isTerminal ? we : undefined,
          fileInfo: async () => await Deno.stat(we.path),
          fileInfoSync: () => Deno.statSync(we.path),
          descendants: () => fileSysAssetsNodeDescendants(result!),
          subdirectories: (maxLevel) =>
            fileSysAssetsNodeSubdirectories(result!, maxLevel),
          files: (maxLevel) => fileSysAssetsNodeFiles(result!, maxLevel),
        };
        collection.push(result);
      }
      return result;
    };

    let treeItem: FileSysAssetNode | undefined;
    if (units.length > 0) {
      treeItem = createTreeNode(0, owner.children, []);

      const recurse = (
        level: number,
        ancestors: FileSysAssetNode[],
      ): FileSysAssetNode | undefined => {
        const parent = ancestors[0];
        if (level < units.length) {
          const child = createTreeNode(level, parent.children, ancestors);
          return recurse(level + 1, [child, ...ancestors]);
        }
        return parent;
      };
      treeItem = recurse(1, [treeItem]);
    }
    return treeItem;
  }

  async consumeAssets(
    walker: FileSysAssetWalker,
  ): Promise<FileSysAssetWalkerNode> {
    const owner: FileSysAssetWalkerNode = {
      walker,
      children: [],
      descendants: () => fileSysAssetsNodeDescendants(owner),
      subdirectories: (maxLevel) =>
        fileSysAssetsNodeSubdirectories(owner, maxLevel),
      files: (maxLevel) => fileSysAssetsNodeFiles(owner, maxLevel),
    };
    this.assets.push(owner);
    for await (const we of fs.walk(walker.root, walker.options)) {
      if (!we.isFile) continue;
      this.consumeAsset(we, owner);
    }
    return owner;
  }

  /**
   * Walk all the nodes of the route tree until the inspector returns false
   * @param nodes The tree nodes to traverse
   * @param inspector The function to call for each node, return true to continue traversal or false to end traversal
   * @param maxLevel Stop once the level reaches this maximum
   * @returns a single node that cause traversal to end or void if all nodes traversed
   */
  inspectNodes(
    nodes: FileSysAssetNode[],
    inspector: (entry: FileSysAssetNode) => boolean,
    maxLevel?: number,
  ): FileSysAssetNode | void {
    for (const node of nodes) {
      const result = inspector(node);
      if (!result) return node;
      if (typeof maxLevel === "number" && node.level > maxLevel) continue;
      if (node.children.length > 0) {
        this.inspectNodes(node.children, inspector, maxLevel);
      }
    }
  }

  walkNodes(
    owner: FileSysAssetsChildrenSupplier,
    inspector: (entry: FileSysAssetNode) => boolean,
    maxLevel?: number,
  ): FileSysAssetNode | void {
    return this.inspectNodes(owner.children, inspector, maxLevel);
  }

  /**
   * Traverse the tree and populate a flat array of all matching nodes
   * @param nodes The tree nodes to traverse
   * @param inspector The function to call for each node, return true to populate or false to skip node
   * @param populate The array to fill with nodes that inspector agrees to populate
   * @param level The current level being inspected
   * @param maxLevel Stop populating once the level reaches this maximum
   */
  flatFilterNodes(
    nodes: FileSysAssetsChildrenSupplier,
    inspector: (entry: FileSysAssetNode) => boolean,
    populate: FileSysAssetNode[],
    level: number,
    maxLevel?: number,
  ): void {
    const filtered = nodes.children.filter((n) => inspector(n));
    populate.push(...filtered);
    for (const node of filtered) {
      if (
        typeof maxLevel !== "number" ||
        level <= maxLevel && node.children.length > 0
      ) {
        this.flatFilterNodes(node, inspector, populate, level + 1, maxLevel);
      }
    }
  }

  filterNodes(
    owner: FileSysAssetsChildrenSupplier,
    inspector: (entry: FileSysAssetNode) => boolean,
    maxLevel?: number,
  ): Iterable<FileSysAssetNode> {
    const result: FileSysAssetNode[] = [];
    this.flatFilterNodes(owner, inspector, result, 0, maxLevel);
    return result;
  }
}
