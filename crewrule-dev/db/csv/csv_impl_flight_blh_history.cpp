#include <sstream>
#include "Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void flightBlhHistoryParser::init(vector<string>& headers) {}


static vector<string> flightBlhHistoryDefaultHeaders = { "id", "airline", "fleet", "depArp", "arvArp", "blkMin" };
vector<string>& flightBlhHistoryParser::getDefaultHeaders() {
	return flightBlhHistoryDefaultHeaders;
}

void* flightBlhHistoryParser::createInstance() {
	return new csvFlightBlhHistory();
}

void flightBlhHistoryParser::deleteInstance(void* obj) {
	delete (csvFlightBlhHistory*)obj;
}

string flightBlhHistoryParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	csvFlightBlhHistory * ref = (csvFlightBlhHistory *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << ","; }
		else if (headers[i] == "airline") { ss << ref->airline << ","; }
		else if (headers[i] == "fleet") { ss << ref->fleet << ","; }
		else if (headers[i] == "depArp") { ss << ref->depArp << ","; }
		else if (headers[i] == "arvArp") { ss << ref->arvArp << ","; }
		else if (headers[i] == "blkMin") { ss << ref->blkMin << ","; }
		else { logUnkonwnField("flight_blh_history", headers[i]); }
	}
	return ss.str();
}

void flightBlhHistoryParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	csvFlightBlhHistory * ref = (csvFlightBlhHistory *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "airline") { ref->airline = value; }
	else if (headers[index] == "fleet") { ref->fleet = value; }
	else if (headers[index] == "depArp") { ref->depArp = value; }
	else if (headers[index] == "arvArp") { ref->arvArp = value; }
	else if (headers[index] == "blkMin") { ref->blkMin = atoi(value); }
	else if (headers[index] == "filiale") { }
	else if (headers[index] == "lastModified") { }
	else if (headers[index] == "modifiedBy") { }
	else { logUnkonwnField("flight_blh_history", headers[index]); }
}

