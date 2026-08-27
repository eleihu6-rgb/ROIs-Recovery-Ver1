import { registerTransform } from '../index.js'
import { F8CrewTransform } from './crew.js'
import { F8FlightTransform } from './flight.js'
import { F8PairingTransform } from './pairing.js'
import { F8RosterFlightTransform } from './roster-flight.js'

export const registerF8Transforms = (): void => {
  registerTransform('f8/crew', new F8CrewTransform())
  registerTransform('f8/flight', new F8FlightTransform())
  registerTransform('f8/pairing', new F8PairingTransform())
  registerTransform('f8/roster-flight', new F8RosterFlightTransform())
}