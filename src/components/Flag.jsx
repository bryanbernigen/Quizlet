import { KR } from 'country-flag-icons/react/3x2'
import { ID } from 'country-flag-icons/react/3x2'

export function KoreanFlag({ size = 20 }) {
  return <KR width={size} height={Math.round(size * (2 / 3))} />
}

export function IndonesianFlag({ size = 20 }) {
  return <ID width={size} height={Math.round(size * (2 / 3))} />
}
