import { CellType } from './fluid.js';
// For simWidth, simHeight
import { config } from '../config.js';
export function allocateIC(numX, numY) {
    const numCells = numX * numY;
    return {
        numX: numX,
        numY: numY,
        u: new Float32Array(numCells),
        v: new Float32Array(numCells),
        //p: new Float32Array(numCells),
        // For convenience, force horizontal components are given at u positions (centers of vertical cells),
        // and forve vertical components are gives at v positions (centers of horizontal cells).
        // So there is no point at which the exact value of force is known.
        fu: new Float32Array(numCells),
        fv: new Float32Array(numCells),
        // Boundary information
        b: new Uint32Array(numCells),
        m: new Float32Array(numCells),
        // Emission.
        // For inflow cells it's the (normal) velocity on their edges.
        // For fluid cells it's the density change velocity at this cell.
        e: new Float32Array(numCells),
    };
}
function isIndexOOB(i, j) {
    return (i < 0 || i >= config.numX ||
        j < 0 || j >= config.numY);
}
function cellIndex(x, y) {
    // For debug only.
    if (isIndexOOB(x, y)) {
        throw new Error(`Index ${x}, ${y} is out of bounds`);
    }
    return y * config.numX + x;
}
// Auxiliary function
function discreteToNormalized(ix, iy) {
    const x = ix / (config.numX - 1) * 2 - 1;
    const y = iy / (config.numY - 1) * 2 - 1;
    return [x, y];
}
// Initial conditions
// All border cells must be not fluid -- there must be a border.
// I don't want to bother with the fact that due to staggered grid velocity arrays must be 1 item bigger than density/pressure/etc arrays.
// So let's just assume that at the right (max X) and top (maxY) there are (1 cell width) strips of any non fluid cells.
// It'd be enough to velocity extrapolation work correctly. And to not bother about this (completely internal) asymmetry,
// let's just assume that 2 width border cells are not fluid.
const minBorderThickness = 2;
function setBorder(ic, type, thickness = minBorderThickness) {
    // Bottom and top borders
    for (let margin = 0; margin < thickness; ++margin) {
        for (let x = 0; x < config.numX; ++x) {
            ic.b[cellIndex(x, margin)] = type;
            ic.b[cellIndex(x, config.numY - 1 - margin)] = type;
        }
        // Left and right borders
        for (let y = 0; y < config.numY; ++y) {
            ic.b[cellIndex(margin, y)] = type;
            ic.b[cellIndex(config.numX - 1 - margin, y)] = type;
        }
    }
}
export function emptyTank(borderThickness = minBorderThickness) {
    const ic = allocateIC(config.numX, config.numY);
    ic.b.fill(CellType.Fluid);
    setBorder(ic, CellType.SolidFreeSlip, borderThickness);
    ic.u.fill(0.0);
    ic.v.fill(0.0);
    //ic.p.fill(0.0);
    ic.fu.fill(0.0);
    ic.fv.fill(0.0);
    ic.m.fill(0.0);
    ic.e.fill(0.0);
    return ic;
}
export function blowInTank() {
    const ic = emptyTank();
    const solid = CellType.SolidFreeSlip;
    for (let i = 0, yi = 0; yi < config.numY; ++yi) {
        for (let xi = 0; xi < config.numX; ++xi, ++i) {
            const [x, y] = discreteToNormalized(xi, yi);
            if ((-0.75 <= x && x <= -0.5 && -0.125 <= y && y <= 0.125)
                || (0.0 <= x && x <= 0.5 && -0.125 <= y && y <= 0.125)
                || (0.2 <= x && x <= 0.3 && -0.5 <= y && y <= 0.5)) {
                ic.b[i] = solid;
            }
        }
    }
    // Force field
    for (let i = 0, yi = 0; yi < config.numY; ++yi) {
        for (let xi = 0; xi < config.numX; ++xi, ++i) {
            let [x, y] = discreteToNormalized(xi, yi);
            const f = 1.0;
            if (-0.5 <= x && x <= 0.0 && -0.5 <= y && y <= 0.5) {
                ic.fu[i] = f;
            }
            if (0.0 <= x && x <= 0.5 && -0.5 <= y && y <= 0.5) {
                ic.fu[i] = -f;
            }
        }
    }
    // Dust density
    for (let i = 0, yi = 0; yi < config.numY; ++yi) {
        for (let xi = 0; xi < config.numX; ++xi, ++i) {
            if (ic.b[i] != CellType.Fluid) {
                continue;
            }
            const [x, y] = discreteToNormalized(xi, yi);
            //if (-0.5 <= x && x <= -0.25) {
            //if (-0.75 <= x && x <= -0.5) {
            if (x <= -0.75) {
                ic.m[i] = 1.0;
            }
        }
    }
    return ic;
}
export function flowOverBackwardFacingStepNoSlip() {
    return flowOverBackwardFacingStep(CellType.SolidNoSlip);
}
export function flowOverBackwardFacingStepFreeSlip() {
    return flowOverBackwardFacingStep(CellType.SolidFreeSlip);
}
function flowOverBackwardFacingStep(solidType = CellType.SolidNoSlip) {
    const borderThickness = minBorderThickness;
    const ic = emptyTank();
    // Step at the left
    for (let i = 0, yi = 0; yi < config.numY; ++yi) {
        for (let xi = 0; xi < config.numX; ++xi, ++i) {
            const [x, y] = discreteToNormalized(xi, yi);
            // Step at the left
            if (x < -0.5 && y < -0.5) {
                ic.b[i] = solidType;
            }
            if (yi <= borderThickness - 1 || yi >= config.numY - 1 - borderThickness) {
                ic.b[i] = solidType;
            }
            // Inflow at the left
            if (xi < borderThickness && y >= -0.5) {
                ic.b[i] = CellType.Inflow;
                ic.e[i] = 1.0;
                ic.m[i] = ic.e[i];
            }
            // Outflow at the right
            if (xi >= config.numX - 1 - borderThickness) {
                ic.b[i] = CellType.Outflow;
            }
        }
    }
    return ic;
}
export function twoFlows(solidType = CellType.SolidNoSlip) {
    const borderThickness = minBorderThickness;
    const ic = emptyTank();
    for (let i = 0, yi = 0; yi < config.numY; ++yi) {
        for (let xi = 0; xi < config.numX; ++xi, ++i) {
            const [x, y] = discreteToNormalized(xi, yi);
            if (xi < borderThickness && -0.125 <= y && y <= 0.125) {
                ic.b[i] = CellType.Inflow;
                //fluid.m[i] = 0.75;
                ic.e[i] = 1.0;
            }
            if ( //(xi < borderThickness && -0.125 <= y && y <= 0.125)
            yi < borderThickness && -0.125 <= x && x <= 0.125) {
                ic.b[i] = CellType.Inflow;
                ic.e[i] = 0.75 * (1.0 / 0.125) * (1.0 / 0.125) * (0.125 * 0.125 - x * x);
                ic.m[i] = ic.e[i];
            }
            if ((xi >= config.numX - borderThickness && y > 0)
            //|| (yi < borderThickness && -0.125 <= x && x <= 0.125)
            ) {
                ic.b[i] = CellType.Outflow;
            }
            // Obstacle at the center
            if (-0.125 <= x && x <= 0.125 && -0.125 <= y && y <= 0.125) {
                ic.b[i] = solidType;
                //ic.b[i] = CellType.Outflow;
            }
            if (-0.75 <= x && x <= -0.7 && -0.1 <= y && y <= 0.1) {
                ic.e[i] = 3.0;
            }
        }
    }
    return ic;
}
export function twoCounterFlows(solidType = CellType.SolidNoSlip) {
    const borderThickness = minBorderThickness;
    const ic = emptyTank(borderThickness);
    setBorder(ic, CellType.Outflow, borderThickness);
    const holeThickness = 0.25;
    for (let i = 0, yi = 0; yi < config.numY; ++yi) {
        for (let xi = 0; xi < config.numX; ++xi, ++i) {
            const [x, y] = discreteToNormalized(xi, yi);
            if ((xi < borderThickness && -holeThickness <= y && y <= holeThickness) ||
                (xi >= config.numX - borderThickness && -holeThickness <= y && y <= holeThickness)) {
                ic.b[i] = CellType.Inflow;
                ic.e[i] = 1.0;
                ic.m[i] = ic.e[i];
            }
            if ((xi < borderThickness && (-holeThickness > y || y > holeThickness)) ||
                (xi >= config.numX - borderThickness && (-holeThickness > y || y > holeThickness))) {
                ic.b[i] = CellType.SolidFreeSlip;
            }
        }
    }
    return ic;
}
export function flowPastObstacleFreeSlip() {
    return flowPastObstacle(CellType.SolidFreeSlip);
}
export function flowPastObstacleNoSlip() {
    return flowPastObstacle(CellType.SolidNoSlip);
}
function flowPastObstacle(solidType = CellType.SolidFreeSlip) {
    const borderThickness = minBorderThickness;
    const ic = emptyTank(borderThickness);
    //setBorder(ic, CellType.Outflow, borderThickness);
    // Step at the left
    for (let i = 0, yi = 0; yi < config.numY; ++yi) {
        for (let xi = 0; xi < config.numX; ++xi, ++i) {
            const [x, y] = discreteToNormalized(xi, yi);
            //const [dx, dy] = [x - (-0.75), y - 0.0];
            //const R = 0.1;
            //if (dx * dx + dy * dy <= R * R) {
            //if ((-0.75 <= x && x <= -0.5 && -0.125 <= y && y <= 0.125)
            //  || (0.0 <= x && x <= 0.5 && -0.125 <= y && y <= 0.125)
            //  || (0.2 <= x && x <= 0.3 && -0.5 <= y && y <= 0.5)
            //) {
            // Step at the left
            if ((-0.75 <= x && x <= -0.5 && -0.125 <= y && y <= 0.125)
            //|| (0.0 <= x && x <= 0.5 && -0.125 <= y && y <= 0.125)
            //|| (0.2 <= x && x <= 0.3 && -0.5 <= y && y <= 0.5)
            ) {
                ic.b[i] = solidType;
            }
            // Inflow at the left
            if (xi < borderThickness) {
                ic.b[i] = CellType.Inflow;
                //fluid.e[i] = 1.0;
                ic.e[i] = 1.0 - y * y;
                //fluid.e[i] *= 0.75;
                ic.m[i] = ic.e[i];
            }
            // Outflow at the right
            if (xi >= config.numX - 1 - borderThickness) {
                ic.b[i] = CellType.Outflow;
            }
        }
    }
    return ic;
}
function isInternalU(ic, i, j) {
    return (!isIndexOOB(i, j) && !isIndexOOB(i - 1, j) &&
        ic.b[cellIndex(i, j)] == CellType.Fluid &&
        ic.b[cellIndex(i - 1, j)] == CellType.Fluid);
}
function isInternalV(ic, i, j) {
    return (!isIndexOOB(i, j) && !isIndexOOB(i, j - 1) &&
        ic.b[cellIndex(i, j)] == CellType.Fluid &&
        ic.b[cellIndex(i, j - 1)] == CellType.Fluid);
}
export function uniformFlow() {
    const borderThickness = minBorderThickness * 4;
    const ic = emptyTank(borderThickness);
    setBorder(ic, CellType.Outflow, borderThickness);
    let dx = config.numX;
    let dy = config.numY;
    let len = Math.sqrt(dx * dx + dy * dy);
    dx = dx / len;
    dy = dy / len;
    const vel = 2.0;
    dx *= vel;
    dy *= vel;
    for (let i = 0, yi = 0; yi < config.numY; ++yi) {
        for (let xi = 0; xi < config.numX; ++xi, ++i) {
            if (isInternalU(ic, xi, yi)) {
                ic.u[i] = dx;
            }
            if (isInternalV(ic, xi, yi)) {
                ic.v[i] = dy;
            }
            // Checkerboard pattern
            const numCheckers = 4;
            const checkerX = Math.floor(xi / (config.numX - 1) * numCheckers);
            const checkerY = Math.floor(yi / (config.numY - 1) * numCheckers);
            if (ic.b[i] == CellType.Fluid && (checkerX + checkerY) % 2 == 1) {
                ic.m[i] = 1.0;
            }
        }
    }
    return ic;
}
function joukowsky(x, y) {
    const sumSqr = x * x + y * y;
    const invSumSqr = 1.0 / sumSqr;
    return [x * (1.0 + invSumSqr), y * (1.0 - invSumSqr)];
}
/**
 * Creates a complex number from real and imaginary parts.
 */
function complex(re, im = 0) {
    return { re, im };
}
/**
 * Adds two complex numbers.
 */
function add(a, b) {
    return { re: a.re + b.re, im: a.im + b.im };
}
/**
 * Subtracts two complex numbers (a - b).
 */
function sub(a, b) {
    return { re: a.re - b.re, im: a.im - b.im };
}
/**
 * Multiplies two complex numbers.
 */
function mul(a, b) {
    return {
        re: a.re * b.re - a.im * b.im,
        im: a.re * b.im + a.im * b.re
    };
}
/**
 * Divides two complex numbers (a / b).
 */
function div(a, b) {
    const denom = b.re * b.re + b.im * b.im;
    return {
        re: (a.re * b.re + a.im * b.im) / denom,
        im: (a.im * b.re - a.re * b.im) / denom
    };
}
/**
 * Absolute value (modulus) of a complex number.
 */
function abs(z) {
    return Math.hypot(z.re, z.im);
}
/**
 * Square root of a complex number (principal branch).
 */
function csqrt(z) {
    const r = abs(z);
    const theta = Math.atan2(z.im, z.re);
    const sqrtR = Math.sqrt(r);
    const halfTheta = theta / 2;
    return {
        re: sqrtR * Math.cos(halfTheta),
        im: sqrtR * Math.sin(halfTheta)
    };
}
/**
 * Returns true if the point (x, y) lies inside the Joukowsky airfoil
 * generated by mapping the circle in the z‑plane that passes through 1
 * and has centre c (complex). Default c = -0.1 gives a symmetric airfoil
 * of about 10% thickness.
 *
 * The condition: both preimages of (x,y) under the Joukowsky transform
 * lie inside the original circle.
 *
 * @param x - x-coordinate of the point
 * @param y - y-coordinate of the point
 * @param cRe - real part of the circle centre (default -0.1)
 * @param cIm - imaginary part of the circle centre (default 0)
 * @returns true if inside the airfoil, false otherwise
 */
export function isInsideJoukowsky(x, y, cRe = -0.1, cIm = 0) {
    const zeta = complex(x, y);
    const c = complex(cRe, cIm);
    // Radius so that the circle passes through z = 1
    const one = complex(1, 0);
    const R = abs(sub(one, c));
    // Solve z^2 - zeta*z + 1 = 0
    const zetaSq = mul(zeta, zeta);
    const four = complex(4, 0);
    const discriminant = sub(zetaSq, four);
    const sqrtD = csqrt(discriminant);
    const two = complex(2, 0);
    const z1 = div(add(zeta, sqrtD), two);
    const z2 = div(sub(zeta, sqrtD), two);
    const eps = 1e-12;
    const inside1 = abs(sub(z1, c)) <= R + eps;
    const inside2 = abs(sub(z2, c)) <= R + eps;
    return inside1 && inside2;
}
export function joukowskyAirfoil(solidType = CellType.SolidFreeSlip) {
    const borderThickness = minBorderThickness;
    const ic = emptyTank(borderThickness);
    //setBorder(ic, CellType.Outflow, borderThickness);
    // Step at the left
    for (let i = 0, yi = 0; yi < config.numY; ++yi) {
        for (let xi = 0; xi < config.numX; ++xi, ++i) {
            const [x, y] = discreteToNormalized(xi, yi);
            //const [dx, dy] = [x - (-0.75), y - 0.0];
            //const R = 0.1;
            //if (dx * dx + dy * dy <= R * R) {
            //if ((-0.75 <= x && x <= -0.5 && -0.125 <= y && y <= 0.125)
            //  || (0.0 <= x && x <= 0.5 && -0.125 <= y && y <= 0.125)
            //  || (0.2 <= x && x <= 0.3 && -0.5 <= y && y <= 0.5)
            //) {
            // Step at the left
            if (isInsideJoukowsky(x * 3, y * 3, -0.2, 0.2)) {
                ic.b[i] = solidType;
            }
            // Inflow at the left
            if (xi < borderThickness) {
                ic.b[i] = CellType.Inflow;
                ic.e[i] = 1.0;
                //ic.e[i] = 1.0 - y * y;
                ic.e[i] *= 0.7;
                ic.m[i] = ic.e[i];
            }
            // Outflow at the right
            if (xi >= config.numX - 1 - borderThickness) {
                ic.b[i] = CellType.Outflow;
            }
        }
    }
    return ic;
}
