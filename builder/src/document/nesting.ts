// The nesting rule: which block types the page and each block type may
// hold. It is the schema's, read when the editor is built
// (../../build/nesting.ts): page > section > column > widget today, and
// whatever the schema says tomorrow. Insert, paste, move and drag and drop
// all take their destinations from here.
import { CHILD_TYPES } from "virtual:block-document-nesting";
import { BLOCK_TYPES, type BlockType } from "../shared/document.ts";

export type ContainerType = BlockType | "page";

const isBlockType = (value: string): value is BlockType => (BLOCK_TYPES as readonly string[]).includes(value);

// The table, checked against the types the editor knows: a schema with a
// block type document.ts has not followed fails here, when the editor
// loads, not later on a drop.
const TABLE: ReadonlyMap<ContainerType, readonly BlockType[]> = (() => {
  const table = new Map<ContainerType, readonly BlockType[]>();
  for (const [container, types] of Object.entries(CHILD_TYPES)) {
    if (container !== "page" && !isBlockType(container)) throw new Error(`the nesting rule names ${container}, which the editor does not know`);
    const known = types.filter(isBlockType);
    if (known.length !== types.length) throw new Error(`the nesting rule lets ${container} hold a type the editor does not know`);
    table.set(container, known);
  }
  for (const type of ["page", ...BLOCK_TYPES] as const) {
    if (!table.has(type)) throw new Error(`the nesting rule says nothing about ${type}`);
  }
  return table;
})();

// The block types a container may hold, in the schema's order.
export function childTypes(container: ContainerType): readonly BlockType[] {
  return TABLE.get(container) ?? [];
}

export function canContain(container: ContainerType, child: BlockType): boolean {
  return childTypes(container).includes(child);
}

// The containers a block type may go into.
export function containersFor(type: BlockType): readonly ContainerType[] {
  return [...TABLE].filter(([, types]) => types.includes(type)).map(([container]) => container);
}

// Whether blocks of this type hold others at all (a widget does not).
export function isContainer(type: ContainerType): boolean {
  return childTypes(type).length > 0;
}
