// deno-lint-ignore no-explicit-any
export type UntypedTerminal = any;

export interface GovnTreeNodesSupplier<Terminal> {
  readonly children: GovnTreeNode<Terminal>[];
  readonly descendants: () => Generator<GovnTreeNode<Terminal>>;
}

export interface GovnTreeTerminalSupplier<Terminal> {
  readonly terminal: Terminal;
}

export interface GovnTreeNode<Terminal>
  extends
    GovnTreeNodesSupplier<Terminal>,
    Partial<GovnTreeTerminalSupplier<Terminal>> {
  readonly unit: string;
  readonly qualifiedPath: string;
  readonly level: number;
  readonly parent?: GovnTreeNode<Terminal>;
  readonly ancestors: GovnTreeNode<Terminal>[];
  readonly children: GovnTreeNode<Terminal>[];
  readonly descendants: () => Generator<GovnTreeNode<Terminal>>;
  readonly select: (
    relative: string,
    noMatch?: (
      endIndex: number,
      parseError?: boolean,
    ) => GovnTreeNode<Terminal>,
  ) => GovnTreeNode<Terminal> | undefined;
}

export interface GovnTreeTerminalNode<Terminal> extends GovnTreeNode<Terminal> {
  readonly terminal: Terminal;
}

export interface GovnTreeRegistrationContext<Terminal> {
  readonly destination: Pick<GovnTreeNodesSupplier<Terminal>, "children">;
}

export interface GovernedTreeNodeExists<Terminal> {
  (
    prospect: string,
    siblings: GovnTreeNode<Terminal>[],
    ts: GovnTreeTerminalSupplier<Terminal>,
  ): GovnTreeNode<Terminal> | undefined;
}

export abstract class GovernedTree<
  Terminal,
  RegistrationContext extends GovnTreeRegistrationContext<Terminal>,
> {
  constructor(
    readonly pathSep = "/",
    readonly nodeExists?: GovernedTreeNodeExists<Terminal>,
  ) {
  }

  abstract units(
    ts: GovnTreeTerminalSupplier<Terminal>,
    rc: RegistrationContext,
  ): string[];

  qualifiedPath(
    unit: string,
    parent: GovnTreeNode<Terminal> | undefined,
    _rc: RegistrationContext,
    _ts: GovnTreeTerminalSupplier<Terminal>,
    _units: string[],
    _ancestors: GovnTreeNode<Terminal>[],
  ): string {
    return parent?.qualifiedPath
      ? (parent?.qualifiedPath + this.pathSep + String(unit))
      : String(unit);
  }

  *descendants(
    parent: GovnTreeNodesSupplier<Terminal>,
  ): Generator<GovnTreeNode<Terminal>> {
    for (const node of parent.children) {
      yield node;
      if (node.children.length > 0) yield* this.descendants(node);
    }
  }

  /**
   * Take the given terminal (leaf) unit instructions and create a hierarchy of
   * nodes to populate into owner
   * @param rc the registration context to customize construction of tree node
   * @param ts the instance which contains the "terminal" or leaf object
   * @param owner which of the multiple roots of our tree we want to populate
   * @param refineConstructed a function which can be used "refine" (transformed) the constructed tree node instance to make it more type-safe
   * @returns
   */
  populate(
    ts: GovnTreeTerminalSupplier<Terminal>,
    rc: RegistrationContext,
    options?: {
      readonly nodeExists?: GovernedTreeNodeExists<Terminal>;
      readonly refineConstructed?: (
        suggested: GovnTreeNode<Terminal>,
        ts: GovnTreeTerminalSupplier<Terminal>,
        rc: RegistrationContext,
      ) => GovnTreeNode<Terminal>;
    },
  ): GovnTreeNode<Terminal> | undefined {
    const nodeExists = options?.nodeExists || this.nodeExists ||
      ((prospect, siblings) => siblings.find((cn) => cn.unit == prospect));
    const units = this.units(ts, rc);
    const terminalIndex = units.length - 1;

    /**
     * Construct the tree node at the given level and place it as the last child
     * in collection.
     * @param level the "unit" level in owner's hierarchy
     * @param collection which children array to add the newly created node
     * @param ancestors the ancestors of the new node, starting at 0 for the parent and increment for each ancestor
     * @returns the newly created node
     */
    const createTreeNode = (
      level: number,
      collection: GovnTreeNode<Terminal>[],
      ancestors: GovnTreeNode<Terminal>[],
    ) => {
      // the first ancestor is the parent, second is grandparent, etc.
      const unit = units[level];
      let result = nodeExists(unit, collection, ts);
      if (!result) {
        const isTerminal = level == terminalIndex;
        const parent = ancestors.length > 0 ? ancestors[0] : undefined;
        const qualifiedPath = this.qualifiedPath(
          unit,
          parent,
          rc,
          ts,
          units,
          ancestors,
        );
        result = {
          qualifiedPath,
          level,
          parent,
          ancestors,
          unit,
          children: [],
          terminal: isTerminal ? ts.terminal : undefined,
          descendants: () => this.descendants(result!),
          select: (query, noMatch) =>
            this.selectTreeNode(result!, query, noMatch),
        };
        if (options?.refineConstructed) {
          result = options?.refineConstructed(result, ts, rc);
        }
        collection.push(result);
      }
      return result;
    };

    let treeItem: GovnTreeNode<Terminal> | undefined;
    if (units.length > 0) {
      treeItem = createTreeNode(0, rc.destination.children, []);

      const recurse = (
        level: number,
        ancestors: GovnTreeNode<Terminal>[],
      ): GovnTreeNode<Terminal> | undefined => {
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

  /**
   * Convert relative path to absolute
   * @param base the path that `relative` is relative to
   * @param relative the path relative to `base` (can be ./, ../.., etc.)
   * @returns
   */
  absolutePath(base: string, relative: string) {
    const stack = base.split("/");
    const parts = relative.split("/");
    stack.pop(); // remove current file name (or empty string)
    // (omit if "base" is the current folder without trailing slash)
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] == ".") {
        continue;
      }
      if (parts[i] == "..") {
        stack.pop();
      } else {
        stack.push(parts[i]);
      }
    }
    return stack.join("/");
  }

  selectTreeNode(
    node: GovnTreeNode<Terminal>,
    query: string,
    noMatch?: (
      endIndex: number,
      parseError?: boolean,
    ) => GovnTreeNode<Terminal>,
  ): GovnTreeNode<Terminal> | undefined {
    const path = [node, ...node.ancestors].reverse();
    let pathIndex = path.length - 1;
    let result: GovnTreeNode<Terminal> | undefined = node;
    if (pathIndex < 0) return undefined;
    const parts = query.split("/");
    const lastPartsIndex = parts.length - 1;
    for (let i = 0; i < parts.length; i++) {
      const activePart = parts[i];
      if (activePart == "." || activePart == "") {
        continue;
      }
      if (activePart == "..") {
        pathIndex--;
        result = (pathIndex >= 0 && pathIndex < path.length)
          ? path[pathIndex]
          : undefined;
      } else {
        // a subdirectory is requested
        if (result?.children) {
          const child = result.children.find((n) => n.unit == activePart);
          if (child) {
            if (i < lastPartsIndex) {
              return this.selectTreeNode(child, parts.slice(i + 1).join("/"));
            }
            return child;
          } else {
            return noMatch ? noMatch(pathIndex, true) : undefined;
          }
        } else {
          return noMatch ? noMatch(pathIndex, true) : undefined;
        }
      }
    }
    if (result) return result;
    return noMatch ? noMatch(pathIndex) : undefined;
  }

  /**
   * Walk all the nodes of the route tree until the inspector returns false
   * @param nodes The tree nodes to traverse
   * @param inspector The function to call for each node, return true to continue traversal or false to end traversal
   * @param maxLevel Stop once the level reaches this maximum
   * @returns a single node that cause traversal to end or void if all nodes traversed
   */
  *inspectNodes(
    nodes: GovnTreeNode<Terminal>[],
    inspector: (entry: GovnTreeNode<Terminal>) => boolean,
    maxLevel?: number,
  ): Generator<GovnTreeNode<Terminal>> {
    for (const node of nodes) {
      const result = inspector(node);
      if (!result) yield node;
      if (typeof maxLevel === "number" && node.level > maxLevel) continue;
      if (node.children.length > 0) {
        this.inspectNodes(node.children, inspector, maxLevel);
      }
    }
  }

  *walkNodes(
    start: GovnTreeNodesSupplier<Terminal>,
    inspector: (entry: GovnTreeNode<Terminal>) => boolean,
    maxLevel?: number,
  ): Generator<GovnTreeNode<Terminal>> {
    yield* this.inspectNodes(start.children, inspector, maxLevel);
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
    nodes: GovnTreeNodesSupplier<Terminal>,
    inspector: (entry: GovnTreeNode<Terminal>) => boolean,
    populate: GovnTreeNode<Terminal>[],
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
    root: GovnTreeNodesSupplier<Terminal>,
    inspector: (entry: GovnTreeNode<Terminal>) => boolean,
    maxLevel?: number,
  ): Iterable<GovnTreeNode<Terminal>> {
    const result: GovnTreeNode<Terminal>[] = [];
    this.flatFilterNodes(root, inspector, result, 0, maxLevel);
    return result;
  }
}
