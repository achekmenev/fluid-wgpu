struct Uniforms {
  time: f32,
  instanceCount: f32,
  pointSize: f32,
};

//@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(0) var<storage> u: array<f32>;
@group(0) @binding(1) var<storage> v: array<f32>;
@group(0) @binding(2) var<storage> b: array<u32>;

alias CellType = u32;
const CellType_Fluid: CellType = 0;
const CellType_Inflow: CellType = 1;
const CellType_Outflow: CellType = 2;
const CellType_SolidFreeSlip: CellType = 3;
const CellType_SolidNoSlip: CellType = 4;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) alpha: f32,
};

const tau = radians(360.0);


override numX: u32;  // simulation width
override numY: u32;
override stride: u32;
override unitLength: f32; // Normalized length of an arrow of unit length

override strideX = stride;
override strideY = stride;
override numSubX = (numX + strideX - 1) / strideX; 
fn cellIndex(x: u32, y: u32) -> u32 {
  return y * numX + x;
}
fn cellIndexSubsampled(stepX: u32, stepY: u32) -> u32 {
  return stepY * numX + stepX;
}

fn discreteToNormalized(id: vec2u) -> vec2f {
  return vec2f(
    f32(id.x) / f32(numX - 1) * 2.0 - 1.0,
    f32(id.y) / f32(numY - 1) * 2.0 - 1.0
  );
}

@vertex
fn vs(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
  const pointWidth = 0.1;
  const pointLength = 0.3;
  const pos = array<vec2f, 6>(
    vec2(0.0, 0.0),
    vec2(1.0, 0.0),
    vec2(1.0, 0.0),
    vec2(1.0 - pointLength, pointWidth),
    vec2(1.0, 0.0),
    vec2(1.0 - pointLength, -pointWidth)
  );

  //const stride = 4;

  //let i = 256 * 100 + 100;

  // Convert subsampled index to (x, y) in the subsampled grid
  let subX = instanceIndex % numSubX;
  let subY = instanceIndex / numSubX;
  //let subX = 256u / 4 / 2;
  //let subY = 256u / 4 / 2;

  // Map back to original coordinates
  let origX = subX * strideX;
  let origY = subY * strideY;

  let arrowOrigin = discreteToNormalized(vec2(origX, origY));

  let i = origY * numX + origX;
  //let i = 0;

  var len = 0.0;
  var angle = 0.0;
  let placeholder = b[i];
  //if (b[i] == CellType_Fluid) {
    let myU = 0.5 * (u[i] + u[i + 1]);
    let myV = 0.5 * (v[i] + v[i + numX]);

    len = sqrt(myU * myU + myV * myV);
    if (len > 0.0) {
      angle = atan2(myV, myU);
    }
  //}

  let rot = mat2x2f(
    cos(angle), sin(angle),
    -sin(angle), cos(angle)
  );
  let point = rot * pos[vertexIndex] * len * unitLength;

  var output: VertexOutput;
  //output.position = vec4f(x + p.x, y+ p.y, z, 1);
  output.position = vec4f(arrowOrigin + point, 0, 1);
  output.alpha = 0.5;
  //output.alpha = i/c;
  return output;
}

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
  //return vec4f(1, 0.5, 0.2, input.alpha);
  //let a = pow(input.alpha, 2.2);
  //let a = input.alpha;
  return vec4f(1.0, 1.0, 0.0, 1.0);
}