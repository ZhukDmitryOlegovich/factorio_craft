import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import graphviz from 'graphviz';
import { Drob, drob } from './drob';

async function downloadImage(url: string, prevPath = 'buf') {
	const dir = path.resolve('.', prevPath);

	fs.mkdirSync(dir, { recursive: true });

	const absPath = path.resolve(dir, url.split('/').at(-1) || '');

	if (fs.existsSync(absPath)) return Promise.resolve();

	const writer = fs.createWriteStream(absPath);

	const response = await axios.get(url, { responseType: 'stream' });

	response.data.pipe(writer);

	return new Promise((resolve, reject) => {
		writer.on('finish', resolve);
		writer.on('error', () => {
			try {
				fs.unlinkSync(absPath);
				// eslint-disable-next-line no-empty
			} catch { }
			reject();
		});
	});
}

// /* global HTMLElement */
/* global Element */
/* global HTMLLinkElement */

const nameProps = ['name', 'cost'] as const;

const pathProps: Record<typeof nameProps[number], [number, number, number]> = {
	name: [0, 0, 1],
	cost: [1, 1, 0],
};

const parseProps = {
	name: (e: Element) => (e.textContent ?? '').trim(),
	cost: (e: Element) => Array.from(e.children).map(
		(e2) => ({ url: (e2.children[0] as HTMLLinkElement)?.href, count: +(e2.textContent?.trim() ?? 'NaN') }),
	).filter(({ url }) => url),
};

const alias: Record<string, string | undefined> = {
	Rail: 'Straight_rail',
};

const skip = [
	'Uranium_processing',
	'Nuclear_fuel',
	'Uranium-235',
	'Uranium-238',
	'Kovarex-Anreicherungsprozess',
	'Kernbrennstoff',
	'Used_up_uranium_fuel_cell',
];

class FactorioElement {
	// eslint-disable-next-line no-useless-constructor
	constructor(
		readonly props: {
			readonly name: string,
			readonly url: string,
		},
		readonly create?: {
			readonly cost: { url: string, count: number; }[],
			readonly time: number,
			readonly count: number,
		},
		// eslint-disable-next-line no-empty-function
	) { }

	get id() {
		const id = this.props.url.split('/')[3];
		return alias[id] ?? id;
	}

	static getIdByUrl(url: string) {
		const id = url.split('/')[3];
		return alias[id] ?? id;
	}

	get img() {
		const { id } = this;
		return `https://wiki.factorio.com/images/${id}.png`;
	}

	static async create(url: string) {
		const { data } = await axios.get<string>(url);

		const { window } = new JSDOM(data, { url });

		const infobox = window.document.querySelector('.infobox');

		if (!infobox || skip.includes(FactorioElement.getIdByUrl(url))) {
			return new FactorioElement({
				name: FactorioElement.getIdByUrl(url),
				url,
			}, undefined);
		}

		const allInfo = Array.from(infobox.getElementsByTagName('tbody'))
			.map((e1) => Array.from(e1.children)
				.map((e2) => Array.from(e2.children)));

		const { name, cost } = Object.fromEntries(nameProps.map((nameProp) => [
			nameProp,
			parseProps[nameProp](
				allInfo[pathProps[nameProp][0]][pathProps[nameProp][1]][pathProps[nameProp][2]],
			),
		])) as { [K in typeof nameProps[number]]: ReturnType<typeof parseProps[K]> };

		return new FactorioElement({
			name,
			url,
		}, cost.length === 0 ? undefined : {
			cost: cost.slice(1, -1),
			time: cost[0].count,
			count: cost.at(-1)?.count || 0,
		});
	}
}

class FactorioLib {
	readonly lib: Map<string, FactorioElement> = new Map();

	// eslint-disable-next-line no-useless-constructor
	constructor(
		readonly prevPath = 'buf',
		// eslint-disable-next-line no-empty-function
	) { }

	async init() {
		await downloadImage('https://wiki.factorio.com/images/Explosives.png');
		await Promise.all([
			'Stone_furnace',
			'Steel_furnace',
			'Electric_furnace',
			'Assembling_machine_1',
			'Assembling_machine_2',
			'Assembling_machine_3',
		].map((name) => downloadImage(`https://wiki.factorio.com/images/thumb/${name}.png/32px-${name}.png`, this.prevPath)));
	}

	async addElementWithChildren(newURL: string): Promise<void> {
		if (this.lib.has(newURL)) return;

		const elem = await FactorioElement.create(newURL);

		this.lib.set(newURL, elem);

		const cost = elem.create?.cost;
		if (!cost) {
			await downloadImage(elem.img, this.prevPath);
			return;
		}

		await Promise.all([
			downloadImage(elem.img, this.prevPath),
			...cost.map(({ url }) => this.addElementWithChildren(url)),
		]);
	}

	makeGraphvis(url: string): graphviz.Graph | null {
		const elem = this.lib.get(url);
		if (!elem) throw new Error('"url" undefined');
		if (!elem.create?.cost.length) return null;

		const g = graphviz.digraph('G');
		g.addNode(elem.id);

		const base = g.addCluster('cluster');
		base.set('style', 'filled');
		base.set('color', 'lightgrey');

		const cost: Record<string, Drob> = {};

		const lambda = (e: FactorioElement, count: Drob) => {
			cost[e.props.url] = (cost[e.props.url] ??= drob(0)).add(count);

			if (!e.create) return;
			const { create: { count: count3 } } = e;

			e.create.cost.forEach(({ url: url2, count: count2 }) => {
				lambda(this.lib.get(url2)!, count.mul(drob(count2, count3)));
			});
		};

		lambda(elem, drob(1));

		this.addNodeWithChildren(g, elem, cost);

		return g;
	}

	private addNodeWithChildren(g: graphviz.Graph, {
		id, create, props: { url: url2 },
	}: FactorioElement, costs: Record<string, Drob>) {
		const node = (create?.cost.length ? g : g.getCluster('cluster')).getNode(id);

		if (!node) {
			// verboseDir(g);
			verbose(url2);
			throw new Error('not found node');
		}

		const img = path.join('.', this.prevPath, `${id}.png`);
		let label2 = '';
		if (create?.time) {
			const time = drob(create.time * 10, 10);
			const cost = costs[url2].mul(time).divN(create.count);
			label2 = `
			<tr>
				<td rowspan="2"><img src="${img}" /></td>
				<td>${create.count}</td><td>${costs[url2].toHTML()}</td>
				${id.endsWith('_plate')
		? `
				<td>${cost.divN(1).toHTML()}</td>
				<td colspan="2">${cost.divN(2).toHTML()}</td>`
		: `
				<td>${cost.divN(0.5).toHTML()}</td>
				<td>${cost.divN(0.75).toHTML()}</td>
				<td>${cost.divN(1.25).toHTML()}</td>`}
			</tr>
			<tr>
				<td colspan="2">${time.toHTML()}</td>
				${id.endsWith('_plate')
		? `
				<td><img src="buf/32px-Stone_furnace.png" /></td>
				<td><img src="buf/32px-Steel_furnace.png" /></td>
				<td><img src="buf/32px-Electric_furnace.png" /></td>`
		: `
				<td><img src="buf/32px-Assembling_machine_1.png" /></td>
				<td><img src="buf/32px-Assembling_machine_2.png" /></td>
				<td><img src="buf/32px-Assembling_machine_3.png" /></td>`}
			</tr>`;
		} else {
			label2 = `<tr><td><img src="${img}" /></td><td>${costs[url2].toHTML()}</td></tr>`;
		}
		node.set('label', `!<table cellspacing="0" border="0" cellborder="1">
		${label2}
		</table>`.replace(/[\n\t]+/g, ''));
		node.set('shape', 'plain');

		create?.cost.forEach(({ url, count }) => {
			const nextElem = this.lib.get(url);
			if (!nextElem) throw new Error('url undefined');
			const label = `!<table cellspacing="0" border="0" cellborder="0" bgcolor="white">
				<tr><td>${count}:${costs[url2].mulN(count).toHTML()}</td></tr>
			</table>`.replace(/[\n\t]+/g, '');

			const nextNode = g.getNode(nextElem.id) as graphviz.Node | undefined;
			if (nextNode) {
				g.addEdge(node, nextNode, { label });
			} else {
				g.addEdge(
					node,
					(nextElem.create?.cost.length ? g : g.getCluster('cluster'))
						.addNode(nextElem.id),
					{ label },
				);
				this.addNodeWithChildren(g, nextElem, costs);
			}
		});
	}
}

const factorioLib = new FactorioLib();

let readme = `
\`\`\`bash
npx ts-node .
\`\`\`
`;

const verbose = (...message: any[]) => {
	if (Number(process.env.VERBOSE)) {
		console.log(...message);
	}
};

const verboseDir = (message: any) => {
	if (Number(process.env.VERBOSE)) {
		console.dir(message, { depth: null });
	}
};

const calcResult = async (url: string) => {
	await factorioLib.addElementWithChildren(url);
	verboseDir(factorioLib);
	const g = factorioLib.makeGraphvis(url);
	if (!g) return;
	verbose(g.to_dot());
	const id = FactorioElement.getIdByUrl(url) || 'test';
	const filename = `sp/${id}.png`;
	g.output(
		{ type: 'png', N: { shape: 'record' } },
		filename,
		console.error,
	);
};

const getAllUrls = async () => {
	const url = 'https://wiki.factorio.com/Main_Page';

	const { data } = await axios.get<string>(url);

	const { window } = new JSDOM(data, { url });

	// eslint-disable-next-line no-undef
	return Array.from(window.document.querySelectorAll('.factorio-icon')).map((e) => (e.firstChild as HTMLAnchorElement).href);
};

const getAllNeedUrls = async () => (await getAllUrls()).filter((url) => {
	const id = FactorioElement.getIdByUrl(url) || 'test';
	const filename = `sp/${id}.png`;
	readme += `### ${id.replace(/_/g, ' ')}\n[wiki](${url})\n![${id}](${filename})\n---\n`;
	return !fs.existsSync(filename);
});

(async () => {
	console.time('all');
	console.time('getAllUrls');
	const allURL = await getAllNeedUrls();
	console.timeEnd('getAllUrls');
	console.time('init');
	await factorioLib.init();
	console.timeEnd('init');
	let i = 0;
	for (const url of allURL) {
		const timeMark = `(${++i}/${allURL.length}) ${url}`;
		console.time(timeMark);
		try {
			// eslint-disable-next-line no-await-in-loop
			await calcResult(url);
		} catch (error) {
			console.error('ERR:', url);
			console.dir(factorioLib.lib.get(url), { depth: null });
			throw error;
		}
		console.timeEnd(timeMark);
	}
	console.time('readme');
	fs.writeFileSync('README.md', readme);
	console.timeEnd('readme');
	console.timeEnd('all');
})();
