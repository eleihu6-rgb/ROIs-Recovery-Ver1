#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void crewFlyPreferenceParser::init(vector<string>& headers) {}


static vector<string> crewFlyPreferenceDefaultHeaders = { "crewId", "prefType", "dir", "priority", "soft", "flightNums", "stations", "attributes", "effectiveDate", "expiryDate",
"id" };
vector<string>& crewFlyPreferenceParser::getDefaultHeaders() {
	return crewFlyPreferenceDefaultHeaders;
}

void* crewFlyPreferenceParser::createInstance() {
	return new CREW_FLY_PREFERENCE();
}

void crewFlyPreferenceParser::deleteInstance(void* obj) {
	delete (CREW_FLY_PREFERENCE*)obj;
}

string crewFlyPreferenceParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	CREW_FLY_PREFERENCE* ref = (CREW_FLY_PREFERENCE*)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "crewId") { ss << ref->crewId << "^"; }
		else if (headers[i] == "prefType") { ss << ref->prefType << "^"; }
		else if (headers[i] == "dir") { ss << ref->dir << "^"; }
		else if (headers[i] == "priority") { ss << ref->priority << "^"; }
		else if (headers[i] == "soft") { ss << ref->soft << "^"; }
		else if (headers[i] == "flightNums") { ss << ref->flightNums << "^"; }
		else if (headers[i] == "stations") { ss << ref->stations << "^"; }
		else if (headers[i] == "attributes") { ss << ref->attributes << "^"; }
		else if (headers[i] == "effectiveDate") { ss << ref->effectiveDate << "^"; }
		else if (headers[i] == "expiryDate") { ss << ref->expiryDate << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "id") { ss << "^"; }
		else { logUnkonwnField("crew_fly_preference", headers[i]); }
	}
	return ss.str();
}

void crewFlyPreferenceParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CREW_FLY_PREFERENCE* ref = (CREW_FLY_PREFERENCE*)obj;
	if (headers[index] == "crewId") { ref->crewId = value; }
	else if (headers[index] == "prefType") { ref->prefType = atol(value); }
	else if (headers[index] == "priority") { ref->priority = atol(value); }
	else if (headers[index] == "dir") { ref->dir = value; }
	else if (headers[index] == "soft") { ref->soft = value; }
	else if (headers[index] == "flightNums") { ref->flightNums = value; }
	else if (headers[index] == "stations") { ref->stations = value; }
	else if (headers[index] == "attributes") { ref->attributes = value; }
	else if (headers[index] == "effectiveDate") { ref->effectiveDate = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "expiryDate") { ref->expiryDate = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "id") {}
	else if (headers[index] == "crewName") {}
	else { logUnkonwnField("crew_fly_preference", headers[index]); }
}

