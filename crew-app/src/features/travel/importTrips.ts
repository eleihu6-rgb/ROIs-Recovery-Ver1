import DocumentPicker, { types, isCancel } from 'react-native-document-picker';
import { parseRosterCsv, groupIntoTrips, type Trip } from './tripCsv';

export class TripImportCancelled extends Error {
  constructor() {
    super('Trip import cancelled');
    this.name = 'TripImportCancelled';
  }
}

/**
 * Prompt the user to pick a CSV file (e.g. data/Crew Roster Sample.csv), read it,
 * and parse it into trips. Throws TripImportCancelled if the user backs out.
 */
export async function pickAndParseTrips(): Promise<Trip[]> {
  let result;
  try {
    result = await DocumentPicker.pickSingle({
      type: [types.csv, types.plainText, types.allFiles],
      copyTo: 'cachesDirectory',
    });
  } catch (err) {
    if (isCancel(err)) {
      throw new TripImportCancelled();
    }
    throw err;
  }

  const uri = result.fileCopyUri ?? result.uri;
  if (!uri) {
    throw new Error('Could not read the selected file.');
  }

  const response = await fetch(uri);
  const text = await response.text();

  const trips = groupIntoTrips(parseRosterCsv(text));
  if (trips.length === 0) {
    throw new Error('No trips found in that file. Check the CSV format.');
  }
  return trips;
}
