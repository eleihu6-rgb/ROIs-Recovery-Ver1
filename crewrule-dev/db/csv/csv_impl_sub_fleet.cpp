#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

static vector<string> subFleetDefaultHeaders = { "subFleet", "iataAircraftType", "aircraftOwner", "restFacility", "ccRestFacility", "lastModified", "modifiedBy", "id" };
vector<string>& subFleetParser::getDefaultHeaders() {
	return subFleetDefaultHeaders;
}

void subFleetParser::init(vector<string>& headers) {}

void* subFleetParser::createInstance() {
	return new SUB_FLEET();
}

void subFleetParser::deleteInstance(void* obj) {
	delete (SUB_FLEET*)obj;
}

string subFleetParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	SUB_FLEET* ref = (SUB_FLEET*)obj;
	//"", "", "", "", ""
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "subFleet") { ss << ref->subFleet << "^"; }
		else if (headers[i] == "iataAircraftType") { ss << ref->iataAircraftType << "^"; }
		else if (headers[i] == "aircraftOwner") { ss << ref->aircraftOwner << "^"; }
		else if (headers[i] == "restFacility") { ss << ref->restFacility << "^"; }
		else if (headers[i] == "ccRestFacility") { ss << ref->ccRestFacility << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "id") { ss << "^"; }
		else { logUnkonwnField("sub_fleet", headers[i]); }
	}
	return ss.str();
}

void subFleetParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	SUB_FLEET* ref = (SUB_FLEET*)obj;

	if (headers[index] == "subFleet") { ref->subFleet = value; }
	else if (headers[index] == "iataAircraftType") { ref->iataAircraftType = value; }
	else if (headers[index] == "aircraftOwner") { ref->aircraftOwner = value; }
	else if (headers[index] == "restFacility") { ref->restFacility = atoi(value); }
	else if (headers[index] == "ccRestFacility") { ref->ccRestFacility = atoi(value); }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "id") {}
	else { logUnkonwnField("sub_fleet", headers[index]); }
}

