
export default function zipParams(names = []) {
  return values => names.reduce(
    (last, key, idx) => Object.assign(last, { [key]: values[idx] }),
    {},
  )
}
