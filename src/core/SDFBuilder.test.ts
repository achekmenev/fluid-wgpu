import { SDFBuilder } from './SDFBuilder.js'

const TOLERANCE = 1e-6;

function areFloat32ArraysEqual(
  arr1: Float32Array,
  arr2: Float32Array,
  tolerance: number = TOLERANCE
): boolean {
  if (arr1.length !== arr2.length) {
    console.log(`arr1.length: ${arr1.length}, arr2.length: ${arr2.length}`);
    return false;
  }

  for (let i = 0; i < arr1.length; ++i) {
    if (Math.abs(arr1[i] - arr2[i]) >= tolerance) {
      console.log(`${i} element differ: ${arr1[i]} and ${arr2[i]}`);
      return false;
    }
  }

  return true;
}

// Assume that CellType.Fluid == 0

describe('SDF bulder', () => {

  it('one fluid', () => {
    const [numX, numY] = [3, 3];
    const cellTypeArray = new Uint32Array([
      1, 1, 1,
      1, 0, 1,
      1, 1, 1
    ]);
    const expectedSDF = new Float32Array([
      -Math.SQRT1_2, -0.5, -Math.SQRT1_2,
      -0.5, 0.5, -0.5,
      -Math.SQRT1_2, -0.5, -Math.SQRT1_2
    ]);

    const builtSDB = new SDFBuilder(cellTypeArray, numX, numY).buildSDF();
    expect(areFloat32ArraysEqual(builtSDB, expectedSDF)).toBeTruthy();
  });

  it('top right corner', () => {
    const [numX, numY] = [7, 6];
    const cellTypeArray = new Uint32Array([
      1, 1, 1, 1, 1, 1, 1,
      1, 0, 0, 0, 0, 1, 1,
      1, 0, 0, 0, 1, 0, 1,
      1, 0, 0, 0, 0, 0, 1,
      1, 0, 0, 0, 0, 0, 1,
      1, 1, 1, 1, 1, 1, 1,
    ]);
    const expectedSDF = new Float32Array([
      -Math.SQRT1_2, -0.5, -0.5, -0.5, -0.5, -Math.SQRT1_2, -Math.sqrt(1.5 * 1.5 + 0.5 * 0.5),
      -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -Math.SQRT1_2,
      -0.5, 0.5, 1.5, 0.5, -0.5, 0.5, -0.5,
      -0.5, 0.5, 1.5, Math.SQRT1_2, 0.5, 0.5, -0.5,
      -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5,
      -Math.SQRT1_2, -0.5, -0.5, -0.5, -0.5, -0.5, -Math.SQRT1_2,
    ]);

    //const builtSDB = new SDFBuilder(cellTypeArray, numX, numY).sdf;
    const builtSDB = new SDFBuilder(cellTypeArray, numX, numY).buildSDF();
    expect(areFloat32ArraysEqual(builtSDB, expectedSDF)).toBeTruthy();
  });
});