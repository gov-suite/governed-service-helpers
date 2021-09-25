import * as ta from "https://deno.land/std@0.108.0/testing/asserts.ts";
import * as mod from "./govn-tree.ts";

export interface Terminal {
  readonly path: string;
}

// deno-lint-ignore no-empty-interface
export interface TestTreeContext
  extends mod.GovnTreeRegistrationContext<Terminal> {
}

const home: Terminal = {
  path: "home",
};

const root2: Terminal = {
  path: "root2",
};

const module1: Terminal = {
  path: "home/module1",
};

const m1Component1: Terminal = {
  path: "home/module1/component1",
};

const module2: Terminal = {
  path: "home/module2",
};

const m2Component1: Terminal = {
  path: "home/module2/component1",
};

const m2Component1Service1: Terminal = {
  path: "home/module2/component1/service1",
};

export class TestTree extends mod.GovernedTree<Terminal, TestTreeContext> {
  /**
   * Parse the hierarchical "units" which comprise our tree node
   * @param rc the walker which tells us about our context
   * @param ts where we get the fs.WalkEntry from
   * @param _owner unused, but supplies where the newly created node will go
   * @returns the "units" that will comprise the path in the tree
   */
  units(
    ts: mod.GovnTreeTerminalSupplier<Terminal>,
    _rc: TestTreeContext,
  ): string[] {
    return ts.terminal.path.split(this.pathSep);
  }

  prime(): mod.GovnTreeNodesSupplier<Terminal> {
    const result: mod.GovnTreeNodesSupplier<Terminal> = {
      children: [],
      descendants: () => this.descendants(result),
    };
    return result;
  }
}

Deno.test(`tree nodes`, () => {
  const tree = new TestTree();
  const destination = tree.prime();
  const rc: TestTreeContext = { destination };
  tree.populate({ terminal: home }, rc);
  tree.populate({ terminal: root2 }, rc);
  tree.populate({ terminal: module1 }, rc);
  tree.populate({ terminal: m1Component1 }, rc);
  tree.populate({ terminal: module2 }, rc);
  tree.populate({ terminal: m2Component1 }, rc);
  const finalNode = tree.populate({ terminal: m2Component1Service1 }, rc);

  const nodes = Array.from(tree.filterNodes(destination, () => true));
  ta.assertEquals(nodes.length, 7);
  ta.assertEquals(
    nodes.map((n) => [n.qualifiedPath, n.level]),
    [
      ["home", 0],
      ["root2", 0],
      ["home/module1", 1],
      ["home/module2", 1],
      ["home/module1/component1", 2],
      ["home/module2/component1", 2],
      ["home/module2/component1/service1", 3],
    ],
  );
  ta.assertEquals(finalNode?.parent?.qualifiedPath, "home/module2/component1");
  ta.assertEquals(
    finalNode?.ancestors.map((
      n,
    ) => [
      n.qualifiedPath,
      n.level,
    ]),
    [
      ["home/module2/component1", 2],
      ["home/module2", 1],
      ["home", 0],
    ],
  );
});

Deno.test(`tree nodes selector`, () => {
  const tree = new TestTree();
  const destination = tree.prime();
  const rc: TestTreeContext = { destination };
  const homeNode = tree.populate({ terminal: home }, rc);
  tree.populate({ terminal: root2 }, rc);
  tree.populate({ terminal: module1 }, rc);
  tree.populate({ terminal: m1Component1 }, rc);
  tree.populate({ terminal: module2 }, rc);
  const m1c1Node = tree.populate({ terminal: m1Component1 }, rc);
  const terminal = tree.populate({ terminal: m2Component1Service1 }, rc);

  ta.assert(terminal);
  ta.assertEquals(terminal.select(".")?.unit, "service1");
  ta.assertEquals(terminal.select("./")?.unit, "service1");
  ta.assertEquals(terminal.select("..")?.unit, "component1");
  ta.assertEquals(terminal.select("../")?.unit, "component1");
  ta.assertEquals(terminal.select("../..")?.unit, "module2");
  ta.assertEquals(terminal.select("../..")?.unit, "module2");
  ta.assertEquals(terminal.select("../../..")?.unit, "home");
  ta.assertEquals(terminal.select("../../../../.."), undefined);
  ta.assertEquals(terminal.select("bad"), undefined);
  ta.assertEquals(terminal.select("./bad"), undefined);
  ta.assertEquals(terminal.select("../bad"), undefined);

  ta.assert(homeNode);
  ta.assertEquals(homeNode.qualifiedPath, "home");
  ta.assertEquals(
    // module2 is a sibling of module1 so this select should fail
    homeNode.select("module1")?.unit,
    "module1",
  );
  ta.assertEquals(
    // module2 is a sibling of module1 so this select should fail
    homeNode.select("module1/component1")?.unit,
    "component1",
  );

  ta.assert(m1c1Node);
  ta.assertEquals(m1c1Node.qualifiedPath, "home/module1/component1");
  ta.assertEquals(
    // module2 is a sibling of module1 so this select should fail
    m1c1Node.select("../module2/component1/service1")?.unit,
    undefined,
  );
  ta.assertEquals(
    // module2 is a sibling of module1 so this select should succeed
    m1c1Node.select("../../module2/component1/service1")?.qualifiedPath,
    terminal.qualifiedPath,
  );
});
