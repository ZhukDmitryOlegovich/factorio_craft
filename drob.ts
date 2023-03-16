export const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

export class Drob {
	constructor(
		public readonly a: number,
		public readonly b = 1,
	) {
		const sign = Math.sign(this.a) * Math.sign(this.b);
		this.a = Math.abs(this.a);
		this.b = Math.abs(this.b);
		const g = gcd(this.a, this.b);
		this.a /= g;
		this.a *= sign;
		this.b /= g;
	}

	add(other: Drob) { return new Drob(this.a * other.b + this.b * other.a, this.b * other.b); }

	mul(other: Drob) { return new Drob(this.a * other.a, this.b * other.b); }

	mulN(n: number) { return new Drob(this.a * n, this.b); }

	divN(n: number) { return new Drob(this.a, this.b * n); }

	toHTML(f = true) {
		if (this.b === 1) return `${this.a}`;
		return f
			? `${(this.a - (this.a % this.b)) / this.b || ''}<sup>${this.a % this.b}</sup>&frasl;<sub>${this.b}</sub>`
			: `<sup>${this.a}</sup>&frasl;<sub>${this.b}</sub>`;
	}

	toString() {
		return this.b === 1 ? `${this.a}` : `${this.a}/${this.b}`;
	}
}

export const drob = (a: number, b?: number) => new Drob(a, b);
