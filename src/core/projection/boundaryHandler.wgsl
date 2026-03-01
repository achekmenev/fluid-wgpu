@group(0) @binding(0)
var<storage, read_write> u: array<f32>;
@group(0) @binding(1)
var<storage, read_write> v: array<f32>;
@group(0) @binding(2)
var<storage, read_write> p: array<f32>;
@group(0) @binding(3)
var<storage, read> e: array<f32>;
@group(0) @binding(4)
var<storage, read> b: array<u32>;

@group(0) @binding(5)
var<storage, read_write> m: array<f32>;

override workgroupSizeX = 8;
override workgroupSizeY = 8;
override numX: i32;
override numY: i32;

alias CellType = u32;
const CellType_Fluid: CellType = 0;
const CellType_Inflow: CellType = 1;
const CellType_Outflow: CellType = 2;
const CellType_SolidFreeSlip: CellType = 3;
const CellType_SolidNoSlip: CellType = 4;

fn CellType_isSolid(cell: CellType) -> bool {
  return cell == CellType_SolidFreeSlip || cell == CellType_SolidNoSlip;
}

fn CellType_isMass(cell: CellType) -> bool {
  return cell == CellType_Fluid || cell == CellType_Inflow;
}

const cellTypesNum = 5;
// Possible values between 1.0 -- pure Neumann and -1.0 -- pure Dirichlet.
// Intermediate values give intermediate behaviour.
const tangentVelocityNeumannDirichletMultBC = array<f32, cellTypesNum>(
  0, // fluid (dummy unused value)
  - 1, // inflow: pure Dirichlet
  1, // outflow: pure Neumann
  1, // solid free-slip: pure Neumann
  - 1 // solid no-slip: pure Dirichlet
);

const directions = array<vec2i, 4>(vec2(- 1, 0), vec2(1, 0), vec2(0, - 1), vec2(0, 1));

fn isIndexOOB(i: i32, j: i32) -> bool {
  return (i < 0 || i >= numX || j < 0 || j >= numY);
}

fn cellIndex(x: i32, y: i32) -> i32 {
  return y * numX + x;
}

fn isCellType(i: i32, j: i32, cellType: CellType) -> bool {
  // We extrapolate query
  return isIndexOOB(i, j) || b[cellIndex(i, j)] == cellType;
}

// Note that this function is not the same as !isCellType(i, j, CellType.Fluid)
// due to different query extrapolation to the OOB in the presence of negation.
fn notFluid(i: i32, j: i32) -> bool {
  // We extrapolate query
  return isIndexOOB(i, j) || b[cellIndex(i, j)] != CellType_Fluid;
}

//// Rewrite this comment! It's out of date.
// This is a very important function.
// It does three things:
// 1. Sets pure Neumann pressure boundary conditions on pressure. Both in free-slip and no-slip cases.
// 1.1. Sets normal velocity on edges to 0. This velocity components are used to compute divergence.
// 2. Sets extrapolated velocity components according to a given (free-slip or no-slip) BC.
// It's not used to compute divergence and so does not contribute to the div-free velocity correction.
// But it's useful for a more correct advection due to floating point errors, when the semi-Lagrangian
// extrapolation gives the position inside the wall. Usually it's just a bit, e.g. 2.99 for a 2 be a solid
// cell and 3 be a fluid cell. But since we interpolate values it matters.
// 3. Sets averaged mass from neigbouring fluid cells to the wall cells. It's very important to the mass
// conservation for the same reasons as in the prevoius point.

@compute @workgroup_size(workgroupSizeX, workgroupSizeY)
fn setBoundaryNormalVelocityAndPressure(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x);
  let y = i32(id.y);
  let i = cellIndex(x, y);

  if (x >= numX || y >= numY || b[i] == CellType_Fluid) {
    return;
  }

  var neibP = 0.0;
  // We awerage boundary conditions from dirrefent edges.
  // > 0 if the cell is at the boundary
  var numFluidNeib = 0u;

  for (var dirI = 0; dirI < 4; dirI++) {
    let dir = directions[dirI];
    let neibX = x + dir.x;
    let neibY = y + dir.y;
    if (isIndexOOB(neibX, neibY)) {
      continue;
    }

    let neibI = cellIndex(neibX, neibY);
    // Only neighrouring fluid cells affect the boundary conditions on the velocity.
    if (b[neibI] != CellType_Fluid) {
      continue;
    }

    numFluidNeib++;
    // Pure Neumann for all boundary types, because I set velocities at the boundary explicitly.
    neibP += p[neibI];

    switch (b[i]) {
      case default : {
        // unknown case
      }

      case CellType_SolidFreeSlip, CellType_SolidNoSlip: {
        // Griebel et al. Numerical Simulation in Fluid Dynamics-A Practical Introduction. 1997. p. 30.
        // Set normal velocity components to 0
        if (dir.x == - 1) {
          // Left
          // Used for div calculation
          u[i] = 0.0;
        }
        else if (dir.x == 1) {
          // Right
          u[cellIndex(x + 1, y)] = 0.0;
        }
        else if (dir.y == - 1) {
          // Bottom
          v[i] = 0.0;
        }
        else {
          // Top
          v[cellIndex(x, y + 1)] = 0.0;
        }
      }

      case CellType_Inflow: {
        let inflowVel = e[i];
        if (dir.x == - 1) {
          // Left
          u[i] = - inflowVel;
        }
        else if (dir.x == 1) {
          // Right
          u[cellIndex(x + 1, y)] = inflowVel;
        }
        else if (dir.y == - 1) {
          // Bottom
          v[i] = - inflowVel;
        }
        else {
          // Top
          v[cellIndex(x, y + 1)] = inflowVel;
        }
      }

      // For this to be correct there should be no fluic cells just between two outflow cells.
      // Bad: OFO. Good: OFFO, OFFFO, ...
      case CellType_Outflow: {
        if (dir.x == - 1) {
          // Left
          u[i] = u[cellIndex(x - 1, y)];
        }
        else if (dir.x == 1) {
          // Right
          u[cellIndex(x + 1, y)] = u[cellIndex(x + 2, y)];
        }
        else if (dir.y == - 1) {
          // Bottom
          v[i] = v[cellIndex(x, y - 1)];
        }
        else {
          // Top
          v[cellIndex(x, y + 1)] = v[cellIndex(x, y + 2)];
        }
      }
    }
  }

  if (numFluidNeib > 0) {
    // Pressure in the boundary cell to ensure the correct boundary condition on the neighbouring fluid cell's edge (actual boundary).
    p[i] = neibP / f32(numFluidNeib);
  }
}

fn isFluidCell(x: i32, y: i32) -> bool {
  return b[cellIndex(x, y)] == CellType_Fluid;
}

/*fn getMultBC(cellIndex: i32) -> f32 {
  switch (b[cellIndex]) {
    case CellType_Inflow, CellType_SolidNoSlip, default: {
      return -1.0;
    }
    case CellType_Outflow, CellType_SolidFreeSlip: {
      return 1.0;
    }
  }
}*/

@compute @workgroup_size(workgroupSizeX, workgroupSizeY)
fn setBoundaryTangentVelocity(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x);
  let y = i32(id.y);
  let i = cellIndex(x, y);
  // Process only boundary cells
  if (x >= numX || y >= numY || b[i] == CellType_Fluid) {
    return;
  }
  // U
  // Whether the edge is adjacent to 2 boundary cells.
  if (x > 0 && b[cellIndex(x - 1, y)] != CellType_Fluid) {
    var numAdjacentFreeFluid = 0;
    var adjacentU = 0.0;
    for (var adjY = y - 1; adjY <= y + 1; adjY += 2) {
      // If both neihgbours are fluid, then this edge plays role in diffusion stencil and in advection.
      // If only one neighbour is fluid, then the edge plays role in advection only, determining the velocity at the corner boundary,
      if (isFluidCell(x - 1, adjY) || isFluidCell(x, adjY)) {
        numAdjacentFreeFluid++;
        adjacentU += u[cellIndex(x, adjY)];
      }
    }
    // If there is fluid on both sides I just average their velocity, though it's definitely not give the correct result.
    // But we can't decide which one to pick. Solution: don't make walls one cell thick.
    if (numAdjacentFreeFluid != 0) {
      let multBC1 = tangentVelocityNeumannDirichletMultBC[b[i]];
      let multBC2 = tangentVelocityNeumannDirichletMultBC[b[cellIndex(x - 1, y)]];
      let multBCAvg = 0.5 * (multBC1 + multBC2);
      u[i] = multBCAvg * adjacentU / f32(numAdjacentFreeFluid);
    }
  }
  // V
  if (y > 0 && b[cellIndex(x, y - 1)] != CellType_Fluid) {
    var numAdjacentFreeFluid = 0;
    var adjacentV = 0.0;
    for (var adjX = x - 1; adjX <= x + 1; adjX += 2) {
      if (isFluidCell(adjX, y - 1) || isFluidCell(adjX, y)) {
        numAdjacentFreeFluid++;
        adjacentV += v[cellIndex(adjX, y)];
      }
    }
    if (numAdjacentFreeFluid != 0) {
      let multBC1 = tangentVelocityNeumannDirichletMultBC[b[i]];
      let multBC2 = tangentVelocityNeumannDirichletMultBC[b[cellIndex(x, y - 1)]];
      let multBCAvg = 0.5 * (multBC1 + multBC2);
      v[i] = multBCAvg * adjacentV / f32(numAdjacentFreeFluid);
    }
  }
}

// Set ghost cells mass s.t. the boundary mass is OK. To be used in advection backtrace.
@compute @workgroup_size(workgroupSizeX, workgroupSizeY)
fn extrapolateM(@builtin(global_invocation_id) id: vec3u) {
  let x = i32(id.x);
  let y = i32(id.y);
  if (x >= numX || y >= numY) {
    return;
  }
  let i = cellIndex(x, y);
  let currT = b[i];
  // Extrapolate mass only to solid cells
  //if (x >= numX || y >= numY || !CellType_isSolid(b[i])) {
  // Fluid and inflow cells already know their density
  if (currT == CellType_Fluid || currT == CellType_Inflow) {
    return;
  }

  // Mass can be backtraced from flid cell only
  var numFluidNeib = 0;
  // Mass can be in fluid and inflow cells.
  var neibM = 0.0;

  for (var dirI = 0; dirI < 4; dirI++) {
    let dir = directions[dirI];

    let neibX = x + dir.x;
    let neibY = y + dir.y;
    if (isIndexOOB(neibX, neibY)) {
      continue;
    }
    let neibI = cellIndex(neibX, neibY);
    // Whether neighbouring cell contains mass
    // Maybe here should be Fluid only and to assume that Inflow cells know their density?
    //if (neibT === CellType.Fluid || neibT === CellType.Inflow) {
    if (b[neibI] == CellType_Fluid) {
      numFluidNeib++;
      neibM += m[neibI];
    }
  }

  if (numFluidNeib > 0) {
    var ghostM = neibM / f32(numFluidNeib);
    if (currT == CellType_Outflow) {
      // Pure Dirichlet for outflow
      ghostM = - ghostM;
    }
    m[i] = ghostM;
  }
}