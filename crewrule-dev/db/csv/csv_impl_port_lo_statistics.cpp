#include <sstream>
#include <memory.h>
#include "../CrewDB.h"
#include "UtilFunc.h"
#include "csv_impl.h"
#include "../PortLOStatistics.h"

void portLOStatisticsParser::init(vector<string>& headers) {}

static vector<string> PortLOStatisticsDefaultHeaders = { "id", "crewId", "layloverPort", "layloverCount", "startDate", "endDate"};
vector<string>& portLOStatisticsParser::getDefaultHeaders() {
    return PortLOStatisticsDefaultHeaders;
}
void* portLOStatisticsParser::createInstance() {
    return new PORT_LO_STATISTICS();
}

void portLOStatisticsParser::deleteInstance(void* obj) {
    delete (PORT_LO_STATISTICS*)obj;
}

string portLOStatisticsParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	PORT_LO_STATISTICS* ref = (PORT_LO_STATISTICS*)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "crewId") { ss << ref->crewId << "^"; }
		else if (headers[i] == "layloverPort") { ss << ref->layoverPort << "^"; }
		else if (headers[i] == "layloverCount") { ss << ref->layoverCount << "^"; }
		else if (headers[i] == "type") { ss << ref->type << "^"; }
		else if (headers[i] == "startDate") { ss << utcToUtcTzString(ref->startDate) << "^"; }
        else if (headers[i] == "endDate") { ss << utcToUtcTzString(ref->endDate) << "^";}
		else if (headers[i] == "flightNum") { ss << utcToUtcTzString(ref->endDate) << "^"; }
        else { cout << "ERROR: invalid port layover statistics data, unknown field '" << headers[i] << "'\n"; }
    }
	return ss.str();
}

void portLOStatisticsParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	PORT_LO_STATISTICS* ref = (PORT_LO_STATISTICS*)obj;
	if (headers[index] == "id") { ref->id = value; }
	else if (headers[index] == "crewId") { ref->crewId = value; }
	else if (headers[index] == "layloverPort") { ref->layoverPort = value; }
	else if (headers[index] == "layloverCount") { ref->layoverCount = atoi(value); }
	else if (headers[index] == "type") { ref->type = value; }
	else if (headers[index] == "startDate") { ref->startDate = utcStrToUtc(value); }
	else if (headers[index] == "endDate") { ref->endDate = utcStrToUtc(value); }
	else if (headers[index] == "flightNum") { ref->flightNumber= value; }
    else { cout << "ERROR: invalid port layover statistics data, unknown field '" << headers[index] << "'\n"; }

}

