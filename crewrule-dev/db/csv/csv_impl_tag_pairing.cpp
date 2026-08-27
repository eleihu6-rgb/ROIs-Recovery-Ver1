#pragma once

#include <string.h>

#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"
//aircraftParser

void tagPairingParser::init(vector<string>& headers) {}


static vector<string> tagPairingDefaultHeaders = { "tagGroupId", "base", "pairingLength", "avgBlhLow", "avgBlhHigh", "layover", 
"createdBy","createdDt","lastModified", "modifiedBy","id", "avgBlockPerSegLow", "avgBlockPerSegHigh"};
vector<string>& tagPairingParser::getDefaultHeaders() {
	return tagPairingDefaultHeaders;
}

void* tagPairingParser::createInstance() {
	return new TAG_PAIRING();
}

void tagPairingParser::deleteInstance(void* obj) {
	delete (TAG_PAIRING*)obj;
}


string tagPairingParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TAG_PAIRING * ref = (TAG_PAIRING *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "tagGroupId") { ss << ref->tagGroupId << "^"; }
		else if (headers[i] == "base") { ss << joinStrList(ref->base, "|") << "^"; }
		else if (headers[i] == "pairingLength") { ss << ref->pairingLength << "^"; }
		else if (headers[i] == "avgBlhLow") { ss << ref->avgBlhLow << "^"; }
		else if (headers[i] == "avgBlhHigh") { ss << ref->avgBlhHigh << "^"; }
		else if (headers[i] == "layover") { ss << ref->layover << "^"; }
		else if (headers[i] == "createdBy") { ss << "^"; }
		else if (headers[i] == "createdDt") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "id") { ss << "^"; }
		else { logUnkonwnField("tagPairing", headers[i]); }
	}
	return ss.str();

}


void tagPairingParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TAG_PAIRING * ref = (TAG_PAIRING *)obj;
	if (headers[index] == "tagGroupId") { ref->tagGroupId = atoll(value); }
	else if (headers[index] == "base") { split(value, '|', ref->base); }
	else if (headers[index] == "pairingLength") { ref->pairingLength = value; }
	else if (headers[index] == "avgBlhLow") { ref->avgBlhLow = value; }
	else if (headers[index] == "avgBlhHigh") { ref->avgBlhHigh = value; }
	else if (headers[index] == "avgBlockPerSegLow") { ref->avgBlockPerSegLow = value; }
	else if (headers[index] == "avgBlockPerSegHigh") { ref->avgBlockPerSegHigh = value; }
	else if (headers[index] == "layover") { ref->layover = value; }
	else if (headers[index] == "assignmentGroup") { split(value, '|', ref->assignmentGroup); }
	else if (headers[index] == "overNightDayStart") { ref->overNightDayStart = strcmp(value, "") == 0 ? -1 : atoi(value); }
	else if (headers[index] == "overNightDayEnd") { ref->overNightDayEnd = strcmp(value, "") == 0 ? -1 : atoi(value); }
	else if (headers[index] == "pairingDayStart") { ref->pairingDaysStart = strcmp(value, "") == 0 ? -1 : atoi(value); }
	else if (headers[index] == "pairingDayEnd") { ref->pairingDayEnd = strcmp(value, "") == 0 ? -1 : atoi(value); }
	else if (headers[index] == "layoverDurationStart") { ref->layoverDurationStart = value; }
	else if (headers[index] == "layoverDurationEnd") { ref->layoverDurationEnd = value; }
	else if (headers[index] == "atDoStart") { ref->atdoStart = strcmp(value, "") == 0 ? -1 : atoi(value); }
	else if (headers[index] == "atDoEnd") { ref->atdoEnd = strcmp(value, "") == 0 ? -1 : atoi(value); }
	else if (headers[index] == "exDoStart") { ref->exdoStart = strcmp(value, "") == 0 ? -1 : atoi(value); }
	else if (headers[index] == "exDoEnd") { ref->exdoEnd = strcmp(value, "") == 0 ? -1 : atoi(value); }
	else if (headers[index] == "createdBy") {}
	else if (headers[index] == "createdDt") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "id") {}
	else if (headers[index] == "transitDurationStart") {}
	else if (headers[index] == "transitDurationEnd") {}
	else if (headers[index] == "transitAirports") {}
	else if (headers[index] == "layoverCountry") {
		string valueStr = value;
		if (valueStr.find("!(") == string::npos) {
			split(valueStr, '|', ref->layoverCountries);
		}
		else {
			string except = valueStr.substr(2, valueStr.size() - 3);
			split(except, '|', ref->exceptLayoverCountries);
		}
	}
	else { logUnkonwnField("tagPairing", headers[index]); }

}