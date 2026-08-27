#include <sstream>
#include <iomanip>
#include <cstring>
#include <string>

#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

namespace {

long long parseHhMmToMinutes(const char* s) {
	if (!s || !*s) {
		return 0;
	}
	const char* colon = std::strchr(s, ':');
	if (!colon) {
		return 0;
	}
	int hours = std::atoi(std::string(s, colon - s).c_str());
	int mins = std::atoi(colon + 1);
	return (long long)hours * 60 + mins;
}

void parseDepArrTimeRange(const char* s, long long& startMin, long long& endMin) {
	startMin = 0;
	endMin = 0;
	if (!s || !*s) {
		return;
	}
	std::string str(s);
	std::size_t dash = str.find('-');
	if (dash == std::string::npos) {
		return;
	}
	std::string left = str.substr(0, dash);
	std::string right = str.substr(dash + 1);
	startMin = parseHhMmToMinutes(left.c_str());
	endMin = parseHhMmToMinutes(right.c_str());
}

std::string minutesToHhMm(long long m) {
	long long hi = m / 60;
	long long mi = m % 60;
	std::stringstream ss;
	ss << std::setfill('0') << std::setw(2) << hi << ":" << std::setw(2) << mi;
	return ss.str();
}

std::string minutesToBlhHhhMm(long long m) {
	long long hi = m / 60;
	long long mi = m % 60;
	std::stringstream ss;
	ss << std::setfill('0') << std::setw(3) << hi << ":" << std::setw(2) << mi;
	return ss.str();
}

} // namespace

void compositionLoadParser::init(vector<string>& headers) {}

static vector<string> compositionLoadDefaultHeaders = {
	"id", "filiale", "division", "fltNum", "fleet", "subFleet", "flightFlag", "fltType", "segType",
	"routeId", "compId", "flightAssignment", "serviceType", "paxNum", "restFacility",
	"departureTime", "arrivalTime", "optionId", "blhLow", "blhUpper"
};

vector<string>& compositionLoadParser::getDefaultHeaders() {
	return compositionLoadDefaultHeaders;
}

void* compositionLoadParser::createInstance() {
	return new CompositionLoad();
}

void compositionLoadParser::deleteInstance(void* obj) {
	delete (CompositionLoad*)obj;
}

string compositionLoadParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	CompositionLoad* ref = (CompositionLoad*)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "filiale") { ss << ref->filiale << "^"; }
		else if (headers[i] == "division") { ss << ref->division << "^"; }
		else if (headers[i] == "fltNum") { ss << ref->fltNum << "^"; }
		else if (headers[i] == "fleet") { ss << ref->fleet << "^"; }
		else if (headers[i] == "subFleet") { ss << ref->subFleet << "^"; }
		else if (headers[i] == "flightFlag") { ss << ref->flightFlag << "^"; }
		else if (headers[i] == "fltType") { ss << ref->fltType << "^"; }
		else if (headers[i] == "segType") { ss << ref->segType << "^"; }
		else if (headers[i] == "routeId") { ss << ref->routeId << "^"; }
		else if (headers[i] == "compId") { ss << ref->compId << "^"; }
		else if (headers[i] == "flightAssignment") { ss << ref->flightAssignment << "^"; }
		else if (headers[i] == "serviceType") { ss << ref->serviceType << "^"; }
		else if (headers[i] == "paxNum") { ss << ref->paxNum << "^"; }
		else if (headers[i] == "restFacility") { ss << ref->restFacility << "^"; }
		else if (headers[i] == "departureTime") {
			ss << minutesToHhMm(ref->departureTimeStart) << "-" << minutesToHhMm(ref->departureTimeEnd) << "^";
		}
		else if (headers[i] == "arrivalTime") {
			ss << minutesToHhMm(ref->arrivalTimeStart) << "-" << minutesToHhMm(ref->arrivalTimeEnd) << "^";
		}
		else if (headers[i] == "optionId") { ss << ref->optionId << "^"; }
		else if (headers[i] == "blhLow") { ss << minutesToBlhHhhMm(ref->blhLow) << "^"; }
		else if (headers[i] == "blhUpper") { ss << minutesToBlhHhhMm(ref->blhUpper) << "^"; }
		else { logUnkonwnField("composition_load", headers[i]); }
	}
	return ss.str();
}

void compositionLoadParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CompositionLoad* ref = (CompositionLoad*)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "filiale") { ref->filiale = value; }
	else if (headers[index] == "division") { ref->division = value; }
	else if (headers[index] == "fltNum") {
		ref->fltNum = value;
		ref->fltNumVec.clear();
		split(value, '|', ref->fltNumVec);
	}
	else if (headers[index] == "fleet") {
		ref->fleet = value;
		ref->fleetVec.clear();
		split(value, '|', ref->fleetVec);
	}
	else if (headers[index] == "subFleet") {
		ref->subFleet = value;
		ref->subFleetVec.clear();
		split(value, '|', ref->subFleetVec);
	}
	else if (headers[index] == "flightFlag") {
		ref->flightFlag = value;
		ref->flightFlagVec.clear();
		split(value, '|', ref->flightFlagVec);
	}
	else if (headers[index] == "fltType") {
		ref->fltType = value;
		ref->fltTypeVec.clear();
		split(value, '|', ref->fltTypeVec);
	}
	else if (headers[index] == "segType") {
		ref->segType = value;
		ref->segTypeVec.clear();
		split(value, '|', ref->segTypeVec);
	}
	else if (headers[index] == "routeId") { ref->routeId = atoll(value); }
	else if (headers[index] == "compId") { ref->compId = atoll(value); }
	else if (headers[index] == "flightAssignment") {
		ref->flightAssignment = value;
		ref->flightAssignmentVec.clear();
		split(value, '|', ref->flightAssignmentVec);
	}
	else if (headers[index] == "serviceType") {
		ref->serviceType = value;
		ref->serviceTypeVec.clear();
		split(value, '|', ref->serviceTypeVec);
	}
	else if (headers[index] == "paxNum") {
		ref->paxNum = value;
		ref->paxNumVec.clear();
		split(value, '|', ref->paxNumVec);
	}
	else if (headers[index] == "restFacility") { ref->restFacility = atoi(value); }
	else if (headers[index] == "departureTime") {
		parseDepArrTimeRange(value, ref->departureTimeStart, ref->departureTimeEnd);
	}
	else if (headers[index] == "arrivalTime") {
		parseDepArrTimeRange(value, ref->arrivalTimeStart, ref->arrivalTimeEnd);
	}
	else if (headers[index] == "optionId") { ref->optionId = atoll(value); }
	else if (headers[index] == "blhLow") { ref->blhLow = parseHhMmToMinutes(value); }
	else if (headers[index] == "blhUpper") { ref->blhUpper = parseHhMmToMinutes(value); }
	else { logUnkonwnField("composition_load", headers[index]); }
}
