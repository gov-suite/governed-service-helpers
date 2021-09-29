import * as fs from "https://deno.land/std@0.108.0/fs/mod.ts";
import * as path from "https://deno.land/std@0.108.0/path/mod.ts";
import * as gt from "./govn-tree.ts";

export interface FileSysAssetWalker {
  readonly identity: string;
  readonly root: string;
  readonly rootIsAbsolute: boolean;
  readonly options?: fs.WalkOptions;
  readonly remarks?: string;
}

export interface FileSysAssetWalkerSupplier {
  readonly walker: FileSysAssetWalker;
}

export interface FileSysWalkerAssets extends FileSysAssetWalkerSupplier {
  readonly children: FileSysAssetNode[];
  readonly descendants: () => Generator<FileSysAssetNode>;
  readonly subdirectories: (
    maxLevel?: number,
  ) => Generator<FileSysAssetNode>;
  readonly files: (maxLevel?: number) => Generator<FileSysAssetFileNode>;
}

export interface FileSysAssetNode
  extends gt.GovnTreeNode<fs.WalkEntry>, FileSysAssetWalkerSupplier {
  readonly parent?: FileSysAssetNode;
  readonly children: FileSysAssetNode[];
  readonly ancestors: FileSysAssetNode[];
  readonly fileInfo: () => Promise<Deno.FileInfo>;
  readonly fileInfoSync: () => Deno.FileInfo;
  readonly descendants: () => Generator<FileSysAssetNode>;
  readonly subdirectories: (
    maxLevel?: number,
  ) => Generator<FileSysAssetNode>;
  readonly files: (maxLevel?: number) => Generator<FileSysAssetFileNode>;
  readonly select: (
    relative: string,
    noMatch?: (
      endIndex: number,
      parseError?: boolean,
    ) => gt.GovnTreeNode<fs.WalkEntry>,
  ) => FileSysAssetNode | undefined;
}

// deno-lint-ignore no-empty-interface
export interface FileAssetsTreeTerminalSupplier
  extends gt.GovnTreeTerminalSupplier<fs.WalkEntry> {
}

export interface FileSysAssetFileNode extends FileSysAssetNode {
  readonly terminal: fs.WalkEntry;
}

export function* fileSysAssetsNodeSubdirectories(
  parent: { children: FileSysAssetNode[] },
  maxLevel?: number,
): Generator<FileSysAssetNode> {
  for (const node of parent.children) {
    if (typeof node.terminal === "undefined") {
      yield node;
    }
    if (!maxLevel || (node.level <= maxLevel)) {
      if (node.children.length > 0) {
        yield* fileSysAssetsNodeSubdirectories(node, maxLevel);
      }
    }
  }
}

export function* fileSysAssetsNodeFiles(
  parent: { children: FileSysAssetNode[] },
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

export interface FileSysAssetsTreeRegistrationContext {
  walker: FileSysAssetWalker;
  destination: gt.GovnTreeNodesSupplier<fs.WalkEntry>;
}

export class FileSysAssetsTree
  extends gt.GovernedTree<fs.WalkEntry, FileSysAssetsTreeRegistrationContext> {
  readonly assets: FileSysWalkerAssets[] = [];

  /**
   * Parse the hierarchical "units" which comprise our tree node
   * @param ts where we get the fs.WalkEntry from
   * @param rc the walker which tells us about our context
   * @returns the "units" that will comprise the path in the tree
   */
  units(
    ts: FileAssetsTreeTerminalSupplier,
    rc: FileSysAssetsTreeRegistrationContext,
  ): string[] {
    const we = ts.terminal;
    return (rc.walker.rootIsAbsolute
      ? path.relative(rc.walker.root, we.path)
      : we.path).split(path.SEP);
  }

  /**
   * Walk the file system and create nodes for each file in the tree
   * @param walker the files to walk
   * @returns The assets hierarchy ("tree") of all files in the walker
   */
  async consumeAssets(
    walker: FileSysAssetWalker,
  ): Promise<FileSysWalkerAssets> {
    const destination: FileSysWalkerAssets = {
      walker,
      children: [],
      descendants: () =>
        this.descendants(destination) as Generator<FileSysAssetNode>,
      subdirectories: (maxLevel) =>
        fileSysAssetsNodeSubdirectories(destination, maxLevel),
      files: (maxLevel) => fileSysAssetsNodeFiles(destination, maxLevel),
    };
    this.assets.push(destination);

    // walk each subdirectory and file of the given root and treat each file as
    // as "terminal" (leaf) node of our tree
    for await (const terminal of fs.walk(walker.root, walker.options)) {
      if (!terminal.isFile) continue;
      this.populate(
        { terminal },
        { walker, destination },
        {
          refineConstructed: (unrefined) => {
            // gt.GovernedTree.register will create a generic, "unrefined" and
            // untyped node; we want to "refine" or transform the node from a
            // generic to a FileSysAssetNode so that all nodes are typesafe.
            const transformed: FileSysAssetNode = {
              ...unrefined,
              walker,
              parent: unrefined.parent as FileSysAssetNode,
              children: unrefined.children as FileSysAssetNode[],
              ancestors: unrefined.ancestors as FileSysAssetNode[],
              descendants: () =>
                this.descendants(transformed) as Generator<FileSysAssetNode>,
              select: (query, noMatch) =>
                this.selectTreeNode(
                  unrefined,
                  query,
                  noMatch,
                ) as FileSysAssetNode,
              fileInfo: async () => await Deno.stat(terminal.path),
              fileInfoSync: () => Deno.statSync(terminal.path),
              subdirectories: (maxLevel) =>
                fileSysAssetsNodeSubdirectories(transformed, maxLevel),
              files: (maxLevel) =>
                fileSysAssetsNodeFiles(transformed, maxLevel),
            };
            return transformed;
          },
        },
      );
    }
    return destination;
  }
}
