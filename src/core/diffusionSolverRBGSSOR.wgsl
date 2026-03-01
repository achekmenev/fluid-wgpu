@group(0) @binding(0) var<storage, read> u: array<f32>;
@group(0) @binding(1) var<storage, read> v: array<f32>;
@group(0) @binding(2) var<storage, read_write> newU: array<f32>;
@group(0) @binding(3) var<storage, read_write> newV: array<f32>;
@group(0) @binding(4) var<storage, read> b: array<u32>;

alias CellType = u32;
const CellType_Fluid: CellType = 0;
const CellType_Inflow: CellType = 1;
const CellType_Outflow: CellType = 2;
const CellType_SolidFreeSlip: CellType = 3;
const CellType_SolidNoSlip: CellType = 4;

override workgroupSizeX = 8;
override workgroupSizeY = 8;
override numX: u32;
override numY: u32;
override relaxationFactor: f32;
override offdiagonalCoefficient: f32;
override constantCoefficient: f32;

@compute @workgroup_size(workgroupSizeX, workgroupSizeY)
fn copyVelocities(@builtin(global_invocation_id) id: vec3u) {
  let x = id.x;
  let y = id.y;
  if (x >= numX || y >= numY) {
    return;
  }
  let i = cellIndex(x, y);
  
  newU[i] = u[i];
  newV[i] = v[i];
}

fn cellIndex(x: u32, y: u32) -> u32 {
  return y * numX + x;
}

const RED = 0u;
const BLACK = 1u;


@compute @workgroup_size(workgroupSizeX, workgroupSizeY)
fn redPass(@builtin(global_invocation_id) id: vec3u) {
  let x = id.x;
  let y = id.y;
  let i = cellIndex(x, y);
  if (x >= numX || y >= numY || (x + y) % 2 != RED || b[i] != CellType_Fluid) {
    return;
  }

  // U
  // If u component is internal (adjacent to two fluid cells)
  if (b[cellIndex(x - 1, y)] == CellType_Fluid) {
    let oldValue = newU[i];
    // There'd be no index OOB if there is no fluid on the border rect.
    let newValue = offdiagonalCoefficient * (
      newU[cellIndex(x + 1, y)] +
      newU[cellIndex(x - 1, y)] +
      newU[cellIndex(x, y + 1)] +
      newU[cellIndex(x, y - 1)]
    ) + constantCoefficient * u[i];
    // relaxationFactor = 1.0 corresponds to pure Gauss-Seidel.
    newU[i] = relaxationFactor * newValue + (1.0 - relaxationFactor) * oldValue;
  }

  // V
  // If v component is internal (adjacent to two fluid cells)
  if (b[cellIndex(x, y - 1)] == CellType_Fluid) {
    let oldValue = newV[i];
    // There'd be no index OOB if there is no fluid on the border rect.
    let newValue = offdiagonalCoefficient * (
      newV[cellIndex(x + 1, y)] +
      newV[cellIndex(x - 1, y)] +
      newV[cellIndex(x, y + 1)] +
      newV[cellIndex(x, y - 1)]
    ) + constantCoefficient * v[i];
    // relaxationFactor = 1.0 corresponds to pure Gauss-Seidel.
    newV[i] = relaxationFactor * newValue + (1.0 - relaxationFactor) * oldValue;
  }
}

// Copy-pasted with only change RED -> BLACK
@compute @workgroup_size(workgroupSizeX, workgroupSizeY)
fn blackPass(@builtin(global_invocation_id) id: vec3u) {
  let x = id.x;
  let y = id.y;
  let i = cellIndex(x, y);
  if (x >= numX || y >= numY || (x + y) % 2 != BLACK || b[i] != CellType_Fluid) {
    return;
  }

  // U
  // If u component is internal (adjacent to two fluid cells)
  if (b[cellIndex(x - 1, y)] == CellType_Fluid) {
    let oldValue = newU[i];
    // There'd be no index OOB if there is no fluid on the border rect.
    let newValue = offdiagonalCoefficient * (
      newU[cellIndex(x + 1, y)] +
      newU[cellIndex(x - 1, y)] +
      newU[cellIndex(x, y + 1)] +
      newU[cellIndex(x, y - 1)]
    ) + constantCoefficient * u[i];
    // relaxationFactor = 1.0 corresponds to pure Gauss-Seidel.
    newU[i] = relaxationFactor * newValue + (1.0 - relaxationFactor) * oldValue;
  }

  // V
  // If v component is internal (adjacent to two fluid cells)
  if (b[cellIndex(x, y - 1)] == CellType_Fluid) {
    let oldValue = newV[i];
    // There'd be no index OOB if there is no fluid on the border rect.
    let newValue = offdiagonalCoefficient * (
      newV[cellIndex(x + 1, y)] +
      newV[cellIndex(x - 1, y)] +
      newV[cellIndex(x, y + 1)] +
      newV[cellIndex(x, y - 1)]
    ) + constantCoefficient * v[i];
    // relaxationFactor = 1.0 corresponds to pure Gauss-Seidel.
    newV[i] = relaxationFactor * newValue + (1.0 - relaxationFactor) * oldValue;
  }
}


///////////////////////////////////////

/*
// Return ghost value for a solid neighbor based on its type and the current cell's value.
fn ghostValue(neighborType: u32, ownValue: f32) -> f32 {
    if (neighborType == CellType_SolidNoSlip) {
        return -ownValue;      // no‑slip: zero at the face
    } else if (neighborType == CellType_SolidFreeSlip) {
        return ownValue;       // free‑slip: zero gradient
    }
    return 0.0; // fallback (should not happen)
}

// Sum neighbor U values, using ghost values for solid neighbors.
fn sumNeighborsU(x: u32, y: u32, currentU: f32) -> f32 {
    var sum = 0.0;

    // right neighbor (x+1, y)
    let rightIdx = cellIndex(x + 1, y);
    if (b[rightIdx] == CellType_Fluid) {
        sum += newU[rightIdx];
    } else if (b[rightIdx] == CellType_SolidNoSlip || b[rightIdx] == CellType_SolidFreeSlip) {
        sum += ghostValue(b[rightIdx], currentU);
    }

    // left neighbor (x-1, y)
    let leftIdx = cellIndex(x - 1, y);
    if (b[leftIdx] == CellType_Fluid) {
        sum += newU[leftIdx];
    } else if (b[leftIdx] == CellType_SolidNoSlip || b[leftIdx] == CellType_SolidFreeSlip) {
        sum += ghostValue(b[leftIdx], currentU);
    }

    // top neighbor (x, y+1)
    let topIdx = cellIndex(x, y + 1);
    if (b[topIdx] == CellType_Fluid) {
        sum += newU[topIdx];
    } else if (b[topIdx] == CellType_SolidNoSlip || b[topIdx] == CellType_SolidFreeSlip) {
        sum += ghostValue(b[topIdx], currentU);
    }

    // bottom neighbor (x, y-1)
    let bottomIdx = cellIndex(x, y - 1);
    if (b[bottomIdx] == CellType_Fluid) {
        sum += newU[bottomIdx];
    } else if (b[bottomIdx] == CellType_SolidNoSlip || b[bottomIdx] == CellType_SolidFreeSlip) {
        sum += ghostValue(b[bottomIdx], currentU);
    }

    return sum;
}

// Sum neighbor V values similarly.
fn sumNeighborsV(x: u32, y: u32, currentV: f32) -> f32 {
    var sum = 0.0;

    let rightIdx = cellIndex(x + 1, y);
    if (b[rightIdx] == CellType_Fluid) {
        sum += newV[rightIdx];
    } else if (b[rightIdx] == CellType_SolidNoSlip || b[rightIdx] == CellType_SolidFreeSlip) {
        sum += ghostValue(b[rightIdx], currentV);
    }

    let leftIdx = cellIndex(x - 1, y);
    if (b[leftIdx] == CellType_Fluid) {
        sum += newV[leftIdx];
    } else if (b[leftIdx] == CellType_SolidNoSlip || b[leftIdx] == CellType_SolidFreeSlip) {
        sum += ghostValue(b[leftIdx], currentV);
    }

    let topIdx = cellIndex(x, y + 1);
    if (b[topIdx] == CellType_Fluid) {
        sum += newV[topIdx];
    } else if (b[topIdx] == CellType_SolidNoSlip || b[topIdx] == CellType_SolidFreeSlip) {
        sum += ghostValue(b[topIdx], currentV);
    }

    let bottomIdx = cellIndex(x, y - 1);
    if (b[bottomIdx] == CellType_Fluid) {
        sum += newV[bottomIdx];
    } else if (b[bottomIdx] == CellType_SolidNoSlip || b[bottomIdx] == CellType_SolidFreeSlip) {
        sum += ghostValue(b[bottomIdx], currentV);
    }

    return sum;
}

@compute @workgroup_size(workgroupSizeX, workgroupSizeY)
fn redPass(@builtin(global_invocation_id) id: vec3u) {
    let x = id.x;
    let y = id.y;
    let i = cellIndex(x, y);
    if (x >= numX || y >= numY || (x + y) % 2 != RED || b[i] != CellType_Fluid) {
        return;
    }

    // Update U
    {
        let oldU = u[i];
        let sumU = sumNeighborsU(x, y, newU[i]); // use newU[i] as own value for ghost calc
        let newValue = offdiagonalCoefficient * sumU + constantCoefficient * oldU;
        newU[i] = relaxationFactor * newValue + (1.0 - relaxationFactor) * oldU;
    }

    // Update V
    {
        let oldV = v[i];
        let sumV = sumNeighborsV(x, y, newV[i]);
        let newValue = offdiagonalCoefficient * sumV + constantCoefficient * oldV;
        newV[i] = relaxationFactor * newValue + (1.0 - relaxationFactor) * oldV;
    }
}

@compute @workgroup_size(workgroupSizeX, workgroupSizeY)
fn blackPass(@builtin(global_invocation_id) id: vec3u) {
    let x = id.x;
    let y = id.y;
    let i = cellIndex(x, y);
    if (x >= numX || y >= numY || (x + y) % 2 != BLACK || b[i] != CellType_Fluid) {
        return;
    }

    {
        let oldU = u[i];
        let sumU = sumNeighborsU(x, y, newU[i]);
        let newValue = offdiagonalCoefficient * sumU + constantCoefficient * oldU;
        newU[i] = relaxationFactor * newValue + (1.0 - relaxationFactor) * oldU;
    }

    {
        let oldV = v[i];
        let sumV = sumNeighborsV(x, y, newV[i]);
        let newValue = offdiagonalCoefficient * sumV + constantCoefficient * oldV;
        newV[i] = relaxationFactor * newValue + (1.0 - relaxationFactor) * oldV;
    }
}
*/