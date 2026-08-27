#include <sstream>
#include <string.h>
#include "../CrewDB.h"
#include "UtilFunc.h"
#include "csv_impl.h"

void crewRpRecencyParser::init(vector<string>& headers) {}


string crewRpRecencyParser::toCsv(vector<string>& headers, void* obj) {
	//"", "", "", "", "", "
	stringstream ss;
	CrewRpRecency * ref = (CrewRpRecency *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "crewId") { ss << ref->idCrew << "^"; }
		else if (headers[i] == "rpName") { ss << ref->rpName << "^"; }
		else if (headers[i] == "rpStart") { ss << utcToUtcTzString(ref->rpStart) << "^"; }
		else if (headers[i] == "rpEnd") { ss << utcToUtcTzString(ref->rpEnd) << "^"; }
		else if (headers[i] == "types") { ss << ref->types << "^"; }
		else if (headers[i] == "fleet") { ss << ref->fleet << "^"; }
		else if (headers[i] == "fleetGroup") { ss << ref->fleetGroup << "^"; }
		else if (headers[i] == "airport") { ss << ref->airport << "^"; }
		else if (headers[i] == "airportTimes") { ss << ref->airportTimes << "^"; }
		else if (headers[i] == "blkMin") { ss << ref->blkMin << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("CrewRpRecency", headers[i]); }
	}
	return ss.str();
}

void crewRpRecencyParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CrewRpRecency * ref = (CrewRpRecency *)obj;
	if (headers[index] == "id") { }
	else if (headers[index] == "crewId") { ref->idCrew = value; }
	else if (headers[index] == "rpName") { ref->rpName = value; }
	else if (headers[index] == "rpStart") { ref->rpStart = utcStrToUtc(value); }
	else if (headers[index] == "rpEnd") { ref->rpEnd = utcStrToUtc(value); }
	else if (headers[index] == "types") { ref->types = value; }
	else if (headers[index] == "fleet") { ref->fleet = value; }
	else if (headers[index] == "fleetGroup") { ref->fleetGroup = value; }
	else if (headers[index] == "airport") { ref->airport = value; }
	else if (headers[index] == "airportTimes") { ref->airportTimes = atoi(value); }
	else if (headers[index] == "blkMin") { ref->blkMin = atoi(value); }
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else { logUnkonwnField("CrewRpRecency", headers[index]); }
}

void* crewRpRecencyParser::createInstance() {
	return new CrewRpRecency();
}

void crewRpRecencyParser::deleteInstance(void* obj) {
	delete (CrewRpRecency*)obj;
}

static vector<string> crewRpRecencyDefaultHeaders = { "id","crewId","rpName","rpStart","rpEnd","types","fleet","fleetGroup","airport","airportTimes","blkMin","modifiedBy","lastModified" };
vector<string>& crewRpRecencyParser::getDefaultHeaders() {
	return crewRpRecencyDefaultHeaders;
}