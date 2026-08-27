#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void crewFlyTogetherParser::init(vector<string>& headers) {}


static vector<string> crewFlyTogetherDefaultHeaders = { "crewIdA", "crewIdB", "flyTogetherIndicator", "reason", "effectiveDate", "expiryDate",
"restrictionType","id","airports","attributes"};
vector<string>& crewFlyTogetherParser::getDefaultHeaders() {
	return crewFlyTogetherDefaultHeaders;
}

void* crewFlyTogetherParser::createInstance() {
	return new CREW_FLY_TOGETHER();
}

void crewFlyTogetherParser::deleteInstance(void* obj) {
	delete (CREW_FLY_TOGETHER*)obj;
}

string crewFlyTogetherParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	CREW_FLY_TOGETHER* ref = (CREW_FLY_TOGETHER*)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "crewIdA") { ss << ref->crewIdA << "^"; }
		else if (headers[i] == "crewIdB") { ss << ref->crewIdB << "^"; }
		else if (headers[i] == "flyTogetherIndicator") { ss << ref->flyTogetherIndicator << "^"; }
		else if (headers[i] == "reason") { ss << ref->reason << "^"; }
		else if (headers[i] == "effectiveDate") { ss << ref->effectiveDate << "^"; }
		else if (headers[i] == "expiryDate") { ss << ref->expiryDate << "^"; }
		else if (headers[i] == "restrictionType") { ss << ref->restrictionType << "^"; }
		else if (headers[i] == "airports") { ss << ref->strAirports << "^"; }
		else if (headers[i] == "attributes") { ss << ref->strAttributes << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "id") { ss << "^"; }
		else { logUnkonwnField("crew_fly_together", headers[i]); }
	}
	return ss.str();
}

void crewFlyTogetherParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CREW_FLY_TOGETHER* ref = (CREW_FLY_TOGETHER*)obj;
	if (headers[index] == "crewIdA") { ref->crewIdA = value; }
	else if (headers[index] == "crewIdB") { ref->crewIdB = value; }
	else if (headers[index] == "flyTogetherIndicator") { ref->flyTogetherIndicator = value; }
	else if (headers[index] == "reason") { ref->reason = value; }
	else if (headers[index] == "effectiveDate") { ref->effectiveDate = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "expiryDate") { ref->expiryDate = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "restrictionType") { ref->restrictionType = value; split(value, '|', ref->restrictionTypeList); }
	else if (headers[index] == "airports") { ref->strAirports = value; split(value, '|', ref->airports); }
	else if (headers[index] == "attributes") { ref->strAttributes = value; split(value, '|', ref->attributes); }
	else if (headers[index] == "crewNameA") {}
	else if (headers[index] == "crewNameB") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "id") {}
	else if (headers[index] == "type") {}
	else { logUnkonwnField("crew_fly_together", headers[index]); }
}

