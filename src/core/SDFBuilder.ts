import { CellType } from './fluid.js';

export class SDFBuilder {
  sdf: Float32Array;

  constructor(
    private cellTypeArray: Uint32Array,
    private numX: number,
    private numY: number
  ) { 
    this.sdf = this.buildSDF();
  }

  private buildSDF(): Float32Array {
    return this.buildSDFByLines();
  }

  // Exact SDF by lines. Good for sstraight borders.
  // Assumes that there is at least 1 cell width boundary at the border.

  private buildSDFByLines(): Float32Array {
    const numCells = this.numX * this.numY;
    const sdf = new Float32Array(numCells);

    const horLineArray = this.getHorizontalLines();
    const verLineArray = this.getVerticalLines();

    for (let idx = 0, j = 0; j < this.numY; ++j) {
      for (let i = 0; i < this.numX; ++i, ++idx) {
        const x = i + 0.5;
        const y = j + 0.5;
        let minDistSqr = Number.MAX_VALUE;

        for (const horLine of horLineArray) {
          const distSqr = distSqrPointToHorizontalLine(x, y, horLine);
          if (distSqr < minDistSqr) {
            minDistSqr = distSqr;
          }
        }

        for (const verLine of verLineArray) {
          const distSqr = distSqrPointToVerticalLine(x, y, verLine);
          if (distSqr < minDistSqr) {
            minDistSqr = distSqr;
          }
        }

        let dist = Math.sqrt(minDistSqr);
        if (this.cellTypeArray[idx] != CellType.Fluid) {
          dist = -dist;
        }
        sdf[idx] = dist;
      }
    }

    return sdf;
  }

  private getHorizontalLines(): Array<HorizontalLine> {
    let horLineArray = new Array<HorizontalLine>;

    let isLineStarted = false;
    let startX: number;
    for (let j = 1; j < this.numY; ++j) {
      for (let i = 1; i < this.numX; ++i) {
        let numFluidVer = 0;
        numFluidVer += this.oneIfFluidCell(i, j - 1);
        numFluidVer += this.oneIfFluidCell(i, j);

        const isBoundaryVer = (numFluidVer == 1);
        if (isBoundaryVer && !isLineStarted) {
          isLineStarted = true;
          startX = i;
        }
        else if (!isBoundaryVer && isLineStarted) {
          isLineStarted = false;
          const stopX = i;

          const horLine: HorizontalLine = { y: j, leftX: startX!, rightX: stopX };
          horLineArray.push(horLine);
        }
      }
    }

    return horLineArray;
  }

  private getVerticalLines(): Array<VerticalLine> {
    let verLineArray = new Array<VerticalLine>;

    let isLineStarted = false;
    let startY: number;
    for (let i = 1; i < this.numX; ++i) {
      for (let j = 1; j < this.numY; ++j) {

        let numFluidHor = 0;
        numFluidHor += this.oneIfFluidCell(i - 1, j);
        numFluidHor += this.oneIfFluidCell(i, j);

        const isBoundaryHor = (numFluidHor == 1);
        if (isBoundaryHor && !isLineStarted) {
          isLineStarted = true;
          startY = j;
        }
        else if (!isBoundaryHor && isLineStarted) {
          isLineStarted = false;
          const stopY = j;

          const verLine: VerticalLine = { x: i, bottomY: startY!, topY: stopY };
          verLineArray.push(verLine);
        }
      }
    }

    return verLineArray;
  }


  private oneIfFluidCell(i: number, j: number): number {
    return this.cellTypeArray[this.cellIndex(i, j)] == CellType.Fluid ? 1 : 0;
  }

  private cellIndex(i: number, j: number): number {
    return j * this.numX + i;
  }
}

type HorizontalLine = {
  y: number;
  leftX: number,
  rightX: number;
};

type VerticalLine = {
  x: number;
  bottomY: number;
  topY: number;
};

function distSqrPointToHorizontalLine(x: number, y: number, horLine: HorizontalLine): number {
  const dy = horLine.y - y;

  let dx = 0.0;
  if (x < horLine.leftX) {
    dx = horLine.leftX - x;
  }
  else if (x > horLine.rightX) {
    dx = horLine.rightX - x;
  }

  return dx * dx + dy * dy;
}

function distSqrPointToVerticalLine(x: number, y: number, verLine: VerticalLine): number {
  const dx = verLine.x - x;

  let dy = 0.0;
  if (y < verLine.bottomY) {
    dy = verLine.bottomY - y;
  }
  else if (y > verLine.topY) {
    dy = verLine.topY - y;
  }

  return dx * dx + dy * dy;
}

