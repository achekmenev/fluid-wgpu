export const config = {
    numScene: 0,
    numX: 512, // simulation width
    numY: 512, // simulation height
    dx: 0.01, // m(eters)
    dt: 0.02, // s(econds)
    workgroupSizeX: 8,
    workgroupSizeY: 8,
    numIntegrationMethod: 1,
    iterations: 20,
    relaxationFactor: 1.5, //1.9,
    //kinematicViscosity: 1e-2,
    kinematicViscosity: 1e-4,
    diffusionIterations: 10,
    diffusionRelaxationFactor: 1.5,
    dustExponentialDecayConstant: 1e-3,
    updateIntervalMs: 0,
    pause: false,
};
