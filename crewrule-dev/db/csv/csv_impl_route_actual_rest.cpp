#include <sstream>
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void routeActualRestParser::init(vector<string>& headers) {}


static vector<string> baseDefaultHeaders = { "id", "airline", "fltNum", "depArp", "arvArp", "schDepDtLoc", "schArvDtLoc", "crewId", "restTime" };
vector<string>& routeActualRestParser::getDefaultHeaders() {
	return baseDefaultHeaders;
}

void* routeActualRestParser::createInstance() {
	return new RouteActualRest();
}

void routeActualRestParser::deleteInstance(void* obj) {
	delete (RouteActualRest*)obj;
}

string routeActualRestParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	RouteActualRest * ref = (RouteActualRest *)obj;
	//"", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "airline") { ss << ref->airline << "^"; }
		else if (headers[i] == "fltNum") { ss << ref->fltNum << "^"; }
		else if (headers[i] == "depArp") { ss << ref->depArp << "^"; }
		else if (headers[i] == "arvArp") { ss << ref->arvArp << "^"; }
		else if (headers[i] == "crewId") { ss << ref->crewId << "^"; }
		else if (headers[i] == "restTime") { ss << ref->restTime << "^"; }
		else if (headers[i] == "schDepDtLoc") { ss << utcToUtcTzString(ref->schDepDtLoc) << "^"; }
		else if (headers[i] == "schArvDtLoc") { ss << utcToUtcTzString(ref->schArvDtLoc) << "^"; }
		else { logUnkonwnField("route_actual_rest", headers[i]); }
	}
	return ss.str();
}

void routeActualRestParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	RouteActualRest * ref = (RouteActualRest *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "airline") { ref->airline = value; }
	else if (headers[index] == "fltNum") { ref->fltNum = value; }
	else if (headers[index] == "depArp") { ref->depArp = value; }
	else if (headers[index] == "arvArp") { ref->arvArp = value; }
	else if (headers[index] == "crewId") { ref->crewId = value; }
	else if (headers[index] == "restTime") { ref->restTime = atoi(value); }
	else if (headers[index] == "schDepDtLoc") { ref->schDepDtLoc = utcStrToUtc(value) ; }
	else if (headers[index] == "schArvDtLoc") { ref->schArvDtLoc = utcStrToUtc(value); }
	else { logUnkonwnField("route_actual_rest", headers[index]); }
}

