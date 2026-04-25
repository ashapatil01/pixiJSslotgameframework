import type {
    GameConfig,
    PayLine,
    ReelStop,
    SpinResult,
    SymbolDef,
    SymbolId,
    WinLine,
} from '../types';

/**
 *This class is your fake backend server for the slot game.
 * It simulates a real server.
 * Lets you build the whole game without an actual backend
 *
 * Returns a FULLY TYPED SpinResult — no `any`. Replace this with a real
 * HTTP/WebSocket client when the backend is ready; the calling code in
 * Game.ts only depends on the Promise<SpinResult> contract.
 */
export class MockServer {
    private readonly nonScatters: readonly SymbolDef[];
    private readonly scatter: SymbolDef | undefined;

    constructor(private readonly config: GameConfig) {
        this.nonScatters = config.symbols.filter((s) => !s.isScatter);
        this.scatter = config.symbols.find((s) => s.isScatter);
    }

    async spin(bet: number): Promise<SpinResult> {
        // Simulate network latency so UX timing is realistic.
        await new Promise((r) => setTimeout(r, 120 + Math.random() * 120));

        const { count, rows } = this.config.reels;
        const stops: ReelStop[] = [];
        for (let r = 0; r < count; r += 1) {
            const col: SymbolId[] = [];
            for (let row = 0; row < rows; row += 1) {
                col.push(this.pickSymbolId(r));
            }
            stops.push(col);
        }

        const wins = this.evaluateWins(stops, bet);
        const totalWin = wins.reduce((sum, w) => sum + w.payout, 0);
        const scatterCount = this.countScatters(stops);
        const awardedFreeSpins =
            this.scatter && scatterCount >= this.config.freeSpins.scatterTriggerCount
                ? this.config.freeSpins.awardedSpins
                : 0;


        console.debug('MockServer.spin result:', { stops, wins, totalWin, scatterCount, awardedFreeSpins });

        return { stops, wins, totalWin, scatterCount, awardedFreeSpins };
    }

    private pickSymbolId(reelIndex: number): SymbolId {
        // ~6% scatter chance per cell, slightly higher on middle reels for drama.
        const scatterBoost = reelIndex === 2 ? 0.04 : 0;
        if (this.scatter && Math.random() < 0.06 + scatterBoost) {
            return this.scatter.id;
        }
        // Bias toward lower-paying symbols so wins feel earned.
        const weights = this.nonScatters.map((s) => 1 / Math.max(1, s.payout));  // Inverse of payout is a simple way to weight toward common symbols.
        const total = weights.reduce((a, b) => a + b, 0);                // Calculate total weight.
        let roll = Math.random() * total;                                // Roll a random number in the range of total weight.
        for (let i = 0; i < this.nonScatters.length; i += 1) {
            roll -= weights[i]!;
            if (roll <= 0) return this.nonScatters[i]!.id;
        }
        throw new Error("Unreachable: failed to pick symbol");   // throw an error if fails to pick a symbol.
    }

    private evaluateWins(stops: readonly ReelStop[], bet: number): WinLine[] {
        const wins: WinLine[] = [];
        const payoutMap = new Map<SymbolId, number>(
            this.config.symbols.map((s) => [s.id, s.payout] as const),
        );

        this.config.payLines.forEach((line: PayLine, lineIndex) => {
            const first = stops[0]?.[line[0]!];
            if (!first) return;
            const def = this.config.symbols.find((s) => s.id === first);
            if (!def || def.isScatter) return;

            let matchCount = 1;
            const positions: Array<readonly [number, number]> = [[0, line[0]!]];
            for (let reel = 1; reel < line.length; reel += 1) {
                const sym = stops[reel]?.[line[reel]!];
                if (sym !== first) break;
                matchCount += 1;
                positions.push([reel, line[reel]!]);
            }
            if (matchCount >= 3) {
                const base = payoutMap.get(first) ?? 0;
                // Simple "matchCount^2 * base * bet/10" curve keeps payouts balanced.
                const payout = Math.round(((matchCount * matchCount) / 9) * base * bet);
                wins.push({ lineIndex, symbolId: first, matchCount, payout, positions });
            }
        });
        return wins;
    }

    private countScatters(stops: readonly ReelStop[]): number {
        if (!this.scatter) return 0;
        let c = 0;
        for (const col of stops) for (const s of col) if (s === this.scatter.id) c += 1;
        return c;
    }
}
