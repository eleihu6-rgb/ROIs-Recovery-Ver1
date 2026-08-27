#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "csv_impl.h"

void pairingCompositionParser::init(vector<string>& headers) {}


string pairingCompositionParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	csvActivityComposition * ref = (csvActivityComposition *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "scenarioId" || headers[i] == "schId") { ss << ref->scenarioId << "^"; }
		else if (headers[i] == "pairingId") { ss << ref->activityId << "^"; }
		else if (headers[i] == "division") { ss << ref->division << "^"; }
		else if (headers[i] == "multiplier") { ss << ref->multipler << "^"; }
		else if (headers[i] == "compositionId") { ss << ref->compId << "^"; }
		else if (headers[i] == "actingRank") { ss << ref->actingRank << "^"; }
		else if (headers[i] == "planValue") { ss << ref->planValue << "^"; }

		else if (headers[i] == "isDeleted") { ss << "false^"; } //default false
		else if (headers[i] == "ver") { ss << "^"; }
		else if (headers[i] == "isDeleted") { ss << "^"; }
		else if (headers[i] == "createdBy") { ss << "^"; }
		else if (headers[i] == "createdDt") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else { logUnkonwnField("pairing_composition", headers[i]); }
	}
	return ss.str();
}

void pairingCompositionParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	csvActivityComposition * ref = (csvActivityComposition *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "scenarioId" || headers[index] == "schId") { ref->scenarioId = atoll(value); }
	else if (headers[index] == "pairingId") { ref->activityId = atoll(value); }
	else if (headers[index] == "division") { ref->division = value[0]; }
	else if (headers[index] == "multiplier") { ref->multipler = atoi(value); }
	else if (headers[index] == "compositionId") { ref->compId = atoll(value); }
	else if (headers[index] == "actingRank") { ref->actingRank = value; }
	else if (headers[index] == "planValue") { ref->planValue = atoi(value); }

	else if (headers[index] == "isDeleted") {}
	else if (headers[index] == "createdBy") {}
	else if (headers[index] == "createdDt") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "ver") {}
	else { logUnkonwnField("pairing_composition", headers[index]); }

}

void* pairingCompositionParser::createInstance() {
	return new csvActivityComposition();
}

void pairingCompositionParser::deleteInstance(void* obj) {
	delete (csvActivityComposition*)obj;
}

static vector<string> pairingCompositionDefaultHeaders = { "id", "pairingId", "scenarioId", "division", "multiplier",
"compositionId", "actingRank", "planValue", "isDeleted", "ver", "createdBy", "createdDt", "modifiedBy", "lastModified" };
vector<string>& pairingCompositionParser::getDefaultHeaders() {
	return pairingCompositionDefaultHeaders;
}