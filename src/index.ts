export function add(a: number, b: number): number {
  return a + b
}

function main() {
  console.log('TS GeoSimulator sample')
  console.log('add(2, 3) =', add(2, 3))
}

if (require.main === module) {
  main()
}
