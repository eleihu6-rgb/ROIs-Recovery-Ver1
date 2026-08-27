#include <sstream>
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void routeRaditionConfigParser::init(vector<string>& headers) {}


static vector<string> routeRaditionConfigDefaultHeaders = { "id", "filiale", "fleet", "depArp", "arvArp", "effDt", "expDt", "radiationDose" };
vector<string>& routeRaditionConfigParser::getDefaultHeaders() {
	return routeRaditionConfigDefaultHeaders;
}

void* routeRaditionConfigParser::createInstance() {
	return new RouteRadiationConfig();
}

void routeRaditionConfigParser::deleteInstance(void* obj) {
	delete (RouteRadiationConfig*)obj;
}

string routeRaditionConfigParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	RouteRadiationConfig* ref = (RouteRadiationConfig*)obj;
	//"", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "filiale") { ss << ref->filiale << "^"; }
		else if (headers[i] == "fleet") { ss << ref->fleet << "^"; }
		else if (headers[i] == "depArp") { ss << ref->depArp << "^"; }
		else if (headers[i] == "arvArp") { ss << ref->arvArp << "^"; }
		else if (headers[i] == "radiationDose") { ss << ref->radiationDose << "^"; }
		else if (headers[i] == "effDt") { ss << utcToUtcTzString(ref->effDt) << "^"; }
		else if (headers[i] == "expDt") { ss << utcToUtcTzString(ref->expDt) << "^"; }
		else { logUnkonwnField("route_radiation_config", headers[i]); }
	}
	return ss.str();
}

void routeRaditionConfigParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	RouteRadiationConfig* ref = (RouteRadiationConfig*)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "filiale") { ref->filiale = value; }
	else if (headers[index] == "fleet") { ref->fleet = value; }
	else if (headers[index] == "depArp") { ref->depArp = value; }
	else if (headers[index] == "arvArp") { ref->arvArp = value; }
	else if (headers[index] == "radiationDose") { ref->radiationDose = stod(value); }
	else if (headers[index] == "effDt") { ref->effDt = utcStrToUtc(value); }
	else if (headers[index] == "expDt") { ref->expDt = utcStrToUtc(value); }
	else { logUnkonwnField("route_radiation_config", headers[index]); }
}

