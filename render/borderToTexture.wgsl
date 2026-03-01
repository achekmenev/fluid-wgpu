// Boundary information
@group(0) @binding(0) var<storage> b: array<u32>;
// Texture to render the data on
@group(0) @binding(1) var outputImage: texture_storage_2d<rgba8unorm, write>;

override workgroupSizeX = 8;
override workgroupSizeY = 8;
override numX: u32;
override numY: u32;

alias CellType = u32;
const CellType_Fluid: CellType = 0;
const CellType_Inflow: CellType = 1;
const CellType_Outflow: CellType = 2;
const CellType_SolidFreeSlip: CellType = 3;
const CellType_SolidNoSlip: CellType = 4;

fn cellTypeColor(cellType: CellType) -> vec3f {
    const numCellTypes = 5;
    const colors = array<vec3f, numCellTypes>(
        vec3(0, 0, 1),
        vec3(0, 1, 0),
        vec3(1, 1, 1),
        vec3(0.5, 0.5, 0.5),
        vec3(0, 0, 0),
    );
    return colors[cellType];
}

fn cellIndex(x: u32, y: u32) -> u32 {
    return y * numX + x;
}

@compute @workgroup_size(workgroupSizeX, workgroupSizeY)
fn main(@builtin(global_invocation_id) id: vec3u) {
    // Only process pixels within texture bounds
    if (id.x >= numX || id.y >= numY) {
        return;
    }

    let i = cellIndex(id.x, id.y);
    let qq = b[i];

    var cellColor = vec3f(0, 0, 0);
    if (id.x == 10 && id.y == 10) {
        cellColor = vec3f(1, 1, 1);
    }

    cellColor = cellTypeColor(b[i]);

    // Write to texture
    textureStore(outputImage, id.xy, vec4f(cellColor, 1));
}