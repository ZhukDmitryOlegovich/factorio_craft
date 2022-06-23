/* eslint-disable no-throw-literal */
export type Term = { type: 'term', value: string };
export type Nterm = { type: 'nterm', value: string };

export type Rule = (Term | Nterm)[]
export type Rules = Rule[]

export type Language = {
	axiom: string,
	nterms: Record<string, Rules>,
}

export const term = (value: string): Term => ({ type: 'term', value });
export const nterm = (value: string): Nterm => ({ type: 'nterm', value });

type Position = { line: number, pos: number, abs: number };
export type Lexema<K, V> = { type: K, value: V };
type SmartLexems<L extends { type: string }> = L & { from: Position, to: Position };
type InputLexicalAnalyzer<L> = {
	reg: RegExp,
	rules: Record<string, undefined | ((_: string) => L | null)>,
	def?: (_: string) => L | null,
};

export const lexicalAnalyzer = <L extends { type: string }>({
	reg,
	rules,
	def = () => null,
}: InputLexicalAnalyzer<L>) => (s: string) => ({
		* [Symbol.iterator](): Generator<SmartLexems<L>> {
			let fromLine = 1;
			let fromPos = 1;
			let fromAbs = 0;
			let toLine = 1;
			let toPos = 1;
			let toAbs = 0;

			const buildToken = (l: L): SmartLexems<L> => ({
				...l,
				from: { line: fromLine, pos: fromPos, abs: fromAbs },
				to: { line: toLine, pos: toPos, abs: toAbs },
			});

			for (let e = reg.exec(s); e?.groups; e = reg.exec(s)) {
				const groups = Object.entries(e.groups).filter(([, value]) => value);
				if (groups.length !== 1 || e[0].length === 0 || e.groups.error) {
					throw {
						message: 'match not one group or value zero or error',
						groups,
						from: { line: fromLine, pos: fromPos, abs: fromAbs },
						to: { line: toLine, pos: toPos, abs: toAbs },
					};
				}

				fromLine = toLine;
				fromPos = toPos;
				fromAbs = toAbs;

				s = s.slice(e.index + e[0].length);
				toAbs += e[0].length;
				const split = e[0].split('\n');
				if (split.length === 1) {
					toPos += e[0].length;
				} else {
					toLine += split.length - 1;
					toPos = split[split.length - 1].length + 1;
				}

				const [[key, value]] = groups;
				const res = rules[key]?.(value) ?? def(value);
				if (res !== null) {
					yield buildToken(res);
				}
			}
		},
	});
