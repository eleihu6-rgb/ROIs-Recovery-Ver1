#include <sstream>
#include "UtilFunc.h"
#include "../RecencyMgr.h"
#include "csv_impl.h"

static vector<string> fleetRecencyHeaders = { "id", "crewId", "fleetSpecific", "effDt", "expDt", "acType", "fleetGrp" };
vector<string>& fleetRecencyParser::getDefaultHeaders() {
	return fleetRecencyHeaders;
}

void fleetRecencyParser::init(vector<string>& headers) {}

void* fleetRecencyParser::createInstance() {
	return new CrewFleetRecency();
}

void fleetRecencyParser::deleteInstance(void* obj) {
	delete (CrewFleetRecency*)obj;
}

string fleetRecencyParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	CrewFleetRecency * ref = (CrewFleetRecency *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "crewId") { ss << ref->crewId << "^"; }
		else if (headers[i] == "fleetSpecific") { ss << ref->fleetSpecific << "^"; }
		else if (headers[i] == "effDt") { ss << utcToUtcDtString(ref->effDt) << "^"; }
		else if (headers[i] == "expDt") { ss << utcToUtcDtString(ref->expDt) << "^"; }
		else if (headers[i] == "acType") { ss << ref->acType << "^"; }
		else if (headers[i] == "fleetGrp") { ss << ref->fleetGrp << "^"; }
		else { logUnkonwnField("crew_fleet_recency", headers[i]); }
	}
	return ss.str();
}

void fleetRecencyParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CrewFleetRecency * ref = (CrewFleetRecency *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "crewId") { ref->crewId = value; }
	else if (headers[index] == "fleetSpecific") { ref->fleetSpecific = value; }
	else if (headers[index] == "effDt") { ref->effDt = utcStrToUtc(value); }
	else if (headers[index] == "expDt") { ref->expDt = utcStrToUtc(value); }
	else if (headers[index] == "acType") { ref->acType = value; }
	else if (headers[index] == "fleetGrp") { ref->fleetGrp = value; }
	else { logUnkonwnField("crew_fleet_recency", headers[index]); }
}

