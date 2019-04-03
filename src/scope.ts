export class ScopeDrawBatch {
    protected drawStack: Array<() => void> = [];
    protected draw: () => void;
    protected stopCbk: () => void = null;

    constructor({ fps }: { fps?: number } = {}) {
        if (fps) {
            this.draw = () => {
                this.drawStack.map(f => f());
                const handle = window.setTimeout(() => this.draw(), 1000 / fps);
                this.stopCbk = () => clearTimeout(handle);
            };
        } else {
            this.draw = () => {
                this.drawStack.map(f => f());
                const handle = window.requestAnimationFrame(() => this.draw());
                this.stopCbk = () => cancelAnimationFrame(handle);
            };
        }
    }

    isDrawing(): boolean {
        return this.stopCbk !== null;
    }

    toggle() {
        if (this.isDrawing()) {
            this.stop();
        } else {
            this.start();
        }
    }

    add(f: () => void) {
        this.drawStack.push(f);
    }

    start() {
        this.draw();
    }

    stop() {
        this.stopCbk();
        this.stopCbk = null;
    }
}

export class ScopeRenderer {
    protected canvas: HTMLCanvasElement;
    protected ctx: CanvasRenderingContext2D;
    protected width: number;
    protected height: number;
    protected yPadding: number;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
        this.yPadding = 10;
    }

    draw(sample: ScopeSample) {
        const xPxPerTimeSample = Math.ceil(this.width / sample.data.length) + 2;

        // Background
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // x axis
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = '#555';
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.height / 2);
        this.ctx.lineTo(this.width, this.height / 2);
        this.ctx.stroke();

        this.ctx.lineWidth = 4;
        this.ctx.strokeStyle = 'red';
        this.ctx.beginPath();

        let sampleIdx = sample.triggerIndex; // display wave with first value aligned at magnitude 0

        for (
            let x = 0;
            sampleIdx < sample.data.length && x < this.width;
            sampleIdx++, x += xPxPerTimeSample
        ) {
            // 0 => height, 128 => height/2, 255 => 0
            const magnitude = mapNumber(
                sample.data[sampleIdx],
                0,
                255,
                this.height - this.yPadding,
                0 + this.yPadding
            );
            this.ctx.lineTo(x, magnitude);
        }

        this.ctx.stroke();

        return this;
    }
}

interface ScopeSample {
    data: Uint8Array;
    triggerIndex: number;
}

// TODO: auto leveling
export class ScopeSampler {
    protected ac: AudioContext;
    protected input: GainNode;
    protected analyser: AnalyserNode;
    protected freqData: Uint8Array;
    protected rAFHandle: number;

    constructor(ac: AudioContext) {
        this.ac = ac;
        this.input = ac.createGain();
        this.analyser = ac.createAnalyser();
        // fftSize = 1024 => frequencyBinCount = 512; 12ms of data per refresh at 44.1Khz (1024/44100)
        this.analyser.fftSize = 1024;
        this.input.connect(this.analyser);
        this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    }

    triggerIndex(data: Array<number>): number {
        for (let i = 1; i < data.length; i++) {
            if (data[i] >= 128 && data[i - 1] < 128) {
                return i - 1;
            }
        }

        return 0;
    }

    sample(): ScopeSample {
        this.analyser.getByteTimeDomainData(this.freqData);
        let triggerIndex = this.triggerIndex((this
            .freqData as unknown) as number[]);
        return { data: this.freqData, triggerIndex };
    }

    getInput(): GainNode {
        return this.input;
    }
}

function mapNumber(
    num: number,
    in_min: number,
    in_max: number,
    out_min: number,
    out_max: number
): number {
    return ((num - in_min) * (out_max - out_min)) / (in_max - in_min) + out_min;
}
