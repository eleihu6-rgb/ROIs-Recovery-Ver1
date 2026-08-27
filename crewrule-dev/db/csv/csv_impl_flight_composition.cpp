#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "csv_impl.h"

void flightCompositionParser::init(vector<string>& headers) {}


string flightCompositionParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	csvActivityComposition * ref = (csvActivityComposition *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "schId") { ss << ref->scenarioId << "^"; }
		else if (headers[i] == "fltId") { ss << ref->activityId << "^"; }
		else if (headers[i] == "division") { ss << ref->division << "^"; }
		else if (headers[i] == "multiplier") { ss << ref->multipler << "^"; }
		else if (headers[i] == "compId") { ss << ref->compId << "^"; }
		else if (headers[i] == "actingRank") { ss << ref->actingRank << "^"; }
		else if (headers[i] == "planValue") { ss << ref->planValue << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "pairingScenarioId") { ss << ref->pairingScenarioId << "^"; }
		else { logUnkonwnField("flight_composition", headers[i]); }
	}
	return ss.str();
}

void flightCompositionParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	csvActivityComposition * ref = (csvActivityComposition *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "schId") {  }
	else if (headers[index] == "fltId") { ref->activityId = atoll(value); }
	else if (headers[index] == "division") { ref->division = value[0]; }
	else if (headers[index] == "multiplier") { ref->multipler = atoi(value); }
	else if (headers[index] == "compId") { ref->compId = atoll(value); }
	else if (headers[index] == "actingRank") { ref->actingRank = value; }
	else if (headers[index] == "planValue") { ref->planValue = atoi(value); }


	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "pairingScenarioId") { ref->pairingScenarioId = atoll(value); }
	else { logUnkonwnField("flight_composition", headers[index]); }
	
}

void* flightCompositionParser::createInstance() {
	return new csvActivityComposition();
}

void flightCompositionParser::deleteInstance(void* obj) {
	delete (csvActivityComposition*)obj;
}

static vector<string> flightCompositionDefaultHeaders = {"id", "schId","fltId", "division", "multiplier", "compId", "actingRank", "planValue", "lastModified","modifiedBy", "pairingScenarioId" };
vector<string>& flightCompositionParser::getDefaultHeaders() {
	return flightCompositionDefaultHeaders;
}