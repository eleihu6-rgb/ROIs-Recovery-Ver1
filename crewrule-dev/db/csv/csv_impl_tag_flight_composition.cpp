#pragma once

#include <string.h>

#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"
//aircraftParser

void tagFlightCompositionParser::init(vector<string>& headers) {}


static vector<string> tagFlightCompositionDefaultHeaders = { "tagGroupId", "division", "actingRank", "minValue", "maxValue","lastModified", "modifiedBy","id" };
vector<string>& tagFlightCompositionParser::getDefaultHeaders() {
	return tagFlightCompositionDefaultHeaders;
}

void* tagFlightCompositionParser::createInstance() {
	return new TAG_FLIGHT_COMPOSITION();
}

void tagFlightCompositionParser::deleteInstance(void* obj) {
	delete (TAG_FLIGHT_COMPOSITION*)obj;
}


string tagFlightCompositionParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TAG_FLIGHT_COMPOSITION* ref = (TAG_FLIGHT_COMPOSITION*)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "tagGroupId") { ss << ref->tagGroupId << "^"; }
		else if (headers[i] == "division") { ss << ref->division << "^"; }
		else if (headers[i] == "actingRank") { ss << joinStrList(ref->actingRank, "|") << "^"; }
		else if (headers[i] == "minValue") { ss << ref->minValue << "^"; }
		else if (headers[i] == "maxValue") { ss << ref->maxValue << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "id") { ss << "^"; }
		else { logUnkonwnField("tagFlightComposition", headers[i]); }
	}
	return ss.str();

}


void tagFlightCompositionParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TAG_FLIGHT_COMPOSITION* ref = (TAG_FLIGHT_COMPOSITION*)obj;
	if (headers[index] == "tagGroupId") { ref->tagGroupId = atoll(value); }
	else if (headers[index] == "division") { ref->division = value; }
	else if (headers[index] == "actingRank") { split(value, '|', ref->actingRank); }
	else if (headers[index] == "minValue") { ref->minValue = stoi(value); }
	else if (headers[index] == "maxValue") { ref->maxValue = stoi(value); }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "id") {}
	else { logUnkonwnField("tagFlightComposition", headers[index]); }

}