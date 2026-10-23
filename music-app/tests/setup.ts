import '@testing-library/jest-dom/vitest'

// jsdom lacks object URL APIs used by playlist export
if (typeof URL.createObjectURL !== 'function') {
  ;(URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:mock'
  ;(URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined
}
