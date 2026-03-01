export const config = {
    numScene: 0,
    numX: 256, // simulation width
    numY: 128, // simulation height
    dx: 0.01, // m(eters)
    dt: 0.02, // s(econds)
    workgroupSizeX: 8,
    workgroupSizeY: 8,
    numIntegrationMethod: 1,
    iterations: 20,
    relaxationFactor: 1.5, //1.9,
    //kinematicViscosity: 1e-2,
    kinematicViscosity: 2e-3,
    diffusionIterations: 10,
    diffusionRelaxationFactor: 1.5,
    updateIntervalMs: 0,
    pause: false,
};
