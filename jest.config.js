// https://basarat.gitbook.io/typescript/intro-1/jest
module.exports = {
  preset: 'ts-jest',
  resolver: 'jest-ts-webcompat-resolver',
  "roots": [
    "<rootDir>/src"
  ],
  "testMatch": [
    "**/__tests__/**/*.+(ts|tsx|js)",
    "**/?(*.)+(spec|test).+(ts|tsx|js)"
  ],
  "transform": {
    "^.+\\.(ts|tsx)$": "ts-jest"
  },
}