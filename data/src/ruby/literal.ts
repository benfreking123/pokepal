import { loadPrism } from "@ruby/prism";

export type RubyValue = null | boolean | number | string | RubyValue[] | { [key: string]: RubyValue };

type PrismNode = { constructor: { name: string }; location: { startOffset: number; length: number }; [k: string]: any };

let parserPromise: ReturnType<typeof loadPrism> | undefined;
const decoder = new TextDecoder();

export async function readRubyConstants(source: Uint8Array | string): Promise<{ constants: Record<string, RubyValue> }> {
  const bytes = typeof source === "string" ? new TextEncoder().encode(source) : source;
  parserPromise ??= loadPrism();
  const parse = await parserPromise;
  const result = parse(bytes);
  if (result.errors.length > 0) throw new Error(`Ruby parse error: ${result.errors[0].message}`);

  const slice = (n: PrismNode) => decoder.decode(bytes.subarray(n.location.startOffset, n.location.startOffset + n.location.length));
  const text = (u: { value: string } | string) => (typeof u === "string" ? u : u.value);

  const constPath = (n: PrismNode): string =>
    n.constructor.name === "ConstantReadNode" ? n.name : `${n.parent ? constPath(n.parent) : ""}::${n.name}`.replace(/^::/, "");

  const keyOf = (n: PrismNode): string => {
    const v = toValue(n);
    return typeof v === "string" || typeof v === "number" ? String(v) : slice(n);
  };

  const toValue = (n: PrismNode): RubyValue => {
    switch (n.constructor.name) {
      case "HashNode":
      case "KeywordHashNode": {
        const out: Record<string, RubyValue> = {};
        for (const el of n.elements) {
          if (el.constructor.name !== "AssocNode") return { $ruby: slice(n) };
          out[keyOf(el.key)] = toValue(el.value);
        }
        return out;
      }
      case "ArrayNode":
        return n.elements.map(toValue);
      case "SymbolNode":
      case "StringNode":
        return text(n.unescaped);
      case "IntegerNode":
      case "FloatNode":
        return Number(n.value);
      case "NilNode":
        return null;
      case "TrueNode":
        return true;
      case "FalseNode":
        return false;
      case "ConstantReadNode":
      case "ConstantPathNode":
        return { $const: constPath(n) };
      default:
        return { $ruby: slice(n) };
    }
  };

  const constants: Record<string, RubyValue> = {};
  const visit = (stmts: PrismNode | null) => {
    for (const s of stmts?.body ?? []) {
      const kind = s.constructor.name;
      if (kind === "ConstantWriteNode") constants[s.name] = toValue(s.value);
      else if (kind === "ModuleNode" || kind === "ClassNode") visit(s.body);
    }
  };
  visit(result.value.statements);
  return { constants };
}
