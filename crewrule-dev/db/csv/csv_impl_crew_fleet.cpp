#include <sstream>
#include <string.h>
#include "../CrewDB.h"
#include "UtilFunc.h"
#include "csv_impl.h"

void crewFleetParser::init(vector<string>& headers) {}


string crewFleetParser::toCsv(vector<string>& headers, void* obj) {
	//"id", "crewId", "", "effDt", "expDt
	stringstream ss;
	CREW_FLEET * ref = (CREW_FLEET *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "crewId") { ss << ref->idCrew << "^"; }
		else if (headers[i] == "fleet") { ss << ref->fleet << "^"; }
		else if (headers[i] == "effDt") { ss << utcToUtcTzString(ref->effUtc) << "^"; }
		else if (headers[i] == "expDt") { ss << utcToUtcTzString(ref->expUtc) << "^"; }
		else { logUnkonwnField("crew_fleet", headers[i]); }
	}
	return ss.str();
}

void crewFleetParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CREW_FLEET * ref = (CREW_FLEET *)obj;

	if (headers[index] == "id") {}
	else if (headers[index] == "crewId") { ref->idCrew = value; }
	else if (headers[index] == "fleet") { ref->fleet = value; }
	else if (headers[index] == "fleetSpecific") { ref->fleet = value; }
	else if (headers[index] == "effDt") { ref->effUtc = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "expDt") { ref->expUtc = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "fleetGrp") {}
	else if (headers[index] == "interfaceCrewFleetId") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "acType") {}
	else { logUnkonwnField("crew_fleet", headers[index]); }
}

void* crewFleetParser::createInstance() {
	return new CREW_FLEET();
}

void crewFleetParser::deleteInstance(void* obj) {
	delete (CREW_FLEET*)obj;
}

static vector<string> crewFleetDefaultHeaders = { "id", "crewId", "fleet", "effDt", "expDt" };
vector<string>& crewFleetParser::getDefaultHeaders() {
	return crewFleetDefaultHeaders;
}