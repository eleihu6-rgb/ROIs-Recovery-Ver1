#include <sstream>
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void routeParser::init(vector<string>& headers) {}


static vector<string> routeDefaultHeaders = { "id", "routeId", "airline", "fltNum", "depArp", "arvArp",
"flightFlag", "flightAssignment", "fltDtStart", "fltDtEnd", "stdStart", "stdEnd", "fleetGrp", "fleet", "register", "segSeq", 
"segType", "lastModified", "modifiedBy" };
vector<string>& routeParser::getDefaultHeaders() {
	return routeDefaultHeaders;
}

void* routeParser::createInstance() {
	return new Route();
}

void routeParser::deleteInstance(void* obj) {
	delete (Route*)obj;
}

string routeParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	Route * ref = (Route *)obj;
	//"", "", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "routeId") { ss << ref->routeId << "^"; }
		else if (headers[i] == "airline") { ss << ref->airline << "^"; }
		else if (headers[i] == "fltNum") { ss << ref->fltNum << "^"; }
		else if (headers[i] == "depArp") { ss << ref->depArp << "^"; }
		else if (headers[i] == "arvArp") { ss << ref->arvArp << "^"; }
		else if (headers[i] == "segType") { ss << ref->segType << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "flightFlag") { ss << "^"; }
		else if (headers[i] == "flightAssignment") { ss << "^"; }
		else if (headers[i] == "fltDtStart") { ss << utcToUtcTzString(ref->flt_dt_start) << "^"; }
		else if (headers[i] == "fltDtEnd") { ss << utcToUtcTzString(ref->flt_dt_end) << "^"; }
		else if (headers[i] == "stdStart") { ss << "^"; }
		else if (headers[i] == "stdEnd") { ss << "^"; }
		else if (headers[i] == "fleetGrp") { ss << "^"; }
		else if (headers[i] == "fleet") { ss << "^"; }
		else if (headers[i] == "register") { ss << "^"; }
		else if (headers[i] == "segSeq") { ss << "^"; }
		else { logUnkonwnField("route", headers[i]); }
	}
	return ss.str();
}

void routeParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	Route * ref = (Route *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "routeId") { ref->routeId = atoll(value); }
	else if (headers[index] == "airline") { ref->airline = value; }
	else if (headers[index] == "fltNum") { ref->fltNum = value; }
	else if (headers[index] == "depArp") { ref->depArp = value; }
	else if (headers[index] == "arvArp") { ref->arvArp = value; }
	else if (headers[index] == "segType") { ref->segType = value; }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}

	else if (headers[index] == "flightFlag") {}
	else if (headers[index] == "flightAssignment") {}
	else if (headers[index] == "fltDtStart") { ref->flt_dt_start = utcStrToUtc(value); }
	else if (headers[index] == "fltDtEnd") { ref->flt_dt_end = utcStrToUtc(value); }
	else if (headers[index] == "stdStart") {}
	else if (headers[index] == "stdEnd") {}
	else if (headers[index] == "fleetGrp") {}
	else if (headers[index] == "fleet") {}
	else if (headers[index] == "register") {}
	else if (headers[index] == "segSeq") {}
	else if (headers[index] == "maxBlh") {}
	else if (headers[index] == "minBlh") {}
	else if (headers[index] == "filiale") {}
	else { logUnkonwnField("route", headers[index]); }
}

