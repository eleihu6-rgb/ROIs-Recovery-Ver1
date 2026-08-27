#include <sstream>
#include "Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void imbalanceFlightParser::init(vector<string>& headers) {}


static vector<string> imbalanceFlightDefaultHeaders = { "scenarioId", "flightId", "user", "tmst" };
vector<string>& imbalanceFlightParser::getDefaultHeaders() {
	return imbalanceFlightDefaultHeaders;
}

void* imbalanceFlightParser::createInstance() {
	return new csvImblanceFlight();
}

void imbalanceFlightParser::deleteInstance(void* obj) {
	delete (csvImblanceFlight*)obj;
}

string imbalanceFlightParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	csvImblanceFlight * ref = (csvImblanceFlight *)obj;
	//"id", "imbalanceFlight", "imbalanceFlightName", "imbalanceFlightNativeName", "imbalanceFlight4code", "imbalanceFlightAbbr", "city", "cityName", "cityNativeName", "category", "dir", "zoneId"
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "scenarioId") { ss << ref->scenarioId << ","; }
		else if (headers[i] == "flightId") { ss << ref->flightId << ","; }
		else if (headers[i] == "user") { ss << ref->user << ","; }
		else if (headers[i] == "tmst") { ss << utcToUtcTzString(ref->tmst); }
		else { logUnkonwnField("imbalance_flight", headers[i]); }
	}
	return ss.str();
}

void imbalanceFlightParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	csvImblanceFlight * ref = (csvImblanceFlight *)obj;
	if (headers[index] == "scenarioId") {}
	else if (headers[index] == "flightId") {}
	else if (headers[index] == "user") {}
	else if (headers[index] == "tmst") {}
	else { logUnkonwnField("imbalance_flight", headers[index]); }
}

